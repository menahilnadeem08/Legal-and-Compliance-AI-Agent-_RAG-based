import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import pool from '../config/database';
import { hashPassword, comparePassword, validatePassword } from '../utils/passwordUtils';
import { AuthenticatedRequest } from '../types';
import { TempPasswordService } from '../services/tempPasswordService';
import { AuditLogRepository } from '../repositories/auditLogRepository';
import { JWT_SECRET } from '../config/secrets';
import { authError, authSuccess, isDbError, lockedMessage, ERROR_CODES } from '../utils/authErrors';
import {
  createSession,
  validateRefreshToken,
  rotateRefreshToken,
  revokeSession,
  revokeAllUserSessions,
} from '../helpers/sessionHelper';

const ACCESS_TOKEN_EXPIRE = '15m';

function generateAccessToken(payload: object): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRE });
}

export async function login(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { username, email, password } = req.body;
    const ipAddress = req.headers['x-forwarded-for'] as string || req.socket.remoteAddress || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';

    const loginIdentifier = username || email;

    if (!loginIdentifier || !password) {
      authError(res, 400, 'Email and password are required', ERROR_CODES.MISSING_FIELDS);
      return;
    }

    const userResult = await pool.query(
      `SELECT id, username, email, name, role, password_hash, is_active, auth_provider, admin_id,
              is_temp_password, temp_password_expires_at, force_password_change, email_verified, locked_until
       FROM users
       WHERE ${username ? 'username' : 'email'} = $1 AND auth_provider = 'local' AND role = 'employee'`,
      [loginIdentifier]
    );

    if (userResult.rows.length === 0) {
      console.error('[AUTH:login] User not found');
      authError(res, 401, 'Invalid email or password', ERROR_CODES.INVALID_CREDENTIALS);
    }

    const user = userResult.rows[0];

    // Check if account is locked
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      console.warn(`[AUTH:login] Account locked: ${user.email}`);
      authError(res, 423, lockedMessage(new Date(user.locked_until)), ERROR_CODES.ACCOUNT_LOCKED);
    }

    // Check if account is inactive
    if (!user.is_active) {
      console.warn(`[AUTH:login] Inactive account: ${user.email}`);
      authError(res, 403, 'Your account has been deactivated. Contact your administrator', ERROR_CODES.ACCOUNT_INACTIVE);
    }

    // Check email verification
    if (!user.email_verified) {
      console.warn(`[AUTH:login] Unverified email: ${user.email}`);
      authError(res, 403, 'Please verify your email before logging in', ERROR_CODES.EMAIL_UNVERIFIED);
    }

    if (user.is_temp_password) {
      // Check if temp password expired
      if (user.temp_password_expires_at && new Date(user.temp_password_expires_at) < new Date()) {
        console.warn(`[AUTH:login] Temp password expired: ${user.email}`);
        authError(res, 401, 'Your temporary password has expired. Request new credentials from your administrator', ERROR_CODES.TEMP_PASSWORD_EXPIRED);
      }

      try {
        const tempPasswordValid = await TempPasswordService.validateTempPassword(user.id, password);

        if (!tempPasswordValid) {
          console.error(`[AUTH:login] Invalid temp password: ${user.email}`);
          authError(res, 401, 'Invalid email or password', ERROR_CODES.INVALID_CREDENTIALS);
        }

        if (user.admin_id) {
          try {
            await AuditLogRepository.createLog(
              user.admin_id,
              'TEMP_PASSWORD_USED',
              user.id,
              'user',
              String(user.id),
              { action: 'login_with_temporary_password' },
              ipAddress,
              userAgent
            );
          } catch (auditError) {
            console.error('[AUTH:login] Audit log failed:', auditError);
          }
        }

        const tokenPayload = { id: user.id, username: user.username, email: user.email, role: user.role, forcePasswordChange: true };
        const accessToken = generateAccessToken(tokenPayload);
        const refreshToken = await createSession(user.id);

        authSuccess(res, 200, {
          accessToken,
          refreshToken,
          user: { id: user.id, username: user.username, email: user.email, role: user.role },
          forcePasswordChange: true,
        });
      } catch (tempPassError: any) {
        console.error('[AUTH:login] Temp password validation error:', tempPassError);
        authError(res, 500, 'An unexpected error occurred', ERROR_CODES.UNEXPECTED_ERROR);
      }
    }

    const passwordMatch = await comparePassword(password, user.password_hash);
    if (!passwordMatch) {
      console.error(`[AUTH:login] Invalid password: ${user.email}`);
      authError(res, 401, 'Invalid email or password', ERROR_CODES.INVALID_CREDENTIALS);
    }

    const tokenPayload = { id: user.id, username: user.username, email: user.email, role: user.role };
    const accessToken = generateAccessToken(tokenPayload);
    const refreshToken = await createSession(user.id);

    authSuccess(res, 200, {
      accessToken,
      refreshToken,
      user: { id: user.id, username: user.username, email: user.email, name: user.name, role: user.role },
      forcePasswordChange: false,
    });
  } catch (error) {
    console.error('[AUTH:login]', error);
    if (isDbError(error)) {
      authError(res, 503, 'Service temporarily unavailable', ERROR_CODES.SERVICE_UNAVAILABLE);
    }
    authError(res, 500, 'An unexpected error occurred', ERROR_CODES.UNEXPECTED_ERROR);
  }
}

