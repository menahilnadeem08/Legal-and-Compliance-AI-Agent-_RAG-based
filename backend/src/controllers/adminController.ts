import { Request, Response } from 'express';
import pool from '../config/database';
import { hashPassword } from '../utils/passwordUtils';

export interface AdminRequest extends Request {
  user?: {
    id: number;
    role: string;
  };
}

// Create employee user (admin only)
export async function createEmployee(req: AdminRequest, res: Response): Promise<void> {
  try {
    // Check if user is admin
    if (!req.user || req.user.role !== 'admin') {
      res.status(403).json({ error: 'Only admins can create employees' });
      return;
    }

    const { username, password, email, name } = req.body;

    // Validation
    if (!username || !password || !email) {
      res.status(400).json({ error: 'Username, password, and email are required' });
      return;
    }

    if (password.length < 6) {
      res.status(400).json({ error: 'Password must be at least 6 characters' });
      return;
    }

    const client = await pool.connect();

    try {
      // Check if username already exists
      const existingUser = await client.query(
        'SELECT id FROM users WHERE username = $1',
        [username]
      );

      if (existingUser.rows.length > 0) {
        res.status(409).json({ error: 'Username already exists' });
        return;
      }

      // Hash password
      const passwordHash = await hashPassword(password);

      // Create employee user
      const newUser = await client.query(
        `INSERT INTO users (username, password_hash, email, name, role, auth_provider, admin_id, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, username, email, name, role, is_active, created_at`,
        [username, passwordHash, email, name || null, 'employee', 'local', req.user.id, true]
      );

      const user = newUser.rows[0];

      res.status(201).json({
        message: 'Employee created successfully',
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
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error creating employee:', error);
    res.status(500).json({ error: 'Failed to create employee' });
  }
}

// Get all employees (admin only)
export async function getEmployees(req: AdminRequest, res: Response): Promise<void> {
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
export async function deactivateEmployee(req: AdminRequest, res: Response): Promise<void> {
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

// Activate employee (admin only)
export async function activateEmployee(req: AdminRequest, res: Response): Promise<void> {
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
