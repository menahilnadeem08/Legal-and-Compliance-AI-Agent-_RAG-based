import { Response } from 'express';
import pool from '../config/database';
import { hashPassword, validatePassword } from '../utils/passwordUtils';
import { AuthenticatedRequest } from '../types';
import { EmailService } from '../utils/emailService';
import { TempPasswordService } from '../services/tempPasswordService';
import { AuditLogRepository } from '../repositories/invitationRepository';

// Create employee user (admin only)
// Generates temporary password and sends welcome email
export async function createEmployee(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    console.log('[ADMIN-CREATE-EMPLOYEE] 📨 Create Employee endpoint called');
    
    // Check if user is admin
    if (!req.user || req.user.role !== 'admin') {
      console.log('[ADMIN-CREATE-EMPLOYEE] ❌ Access denied: user is not admin');
      res.status(403).json({ error: 'Only admins can create employees' });
      return;
    }

    const { username, email, name } = req.body;
    const adminId = req.user.id;
    const ipAddress = req.headers['x-forwarded-for'] as string || req.socket.remoteAddress || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';

    console.log('[ADMIN-CREATE-EMPLOYEE] Request details:', {
      username,
      email,
      name,
      adminId
    });

    // Validation
    if (!username || !email) {
      console.log('[ADMIN-CREATE-EMPLOYEE] ❌ Missing required fields');
      res.status(400).json({ error: 'Username and email are required' });
      return;
    }

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Check if username already exists
      console.log('[ADMIN-CREATE-EMPLOYEE] ✓ Checking if username exists...');
      const existingUser = await client.query(
        'SELECT id FROM users WHERE username = $1',
        [username]
      );

      if (existingUser.rows.length > 0) {
        console.log('[ADMIN-CREATE-EMPLOYEE] ❌ Username already exists:', username);
        res.status(409).json({ error: 'Username already exists' });
        return;
      }

      // Check if email already exists
      console.log('[ADMIN-CREATE-EMPLOYEE] ✓ Checking if email exists...');
      const existingEmail = await client.query(
        'SELECT id FROM users WHERE email = $1',
        [email]
      );

      if (existingEmail.rows.length > 0) {
        console.log('[ADMIN-CREATE-EMPLOYEE] ❌ Email already exists:', email);
        res.status(409).json({ error: 'Email already exists' });
        return;
      }

      console.log('[ADMIN-CREATE-EMPLOYEE] ✓ Username and email are unique');

      // Generate temporary password
      console.log('[ADMIN-CREATE-EMPLOYEE] ✓ Generating temporary password...');
      const tempPassword = TempPasswordService.generateSecurePassword();
      const tempPasswordHash = await hashPassword(tempPassword);

      // 2-hour expiry
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 2);

      // Create employee user with temporary password
      console.log('[ADMIN-CREATE-EMPLOYEE] ✓ Creating user record with temporary credentials...');
      const newUser = await client.query(
        `INSERT INTO users (
          username, password_hash, email, name, role, auth_provider, admin_id, is_active,
          is_temp_password, temp_password_expires_at, force_password_change
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
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
          true            // force_password_change = true
        ]
      );

      const user = newUser.rows[0];
      console.log('[ADMIN-CREATE-EMPLOYEE] ✓ User created with ID:', user.id);

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
        console.error('[ADMIN-CREATE-EMPLOYEE] ⚠️  Audit log failed (non-critical):', auditError);
        // Non-critical error, continue
      }

      // Send welcome email with temporary credentials
      console.log('[ADMIN-CREATE-EMPLOYEE] ✓ Sending welcome email with temporary credentials...');
      
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

        console.log('[ADMIN-CREATE-EMPLOYEE] ✅ User created and welcome email sent successfully');

        res.status(201).json({
          message: 'Employee created successfully. Temporary password sent to email (valid for 2 hours)',
          user: {
            id: user.id,
            username: user.username,
            email: user.email,
            name: user.name,
            role: user.role,
            is_active: user.is_active,
            created_at: user.created_at
          }
        });
      } catch (emailError) {
        // Email failed but user was created, so return warning
        console.error('[ADMIN-CREATE-EMPLOYEE] ⚠️  Email sending failed:', emailError);
        res.status(201).json({
          message: 'Employee created successfully but welcome email could not be sent',
          user: {
            id: user.id,
            username: user.username,
            email: user.email,
            name: user.name,
            role: user.role,
            is_active: user.is_active,
            created_at: user.created_at
          },
          warning: 'Email sending failed - temp password: ' + tempPassword
        });
      }
    } catch (error) {
      await client.query('ROLLBACK');
      client.release();
      throw error;
    }
  } catch (error) {
    console.error('[ADMIN-CREATE-EMPLOYEE] ❌ Error:', error);
    console.error('[ADMIN-CREATE-EMPLOYEE] Stack:', error instanceof Error ? error.stack : '');
    res.status(500).json({ error: 'Failed to create employee' });
  }
}

// Get all employees (admin only)
export async function getEmployees(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.user || req.user.role !== 'admin') {
      res.status(403).json({ error: 'Only admins can view employees' });
      return;
    }

    const result = await pool.query(
      `SELECT id, username, email, name, role, is_active, created_at, updated_at
       FROM users
       WHERE role = 'employee' AND auth_provider = 'local'
       ORDER BY created_at DESC`
    );

    res.json({ employees: result.rows });
  } catch (error) {
    console.error('Error fetching employees:', error);
    res.status(500).json({ error: 'Failed to fetch employees' });
  }
}

// Deactivate employee (admin only)
export async function deactivateEmployee(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.user || req.user.role !== 'admin') {
      res.status(403).json({ error: 'Only admins can deactivate employees' });
      return;
    }

    const { id } = req.params;

    const result = await pool.query(
      'UPDATE users SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND role = $2 RETURNING id, username, is_active',
      [id, 'employee']
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Employee not found' });
      return;
    }

    res.json({ message: 'Employee deactivated', user: result.rows[0] });
  } catch (error) {
    console.error('Error deactivating employee:', error);
    res.status(500).json({ error: 'Failed to deactivate employee' });
  }
}

// Resend temporary credentials to employee (admin only)
export async function resendCredentials(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.user || req.user.role !== 'admin') {
      res.status(403).json({ error: 'Only admins can resend credentials' });
      return;
    }

    const { id } = req.params;
    const adminId = req.user.id;

    const employeeResult = await pool.query(
      'SELECT id, username, email, name FROM users WHERE id = $1 AND role = $2',
      [id, 'employee']
    );

    if (employeeResult.rows.length === 0) {
      res.status(404).json({ error: 'Employee not found' });
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
        console.error('[RESEND-CREDENTIALS] Audit log failed (non-critical):', auditError);
      }

      res.json({
        message: 'New temporary credentials sent successfully',
        expiresAt: expiresAt.toISOString()
      });
    } catch (emailError) {
      console.error('[RESEND-CREDENTIALS] Email sending failed:', emailError);
      res.json({
        message: 'Credentials reset but email could not be sent',
        warning: 'Email sending failed - temp password: ' + tempPassword,
        expiresAt: expiresAt.toISOString()
      });
    }
  } catch (error) {
    console.error('[RESEND-CREDENTIALS] Error:', error);
    res.status(500).json({ error: 'Failed to resend credentials' });
  }
}

// Activate employee (admin only)
export async function activateEmployee(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.user || req.user.role !== 'admin') {
      res.status(403).json({ error: 'Only admins can activate employees' });
      return;
    }

    const { id } = req.params;

    const result = await pool.query(
      'UPDATE users SET is_active = true, updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND role = $2 RETURNING id, username, is_active',
      [id, 'employee']
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Employee not found' });
      return;
    }

    res.json({ message: 'Employee activated', user: result.rows[0] });
  } catch (error) {
    console.error('Error activating employee:', error);
    res.status(500).json({ error: 'Failed to activate employee' });
  }
}