export async function handleGoogleSignIn(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { googleId, email, name, image } = req.body;

    if (!googleId || !email) {
      console.error('[AUTH:handleGoogleSignIn] Missing Google auth data');
      authError(res, 400, 'Invalid Google authentication data', ERROR_CODES.MISSING_FIELDS);
    }

    const userRole = 'admin';
    const client = await pool.connect();

    try {
      const existingbyEmail = await client.query(
        'SELECT id, email, auth_provider FROM users WHERE email = $1',
        [email]
      );

      if (existingbyEmail.rows.length > 0) {
        const existingUser = existingbyEmail.rows[0];
        if (existingUser.auth_provider !== 'google') {
          client.release();
          console.warn(`[AUTH:handleGoogleSignIn] Email exists with ${existingUser.auth_provider}: ${email}`);
          authError(res, 403, 'An account with this email already exists. Please login with your password', ERROR_CODES.EMAIL_EXISTS);
        }
      }

      const existingByGoogleId = await client.query(
        'SELECT * FROM users WHERE google_id = $1',
        [googleId]
      );

      let user;

      if (existingByGoogleId.rows.length > 0) {
        user = existingByGoogleId.rows[0];
        await client.query(
          'UPDATE users SET name = $1, picture = $2, email_verified = true, email_verified_at = NOW(), updated_at = CURRENT_TIMESTAMP WHERE id = $3',
          [name, image, user.id]
        );
      } else {
        const newUser = await client.query(
          `INSERT INTO users (google_id, email, name, picture, role, auth_provider, is_active, email_verified, email_verified_at, password_hash)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) 
           RETURNING id, google_id, email, name, picture, role, auth_provider, email_verified`,
          [googleId, email, name, image, userRole, 'google', true, true, new Date(), null]
        );
        user = newUser.rows[0];
      }

      const tokenPayload = { id: user.id, email: user.email, googleId: user.google_id, role: user.role };
      const accessToken = generateAccessToken(tokenPayload);
      const refreshToken = await createSession(user.id, client);

      authSuccess(res, 200, {
        accessToken,
        refreshToken,
        user: { id: user.id, email: user.email, name: user.name, picture: user.picture, role: user.role }
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('[AUTH:handleGoogleSignIn]', error);
    if (isDbError(error)) {
      authError(res, 503, 'Service temporarily unavailable', ERROR_CODES.SERVICE_UNAVAILABLE);
    }
    authError(res, 500, 'An unexpected error occurred', ERROR_CODES.UNEXPECTED_ERROR);
  }
}

export async function logout(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { refreshToken } = req.body;

    if (refreshToken) {
      await revokeSession(refreshToken);
    }

    authSuccess(res, 200, { message: 'Logged out successfully' });
  } catch (error) {
    console.error('[AUTH:logout]', error);
    if (isDbError(error)) {
      authError(res, 503, 'Service temporarily unavailable', ERROR_CODES.SERVICE_UNAVAILABLE);
    }
    authError(res, 500, 'An unexpected error occurred', ERROR_CODES.UNEXPECTED_ERROR);
  }
}

export async function getCurrentUser(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      console.error('[AUTH:getCurrentUser] Not authenticated');
      authError(res, 401, 'Not authenticated', ERROR_CODES.UNAUTHORIZED);
    }

    const userResult = await pool.query(
      'SELECT id, email, name, picture, role, username FROM users WHERE id = $1',
      [req.user!.id]
    );

    if (userResult.rows.length === 0) {
      console.error(`[AUTH:getCurrentUser] User not found: ${req.user!.id}`);
      authError(res, 404, 'User not found', ERROR_CODES.NOT_FOUND);
    }

    authSuccess(res, 200, { user: userResult.rows[0] });
  } catch (error) {
    console.error('[AUTH:getCurrentUser]', error);
    if (isDbError(error)) {
      authError(res, 503, 'Service temporarily unavailable', ERROR_CODES.SERVICE_UNAVAILABLE);
    }
    authError(res, 500, 'An unexpected error occurred', ERROR_CODES.UNEXPECTED_ERROR);
  }
}

