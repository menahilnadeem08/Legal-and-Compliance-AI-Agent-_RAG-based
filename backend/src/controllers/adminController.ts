import { Response } from 'express';
import pool from '../config/database';
import { hashPassword, validatePassword } from '../utils/passwordUtils';
import { AuthenticatedRequest } from '../types';
import { EmailService } from '../utils/emailService';
import { TempPasswordService } from '../services/tempPasswordService';
import { AuditLogRepository } from '../repositories/auditLogRepository';
import logger from '../utils/logger';

// Create employee user (admin only)
// Generates temporary password and sends welcome email
export async function createEmployee(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.user || req.user.role !== 'admin') {
      res.status(403).json({ success: false, message: 'Only admins can create employees' });
      return;
    }

    const { username, email, name } = req.body;
    const adminId = req.user.id;
    const ipAddress = req.headers['x-forwarded-for'] as string || req.socket.remoteAddress || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';

    logger.info('Create employee request', { username, email, name, adminId });

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const existingUser = await client.query(
        'SELECT id FROM users WHERE username = $1',
        [username]
      );

      if (existingUser.rows.length > 0) {
        logger.warn('Create employee: username already exists', { username });
        res.status(409).json({ success: false, message: 'Username already exists' });
        return;
      }

      const existingEmail = await client.query(
        'SELECT id FROM users WHERE email = $1',
        [email]
      );

      if (existingEmail.rows.length > 0) {
        logger.warn('Create employee: email already exists', { email });
        res.status(409).json({ success: false, message: 'Email already exists' });
        return;
      }

      const tempPassword = TempPasswordService.generateSecurePassword();
      const tempPasswordHash = await hashPassword(tempPassword);

      // 2-hour expiry
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 2);

      const newUser = await client.query(
        `INSERT INTO users (
          username, password_hash, email, name, role, auth_provider, admin_id, is_active,
          is_temp_password, temp_password_expires_at, force_password_change, email_verified
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING id, username, email, name, role, is_active, created_at`,
        [
          username,
          tempPasswordHash,
          email,
          name || null,
          'employee',
          'local',
          adminId,
          true,
          true,           // is_temp_password = true
          expiresAt,      // temp_password_expires_at
          true,           // force_password_change = true
          true            // email_verified = true (admin vouches for the employee)
        ]
      );

      const user = newUser.rows[0];
      logger.info('Employee user created', { userId: user.id, username: user.username, email: user.email });

      await client.query('COMMIT');
      client.release();

      // Log audit event AFTER commit so the new user exists in the DB
      try {
        await AuditLogRepository.createLog(
          adminId,
          'EMPLOYEE_CREATED',
          user.id,
          'user',
          String(user.id),
          { 
            action: 'employee_created_with_temp_password',
            email: user.email,
            username: user.username,
            expiresAt: expiresAt.toISOString()
          },
          ipAddress,
          userAgent
        );
      } catch (auditError) {
        logger.warn('Create employee: audit log failed (non-critical)', { error: auditError });
      }
      
      try {
        // Get admin's name for the from field
        const adminResult = await pool.query(
          'SELECT name, email FROM users WHERE id = $1',
          [adminId]
        );
        const adminName = adminResult.rows[0]?.name || 'Administrator';
        const adminEmail = adminResult.rows[0]?.email || 'noreply@yourdomain.com';

        // Send welcome email with temp password
        await EmailService.sendEmployeeTempPasswordEmail(
          email,
          username,
          tempPassword,
          name || username,
          adminName,
          expiresAt
        );

        logger.info('Employee created', { username: user.username, email: user.email, role: user.role, createdBy: adminId });

        res.status(201).json({
          success: true,
          message: 'Employee created successfully',
          data: { employee: { id: user.id, username: user.username, email: user.email, name: user.name, role: user.role, is_active: user.is_active, created_at: user.created_at } },
        });
      } catch (emailError) {
        logger.warn('Create employee: welcome email failed', { error: emailError, userId: user.id });
        res.status(201).json({
          success: true,
          message: 'Employee created successfully but welcome email could not be sent',
          data: { employee: { id: user.id, username: user.username, email: user.email, name: user.name, role: user.role, is_active: user.is_active, created_at: user.created_at }, warning: 'Email sending failed. Please resend credentials manually.' },
        });
      }
    } catch (error) {
      await client.query('ROLLBACK');
      client.release();
      throw error;
    }
  } catch (error) {
    logger.error('Create employee error', { error, stack: error instanceof Error ? error.stack : undefined });
    res.status(500).json({ success: false, message: 'Failed to create employee' });
  }
}

