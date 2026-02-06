import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import pool from '../config/database';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: number;
    username?: string;
    email?: string;
    role?: string;
    admin_id?: number;
  };
}

// Authenticate user via JWT token
export async function authenticate(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    
    console.log('[AUTH] Authenticating request to:', req.path);
    console.log('[AUTH] Token present:', !!token);
    console.log('[AUTH] Auth header:', req.headers.authorization?.substring(0, 20) + '...');

    if (!token) {
      console.log('[AUTH] ❌ No token provided');
      return res.status(401).json({ error: 'No token provided' });
    }

    const decoded = jwt.verify(token, JWT_SECRET) as any;
    console.log('[AUTH] ✓ Token verified for user:', decoded.id);

    // Verify session exists in database
    const sessionResult = await pool.query(
      'SELECT * FROM sessions WHERE token = $1 AND expires_at > NOW()',
      [token]
    );

    if (sessionResult.rows.length === 0) {
      console.log('[AUTH] ❌ Session not found or expired in database');
      return res.status(401).json({ error: 'Session expired' });
    }

    console.log('[AUTH] ✓ Session found in database');

    const userResult = await pool.query(
      'SELECT id, username, email, name, role, admin_id FROM users WHERE id = $1',
      [decoded.id]
    );

    if (userResult.rows.length === 0) {
      console.log('[AUTH] ❌ User not found');
      return res.status(401).json({ error: 'User not found' });
    }

    const user = userResult.rows[0];
    console.log('[AUTH] ✓ User authenticated:', user.username, user.role);
    
    req.user = {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      admin_id: user.admin_id
    };

    next();
  } catch (error) {
    console.log('[AUTH] ❌ Authentication error:', error instanceof Error ? error.message : error);
    if (error instanceof jwt.TokenExpiredError) {
      return res.status(401).json({ error: 'Token expired' });
    }
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// Require specific role(s)
export function requireRole(...allowedRoles: string[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    if (!allowedRoles.includes(req.user.role || '')) {
      return res.status(403).json({ error: `Access denied. Required role: ${allowedRoles.join(' or ')}` });
    }

    next();
  };
}

// Optional authentication (doesn't fail if no token)
export async function optionalAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
      return next();
    }

    const decoded = jwt.verify(token, JWT_SECRET) as any;
    const userResult = await pool.query(
      'SELECT id, username, email, name, role, admin_id FROM users WHERE id = $1',
      [decoded.id]
    );

    if (userResult.rows.length > 0) {
      const user = userResult.rows[0];
      req.user = {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        admin_id: user.admin_id
      };
    }

    next();
  } catch (error) {
    // Continue without authentication
    next();
  }
}
