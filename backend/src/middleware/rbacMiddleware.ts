import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import pool from '../config/database';
import { AuthenticatedRequest } from '../types';
import logger from '../utils/logger';
import { JWT_SECRET } from '../config/secrets';

export async function authenticate(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
      logger.warn('Unauthorized access attempt - no token', { url: req.url, ip: req.ip });
      return res.status(401).json({ success: false, message: 'No token provided' });
    }

    const decoded = jwt.verify(token, JWT_SECRET) as any;

    const userResult = await pool.query(
      'SELECT id, username, email, name, role, admin_id, force_password_change, sessions_revoked_at, is_active FROM users WHERE id = $1',
      [decoded.id]
    );

    if (userResult.rows.length === 0) {
      logger.warn('Deleted user attempted access', { userId: decoded.id, ip: req.ip, url: req.url });
      return res.status(401).json({ success: false, message: 'User not found' });
    }

    const user = userResult.rows[0];

    if (!user.is_active) {
      logger.warn('Login failed - account inactive', { username: user.username, ip: req.ip, url: req.url });
      return res.status(401).json({ success: false, message: 'Account has been deactivated' });
    }

    if (user.sessions_revoked_at) {
      const tokenIssuedAt = decoded.iat;
      const revokedAtSeconds = Math.floor(new Date(user.sessions_revoked_at).getTime() / 1000);
      if (tokenIssuedAt < revokedAtSeconds) {
        logger.warn('Token issued before session revocation', { url: req.url, ip: req.ip });
        return res.status(401).json({ success: false, message: 'Session revoked. Please log in again.' });
      }
    }

    logger.info('User authenticated', { username: user.username, role: user.role, ip: req.ip });

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
    if (error instanceof jwt.TokenExpiredError) {
      logger.warn('Expired token used', { ip: req.ip, url: req.url });
      return res.status(401).json({ success: false, message: 'Token expired' });
    }
    if (error instanceof jwt.JsonWebTokenError) {
      logger.warn('Invalid token used', { ip: req.ip, url: req.url });
      return res.status(401).json({ success: false, message: 'Invalid token' });
    }
    logger.error('Authentication error', { error: error instanceof Error ? error.message : error, ip: req.ip, url: req.url });
    return res.status(401).json({ success: false, message: 'Invalid token' });
  }
}

export function requireRole(...allowedRoles: string[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    }

    if (!allowedRoles.includes(req.user.role || '')) {
      logger.warn('Access denied - insufficient role', { role: req.user.role, required: allowedRoles, ip: req.ip, url: req.url });
      return res.status(403).json({ success: false, message: `Access denied. Required role: ${allowedRoles.join(' or ')}` });
    }

    next();
  };
}
