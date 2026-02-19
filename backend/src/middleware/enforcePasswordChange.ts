import { Request, Response, NextFunction } from 'express';

/**
 * Middleware to enforce password change for users with temporary passwords
 * If user has forcePasswordChange = true, only allow:
 * - /auth/change-password
 * - /auth/me
 * - /auth/logout
 * - Document compare, activate, deactivate, delete
 * - All conversation routes
 */
export function enforcePasswordChange(req: Request, res: Response, next: NextFunction): void {
  try {
    const authReq = req as any;

    // Only check if user is authenticated
    if (!authReq.user) {
      next();
      return;
    }

    // If user must change password, only allow specific routes
    if (authReq.user.forcePasswordChange) {
      const allowedRoutes: (string | RegExp)[] = [
        '/auth/change-password',
        '/auth/me',
        '/auth/logout',
        '/documents/compare',
        '/conversations',
        /^\/documents\/\d+\/(activate|deactivate|delete)$/,
      ];

      const isAllowed = allowedRoutes.some((route) =>
        typeof route === 'string'
          ? req.path === route || req.path.startsWith(route)
          : route.test(req.path)
      );

      if (!isAllowed) {
        console.log('[ENFORCE-PASSWORD-CHANGE] ❌ User must change password before accessing', req.path);
        res.status(403).json({
          error: 'You must change your password before accessing other features',
          code: 'FORCE_PASSWORD_CHANGE',
          redirectUrl: '/auth/change-password',
        });
        return;
      }
    }

    next();
  } catch (error) {
    console.error('[ENFORCE-PASSWORD-CHANGE] Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
