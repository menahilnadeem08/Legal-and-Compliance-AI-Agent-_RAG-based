import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger';

/**
 * Global middleware — applied via router.use() after auth routes.
 * If the authenticated user has forcePasswordChange = true,
 * only these paths are allowed through:
 */
const ALLOWED_PATHS = [
  '/auth/change-password',
  '/auth/me',
  '/auth/logout',
];

export function enforcePasswordChange(req: Request, res: Response, next: NextFunction): void {
  try {
    const authReq = req as any;

    if (!authReq.user || !authReq.user.forcePasswordChange) {
      next();
      return;
    }

    const isAllowed = ALLOWED_PATHS.some(
      (path) => req.path === path
    );

    if (!isAllowed) {
      res.status(403).json({
        success: false,
        message: 'You must change your password before accessing other features',
        code: 'FORCE_PASSWORD_CHANGE',
        redirectUrl: '/auth/change-password',
      });
      return;
    }

    next();
  } catch (error) {
    logger.error('Enforce password change middleware error', { error });
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
}