export async function changePassword(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body;

    if (!newPassword || !confirmPassword) {
      console.error('[AUTH:changePassword] Missing password fields');
      authError(res, 400, 'Current password and new password are required', ERROR_CODES.MISSING_FIELDS);
    }

    if (newPassword !== confirmPassword) {
      console.error('[AUTH:changePassword] Passwords do not match');
      authError(res, 400, 'Passwords do not match', ERROR_CODES.MISSING_FIELDS);
    }

    const passwordValidation = validatePassword(newPassword);
    if (!passwordValidation.valid) {
      console.error('[AUTH:changePassword] Weak password');
      authError(res, 400, 'Password must be at least 8 characters with uppercase, number, and special character', ERROR_CODES.WEAK_PASSWORD);
    }

    if (!req.user) {
      console.error('[AUTH:changePassword] User not authenticated');
      authError(res, 401, 'User not authenticated', ERROR_CODES.UNAUTHORIZED);
    }

    const userResult = await pool.query(
      'SELECT id, password_hash, auth_provider, is_temp_password, force_password_change FROM users WHERE id = $1',
      [req.user!.id]
    );

    if (userResult.rows.length === 0) {
      console.error(`[AUTH:changePassword] User not found: ${req.user!.id}`);
      authError(res, 404, 'User not found', ERROR_CODES.NOT_FOUND);
      return;
    }

    const user = userResult.rows[0];

    if (user.auth_provider !== 'local') {
      console.error(`[AUTH:changePassword] OAuth user: ${req.user!.id}`);
      authError(res, 403, 'Password change not available for OAuth users', ERROR_CODES.GOOGLE_ACCOUNT);
    }

    if (!user.force_password_change) {
      if (!currentPassword) {
        console.error('[AUTH:changePassword] No current password provided');
        authError(res, 400, 'Current password is required', ERROR_CODES.MISSING_FIELDS);
      }

      const passwordMatch = await comparePassword(currentPassword, user.password_hash);
      if (!passwordMatch) {
        console.error(`[AUTH:changePassword] Wrong current password: ${req.user!.id}`);
        authError(res, 401, 'Current password is incorrect', ERROR_CODES.INVALID_CREDENTIALS);
      }

      // Check if new password is same as current
      const isSamePassword = await comparePassword(newPassword, user.password_hash);
      if (isSamePassword) {
        console.error(`[AUTH:changePassword] New password same as current: ${req.user!.id}`);
        authError(res, 400, 'New password must be different from current password', ERROR_CODES.PASSWORD_SAME_AS_CURRENT);
      }
    }

    const newPasswordHash = await hashPassword(newPassword);

    // Update password + revoke all existing sessions
    await pool.query(
      `UPDATE users 
       SET password_hash = $1, 
           is_temp_password = false,
           temp_password_expires_at = NULL,
           force_password_change = false,
           sessions_revoked_at = NOW(),
           updated_at = CURRENT_TIMESTAMP 
       WHERE id = $2`,
      [newPasswordHash, req.user!.id]
    );

    if (user.is_temp_password) {
      await TempPasswordService.clearTempPassword(req.user!.id);
    }

    // Delete all sessions (invalidates all refresh tokens)
    await revokeAllUserSessions(req.user!.id);

    // Issue a fresh token pair so the current device stays logged in
    const tokenPayload = { id: req.user!.id, username: req.user!.username, email: req.user!.email, role: req.user!.role };
    const accessToken = generateAccessToken(tokenPayload);
    const refreshToken = await createSession(req.user!.id);

    authSuccess(res, 200, {
      message: 'Password changed successfully',
      accessToken,
      refreshToken,
    });
  } catch (error) {
    console.error('[AUTH:changePassword]', error);
    if (isDbError(error)) {
      authError(res, 503, 'Service temporarily unavailable', ERROR_CODES.SERVICE_UNAVAILABLE);
    }
    authError(res, 500, 'An unexpected error occurred', ERROR_CODES.UNEXPECTED_ERROR);
  }
}

