import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import pool from '../config/database';
import { AuthenticatedRequest } from '../types';
import { logger } from '../utils/logger';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

/**
 * Optional authentication middleware
 * - If Authorization header is provided, validates it and extracts user
 * - If no Authorization header, continues without req.user
 * - This allows endpoints to handle both authenticated and unauthenticated requests
 */
export async function optionalAuthenticate(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const token = req.headers.authorization?.split(' ')[1];

    // If no token provided, just continue (this endpoint supports unauthenticated requests)
    if (!token) {
      logger.info('OPTIONAL_AUTH', 'No token provided, allowing unauthenticated access');
      return next();
    }

    // Token is provided, validate it
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as any;
      logger.info('OPTIONAL_AUTH', 'Token verified for user', decoded.id);

      // Verify session exists in database
      const sessionResult = await pool.query(
        'SELECT * FROM sessions WHERE token = $1 AND expires_at > NOW()',
        [token]
      );

      if (sessionResult.rows.length === 0) {
        logger.warn('OPTIONAL_AUTH', 'Session not found or expired in database');
        // Token was provided but invalid/expired - reject
        return res.status(401).json({ error: 'Session expired' });
      }

      logger.success('OPTIONAL_AUTH', 'Session found in database');

      const userResult = await pool.query(
        'SELECT id, username, email, name, role, admin_id FROM users WHERE id = $1',
        [decoded.id]
      );

      if (userResult.rows.length === 0) {
        logger.warn('OPTIONAL_AUTH', 'User not found');
        return res.status(401).json({ error: 'User not found' });
      }

      const user = userResult.rows[0];
      logger.success('OPTIONAL_AUTH', 'User authenticated', `${user.username} (${user.role})`);
      
      req.user = {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        admin_id: user.admin_id
      };

      next();
    } catch (tokenError) {
      // Token provided but invalid - reject
      logger.error('OPTIONAL_AUTH', 'Token validation error', tokenError instanceof Error ? tokenError.message : tokenError);
      if (tokenError instanceof jwt.TokenExpiredError) {
        return res.status(401).json({ error: 'Token expired' });
      }
      return res.status(401).json({ error: 'Invalid token' });
    }
  } catch (error) {
    logger.error('OPTIONAL_AUTH', 'Unexpected error', error instanceof Error ? error.message : error);
    return res.status(500).json({ error: 'Authentication error' });
  }
}
