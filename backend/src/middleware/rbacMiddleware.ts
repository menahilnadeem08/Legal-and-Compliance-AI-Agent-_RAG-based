import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import pool from '../config/database';
import { AuthenticatedRequest } from '../types';
import { logger } from '../utils/logger';
import { JWT_SECRET } from '../config/secrets';

export async function authenticate(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
      logger.warn('AUTH', 'No token provided');
      return res.status(401).json({ error: 'No token provided' });
    }

    const decoded = jwt.verify(token, JWT_SECRET) as any;

    const userResult = await pool.query(
      'SELECT id, username, email, name, role, admin_id, force_password_change, sessions_revoked_at FROM users WHERE id = $1',
      [decoded.id]
    );

    if (userResult.rows.length === 0) {
      logger.warn('AUTH', 'User not found');
      return res.status(401).json({ error: 'User not found' });
    }

    const user = userResult.rows[0];

    // Reject access tokens issued before the last session revocation
    if (user.sessions_revoked_at) {
      const tokenIssuedAt = decoded.iat;
      const revokedAtSeconds = Math.floor(new Date(user.sessions_revoked_at).getTime() / 1000);
      if (tokenIssuedAt < revokedAtSeconds) {
        logger.warn('AUTH', 'Token issued before session revocation');
        return res.status(401).json({ error: 'Session revoked. Please log in again.' });
      }
    }

    logger.success('AUTH', 'User authenticated', `${user.username} (${user.role})`);

    req.user = {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      admin_id: user.admin_id,
      forcePasswordChange: user.force_password_change || false,
    };

    next();
  } catch (error) {
    logger.error('AUTH', 'Authentication error', error instanceof Error ? error.message : error);
    if (error instanceof jwt.TokenExpiredError) {
      return res.status(401).json({ error: 'Token expired' });
    }
    return res.status(401).json({ error: 'Invalid token' });
  }
}

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