/**
 * POST /auth/refresh — public endpoint (no authenticate middleware).
 * Accepts a refresh token, validates it, rotates it, returns new access + refresh tokens.
 */
export async function refresh(req: Request, res: Response): Promise<void> {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      console.error('[AUTH:refresh] No refresh token provided');
      authError(res, 400, 'Refresh token is required', ERROR_CODES.MISSING_FIELDS);
    }

    const session = await validateRefreshToken(refreshToken);
    if (!session) {
      console.error('[AUTH:refresh] Invalid or expired token');
      authError(res, 401, 'Invalid or expired refresh token', ERROR_CODES.UNAUTHORIZED);
      return;
    }

    const userResult = await pool.query(
      'SELECT id, username, email, role, is_active, sessions_revoked_at FROM users WHERE id = $1',
      [session.user_id]
    );

    if (userResult.rows.length === 0 || !userResult.rows[0].is_active) {
      await revokeSession(refreshToken);
      console.error(`[AUTH:refresh] User not found or inactive: ${session.user_id}`);
      authError(res, 401, 'User not found or inactive', ERROR_CODES.ACCOUNT_INACTIVE);
    }

    const user = userResult.rows[0];

    // If sessions were revoked after this session was created, reject it
    if (user.sessions_revoked_at) {
      const sessionCreatedAt = new Date(session.created_at).getTime();
      const revokedAt = new Date(user.sessions_revoked_at).getTime();
      if (sessionCreatedAt < revokedAt) {
        await revokeSession(refreshToken);
        console.warn(`[AUTH:refresh] Session revoked: ${session.user_id}`);
        authError(res, 401, 'Session revoked. Please log in again', ERROR_CODES.UNAUTHORIZED);
      }
    }

    const tokenPayload = { id: user.id, username: user.username, email: user.email, role: user.role };
    const newAccessToken = generateAccessToken(tokenPayload);
    const newRefreshToken = await rotateRefreshToken(session.id);

    authSuccess(res, 200, { accessToken: newAccessToken, refreshToken: newRefreshToken });
  } catch (error) {
    console.error('[AUTH:refresh]', error);
    if (isDbError(error)) {
      authError(res, 503, 'Service temporarily unavailable', ERROR_CODES.SERVICE_UNAVAILABLE);
    }
    authError(res, 500, 'An unexpected error occurred', ERROR_CODES.UNEXPECTED_ERROR);
  }
}