export async function getEmployees(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.user || req.user.role !== 'admin') {
      res.status(403).json({ success: false, message: 'Only admins can view employees' });
      return;
    }

    const result = await pool.query(
      `SELECT id, username, email, name, role, is_active, created_at, updated_at
       FROM users
       WHERE role = 'employee' AND auth_provider = 'local' AND admin_id = $1
       ORDER BY created_at DESC`,
      [req.user.id]
    );

    res.status(200).json({ success: true, data: { employees: result.rows } });
  } catch (error) {
    logger.error('Error fetching employees', { error });
    res.status(500).json({ success: false, message: 'Failed to fetch employees' });
  }
}

export async function deactivateEmployee(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.user || req.user.role !== 'admin') {
      res.status(403).json({ success: false, message: 'Only admins can deactivate employees' });
      return;
    }

    const { id } = req.params;

    const result = await pool.query(
      'UPDATE users SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND role = $2 AND admin_id = $3 RETURNING id, username, is_active',
      [id, 'employee', req.user.id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Employee not found' });
      return;
    }

    logger.warn('Employee deactivated', { id, deletedBy: req.user.id });
    res.status(200).json({ success: true, message: 'Employee deactivated successfully', data: { employee: result.rows[0] } });
  } catch (error) {
    logger.error('Error deactivating employee', { error });
    res.status(500).json({ success: false, message: 'Failed to deactivate employee' });
  }
}

// Resend temporary credentials to employee (admin only)
export async function resendCredentials(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.user || req.user.role !== 'admin') {
      res.status(403).json({ success: false, message: 'Only admins can resend credentials' });
      return;
    }

    const { id } = req.params;
    const adminId = req.user.id;

    const employeeResult = await pool.query(
      'SELECT id, username, email, name FROM users WHERE id = $1 AND role = $2 AND admin_id = $3',
      [id, 'employee', adminId]
    );

    if (employeeResult.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Employee not found' });
      return;
    }

    const employee = employeeResult.rows[0];

    const tempPassword = TempPasswordService.generateSecurePassword();
    const tempPasswordHash = await hashPassword(tempPassword);

    const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000);

    await pool.query(
      `UPDATE users 
       SET password_hash = $1,
           is_temp_password = true,
           temp_password_expires_at = $2,
           force_password_change = true,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3`,
      [tempPasswordHash, expiresAt, id]
    );

    const adminResult = await pool.query(
      'SELECT name FROM users WHERE id = $1',
      [adminId]
    );
    const adminName = adminResult.rows[0]?.name || 'Administrator';

    try {
      await EmailService.sendEmployeeTempPasswordEmail(
        employee.email,
        employee.username,
        tempPassword,
        employee.name || employee.username,
        adminName,
        expiresAt
      );

      try {
        await AuditLogRepository.createLog(
          adminId,
          'CREDENTIALS_RESENT',
          employee.id,
          'user',
          String(employee.id),
          { action: 'temp_password_resent', email: employee.email },
          req.headers['x-forwarded-for'] as string || req.socket.remoteAddress || 'unknown',
          req.headers['user-agent'] || 'unknown'
        );
      } catch (auditError) {
        logger.warn('Resend credentials: audit log failed (non-critical)', { error: auditError });
      }

      logger.info('Employee credentials resent', { id: employee.id, email: employee.email });
      res.status(200).json({ success: true, message: 'Credentials resent successfully', data: { expiresAt: expiresAt.toISOString() } });
    } catch (emailError) {
      logger.warn('Resend credentials: email failed', { error: emailError });
      res.status(200).json({ success: true, message: 'Credentials reset but email could not be sent', data: { expiresAt: expiresAt.toISOString(), warning: 'Email sending failed. Contact support to resend.' } });
    }
  } catch (error) {
    logger.error('Resend credentials error', { error });
    res.status(500).json({ success: false, message: 'Failed to resend credentials' });
  }
}

export async function activateEmployee(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.user || req.user.role !== 'admin') {
      res.status(403).json({ success: false, message: 'Only admins can activate employees' });
      return;
    }

    const { id } = req.params;

    const result = await pool.query(
      'UPDATE users SET is_active = true, updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND role = $2 AND admin_id = $3 RETURNING id, username, is_active',
      [id, 'employee', req.user.id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ success: false, message: 'Employee not found' });
      return;
    }

    logger.info('Employee activated', { id, activatedBy: req.user.id });
    res.status(200).json({ success: true, message: 'Employee activated successfully', data: { employee: result.rows[0] } });
  } catch (error) {
    logger.error('Error activating employee', { error });
    res.status(500).json({ success: false, message: 'Failed to activate employee' });
  }
}
