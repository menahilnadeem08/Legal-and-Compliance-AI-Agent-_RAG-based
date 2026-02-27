import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import pool from '../config/database';
import { AuthenticatedRequest } from '../types';
import logger from '../utils/logger';
import { JWT_SECRET } from '../config/secrets';

// Cache for user is_active status (60 second TTL per user)
interface UserActiveCacheEntry {
  is_active: boolean;
  cachedAt: number;
}

const userActiveCache = new Map<string, UserActiveCacheEntry>();
const CACHE_TTL_MS = 60 * 1000; // 60 seconds

function getCachedUserActive(userId: string): boolean | null {
  const cached = userActiveCache.get(userId);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    return cached.is_active;
  }
  // Cache expired, remove it
  if (cached) {
    userActiveCache.delete(userId);
  }
  return null;
}

function setCachedUserActive(userId: string, is_active: boolean): void {
  userActiveCache.set(userId, { is_active, cachedAt: Date.now() });
}

export function clearUserCache(userId: string | number): void {
  userActiveCache.delete(String(userId));
}

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

    // Check is_active status with caching (immediate deactivation on cached is_active=false)
    let is_active = getCachedUserActive(user.id);
    if (is_active === null) {
      // Cache miss or expired, use database value
      is_active = user.is_active;
      setCachedUserActive(user.id, is_active as boolean);
    }

    if (!is_active) {
      logger.warn('Login failed - account inactive', { username: user.username, ip: req.ip, url: req.url });
      return res.status(401).json({ success: false, message: 'Account has been deactivated' });
    }

    if (user.sessions_revoked_at) {
      const tokenIssuedAt = decoded.iat;
      const revokedAtSeconds = Math.floor(new Date(user.sessions_revoked_at).getTime() / 1000);
      if (tokenIssuedAt < revokedAtSeconds) {
        logger.warn('Token issued before session revocation', { url: req.ip, ip: req.ip });
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
