import { Request, Response } from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import pool from '../config/database';
import { hashPassword, comparePassword } from '../utils/passwordUtils';
import { AuthenticatedRequest } from '../types';
import { TempPasswordService } from '../services/tempPasswordService';
import { AuditLogRepository } from '../repositories/auditLogRepository';
import { EmailService } from '../utils/emailService';
import { JWT_SECRET } from '../config/secrets';
import {
  createSession,
  validateRefreshToken,
  rotateRefreshToken,
  revokeSession,
  revokeAllUserSessions,
} from '../helpers/sessionHelper';
import logger from '../utils/logger';

const ACCESS_TOKEN_EXPIRE = '15m';
const RESET_TOKEN_EXPIRE = '15m';
const RESET_OTP_EXPIRY_MINUTES = 10;

function generateAccessToken(payload: object): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRE });
}

function generateOtp(): string {
  return crypto.randomInt(100000, 999999).toString();
}

export async function login(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { username, email, password } = req.body;
    const ipAddress = req.headers['x-forwarded-for'] as string || req.socket.remoteAddress || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';

    const loginIdentifier = username || email;

    // First check if user exists at all (regardless of active status)
    const userCheckResult = await pool.query(
      `SELECT id, username, email, name, role, password_hash, is_active, auth_provider, admin_id,
              is_temp_password, temp_password_expires_at, force_password_change, email_verified
       FROM users
       WHERE ${username ? 'username' : 'email'} = $1 AND auth_provider = 'local' AND role = 'employee'`,
      [loginIdentifier]
    );

    if (userCheckResult.rows.length === 0) {
      logger.warn('Login failed - user not found', { identifier: loginIdentifier, ip: ipAddress });
      res.status(401).json({ success: false, message: 'Invalid credentials' });
      return;
    }

    const user = userCheckResult.rows[0];

    // Check if account is deactivated
    if (!user.is_active) {
      logger.warn('Login failed - account deactivated', { identifier: loginIdentifier, ip: ipAddress });
      res.status(403).json({ success: false, message: 'Your account has been deactivated by your admin. Please contact support.' });
      return;
    }

    if (!user.email_verified) {
      logger.warn('Login failed - email not verified', { username: user.username, ip: ipAddress });
      res.status(403).json({
        success: false,
        message: 'Email verification required. Please verify your email before logging in.',
        email_verified: false
      });
      return;
    }

    if (user.is_temp_password) {
      try {
        const tempPasswordValid = await TempPasswordService.validateTempPassword(user.id, password);

        if (!tempPasswordValid) {
          logger.warn('Login failed - wrong password (temp)', { username: user.username, ip: ipAddress });
          res.status(401).json({ success: false, message: 'Invalid credentials' });
          return;
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
            logger.warn('Audit log failed', { context: 'AUTH', error: auditError });
          }
        }

        const tokenPayload = { id: user.id, username: user.username, email: user.email, role: user.role, forcePasswordChange: true };
        const accessToken = generateAccessToken(tokenPayload);
        const refreshToken = await createSession(user.id);

        // Set httpOnly cookies for manual auth (token also in response for frontend transition)
        const isSecure = process.env.NODE_ENV === 'production';
        res.cookie('accessToken', accessToken, {
          httpOnly: true,
          secure: isSecure,
          sameSite: 'strict',
          path: '/api',
          maxAge: 15 * 60 * 1000, // 15 minutes
        });
        res.cookie('refreshToken', refreshToken, {
          httpOnly: true,
          secure: isSecure,
          sameSite: 'strict',
          path: '/api/auth/refresh',
          maxAge: 24 * 60 * 60 * 1000, // 24 hours
        });

        logger.info('Login success (temp password)', { username: user.username, role: user.role, ip: ipAddress });
        res.status(200).json({
          success: true,
          message: 'Login successful. Please change your password.',
          data: { user: { id: user.id, username: user.username, email: user.email, role: user.role }, accessToken, refreshToken, forcePasswordChange: true },
        });
        return;
      } catch (tempPassError: any) {
        res.status(401).json({ success: false, message: tempPassError.message });
        return;
      }
    }

    const passwordMatch = await comparePassword(password, user.password_hash);
    if (!passwordMatch) {
      logger.warn('Login failed - wrong password', { username: user.username, ip: ipAddress });
      res.status(401).json({ success: false, message: 'Invalid credentials' });
      return;
    }

    const tokenPayload = { id: user.id, username: user.username, email: user.email, role: user.role };
    const accessToken = generateAccessToken(tokenPayload);
    const refreshToken = await createSession(user.id);

    // Set httpOnly cookies for manual auth (token also in response for frontend transition)
    const isSecure = process.env.NODE_ENV === 'production';
    res.cookie('accessToken', accessToken, {
      httpOnly: true,
      secure: isSecure,
      sameSite: 'strict',
      path: '/api',
      maxAge: 15 * 60 * 1000, // 15 minutes
    });
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: isSecure,
      sameSite: 'strict',
      path: '/api/auth/refresh',
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    });

    logger.info('Login success', { username: user.username, role: user.role, ip: ipAddress });
    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: { user: { id: user.id, username: user.username, email: user.email, name: user.name, role: user.role }, accessToken, refreshToken, forcePasswordChange: false },
    });
  } catch (error) {
    logger.error('Login error', { error });
    res.status(500).json({ success: false, message: 'Login failed' });
  }
}

export async function handleGoogleSignIn(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { googleId, email, name, image } = req.body;

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
          res.status(403).json({
            success: false,
            message: `An account with this email already exists using ${existingUser.auth_provider === 'local' ? 'local login' : existingUser.auth_provider}. Please sign in with your original login method.`,
            auth_provider: existingUser.auth_provider,
            email: email
          });
          return;
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

      res.status(200).json({
        success: true,
        message: 'Sign in successful',
        data: { user: { id: user.id, email: user.email, name: user.name, picture: user.picture, role: user.role }, accessToken, refreshToken },
      });
    } finally {
      client.release();
    }
  } catch (error) {
    logger.error('Google auth error', { error });
    res.status(500).json({ success: false, message: 'Failed to sign in' });
  }
}

export async function logout(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { refreshToken } = req.body;

    if (refreshToken) {
      await revokeSession(refreshToken);
    }

    // Clear httpOnly cookies
    res.clearCookie('accessToken', { path: '/api' });
    res.clearCookie('refreshToken', { path: '/api/auth/refresh' });

    res.status(200).json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    logger.error('Logout error', { error });
    res.status(500).json({ success: false, message: 'Logout failed' });
  }
}

export async function getCurrentUser(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Not authenticated' });
      return;
    }

    const userResult = await pool.query(
      'SELECT id, email, name, picture, role, username FROM users WHERE id = $1',
      [req.user.id]
    );

    if (userResult.rows.length === 0) {
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }

    res.status(200).json({ success: true, data: { user: userResult.rows[0] } });
  } catch (error) {
    logger.error('Get current user error', { error });
    res.status(500).json({ success: false, message: 'Failed to get user' });
  }
}

export async function changePassword(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body;

    if (!req.user) {
      res.status(401).json({ success: false, message: 'User not authenticated' });
      return;
    }

    const userResult = await pool.query(
      'SELECT id, password_hash, auth_provider, is_temp_password, force_password_change FROM users WHERE id = $1',
      [req.user.id]
    );

    if (userResult.rows.length === 0) {
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }

    const user = userResult.rows[0];

    if (user.auth_provider !== 'local') {
      res.status(400).json({ success: false, message: 'Password change not available for OAuth users' });
      return;
    }

    if (!user.force_password_change) {
      if (!currentPassword) {
        res.status(400).json({ success: false, message: 'Current password is required' });
        return;
      }

      const passwordMatch = await comparePassword(currentPassword, user.password_hash);
      if (!passwordMatch) {
        logger.warn('Password change failed - current password incorrect', { username: req.user.username });
        res.status(401).json({ success: false, message: 'Current password is incorrect' });
        return;
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
           sessions_revoked_at = NULL,
           updated_at = CURRENT_TIMESTAMP 
       WHERE id = $2`,
      [newPasswordHash, req.user.id]
    );

    if (user.is_temp_password) {
      await TempPasswordService.clearTempPassword(req.user.id);
    }

    // Delete all sessions (invalidates all refresh tokens)
    await revokeAllUserSessions(req.user.id);

    // Issue a fresh token pair so the current device stays logged in
    const tokenPayload = { id: req.user.id, username: req.user.username, email: req.user.email, role: req.user.role };
    const accessToken = generateAccessToken(tokenPayload);
    const refreshToken = await createSession(req.user.id);

    logger.info('Password changed successfully', { username: req.user.username });
    res.status(200).json({
      success: true,
      message: 'Password changed successfully',
      data: { accessToken, refreshToken },
    });
  } catch (error) {
    logger.error('Change password error', { error });
    res.status(500).json({ success: false, message: 'Failed to change password' });
  }
}

/**
 * POST /auth/refresh — public endpoint (no authenticate middleware).
 * Accepts a refresh token, validates it, rotates it, returns new access + refresh tokens.
 */
export async function refresh(req: Request, res: Response): Promise<void> {
  try {
    // Support reading refresh token from cookies OR request body (fallback for transition)
    const refreshToken = req.cookies?.refreshToken || req.body?.refreshToken;

    if (!refreshToken) {
      res.status(401).json({ success: false, message: 'No refresh token provided' });
      return;
    }

    const session = await validateRefreshToken(refreshToken);
    if (!session) {
      res.status(401).json({ success: false, message: 'Invalid or expired refresh token' });
      return;
    }

    const userResult = await pool.query(
      'SELECT id, username, email, role, is_active, sessions_revoked_at FROM users WHERE id = $1',
      [session.user_id]
    );

    if (userResult.rows.length === 0 || !userResult.rows[0].is_active) {
      await revokeSession(refreshToken);
      res.status(401).json({ success: false, message: 'User not found or inactive' });
      return;
    }

    const user = userResult.rows[0];

    if (user.sessions_revoked_at) {
      const sessionCreatedAt = new Date(session.created_at).getTime();
      const revokedAt = new Date(user.sessions_revoked_at).getTime();
      if (sessionCreatedAt < revokedAt) {
        await revokeSession(refreshToken);
        res.status(401).json({ success: false, message: 'Session revoked. Please log in again.' });
        return;
      }
    }

    const tokenPayload = { id: user.id, username: user.username, email: user.email, role: user.role };
    const newAccessToken = generateAccessToken(tokenPayload);
    const newRefreshToken = await rotateRefreshToken(session.id);

    // Set new httpOnly cookies
    const isSecure = process.env.NODE_ENV === 'production';
    res.cookie('accessToken', newAccessToken, {
      httpOnly: true,
      secure: isSecure,
      sameSite: 'strict',
      path: '/api',
      maxAge: 15 * 60 * 1000, // 15 minutes
    });
    res.cookie('refreshToken', newRefreshToken, {
      httpOnly: true,
      secure: isSecure,
      sameSite: 'strict',
      path: '/api/auth/refresh',
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    });

    res.status(200).json({ success: true, message: 'Token refreshed', data: { accessToken: newAccessToken, refreshToken: newRefreshToken } });
  } catch (error) {
    logger.error('Refresh token error', { error });
    res.status(500).json({ success: false, message: 'Token refresh failed' });
  }
}

/**
 * POST /auth/forgot-password — request OTP for password reset (admin or employee, local auth only).
 * Validates that the email exists AND matches the specified role before sending reset email.
 */
export async function forgotPassword(req: Request, res: Response): Promise<void> {
  try {
    const { email, role } = req.body as { email: string; role: 'admin' | 'employee' };
    const normalizedEmail = (email || '').trim().toLowerCase();
    if (!normalizedEmail) {
      res.status(400).json({ success: false, message: 'Email is required' });
      return;
    }

    if (!role || !['admin', 'employee'].includes(role)) {
      res.status(400).json({ success: false, message: 'Valid role (admin or employee) is required' });
      return;
    }

    const userResult = await pool.query(
      `SELECT id, email, name, username, role, auth_provider, is_active FROM users WHERE LOWER(email) = $1`,
      [normalizedEmail]
    );

    if (userResult.rows.length === 0) {
      // User not found
      const errorMessage = role === 'admin' 
        ? 'No admin is registered with this email'
        : 'No employee is registered with this email';
      res.status(404).json({ success: false, message: errorMessage });
      return;
    }

    const user = userResult.rows[0];

    // Check if account is deactivated
    if (!user.is_active) {
      res.status(403).json({ success: false, message: 'Your account has been deactivated by your admin. Please contact support.' });
      return;
    }

    // Validate that the user's role matches the requested role
    if (user.role !== role) {
      const errorMessage = role === 'admin' 
        ? 'No admin is registered with this email'
        : 'No employee is registered with this email';
      res.status(404).json({ success: false, message: errorMessage });
      return;
    }

    if (user.auth_provider !== 'local' || !user.email) {
      const errorMessage = role === 'admin' 
        ? 'No admin is registered with this email'
        : 'No employee is registered with this email';
      res.status(404).json({ success: false, message: errorMessage });
      return;
    }

    const otp = generateOtp();
    const otpHash = await hashPassword(otp);
    const otpExpiresAt = new Date(Date.now() + RESET_OTP_EXPIRY_MINUTES * 60 * 1000);

    await pool.query(
      `UPDATE users SET reset_otp_hash = $1, reset_otp_expires_at = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3`,
      [otpHash, otpExpiresAt, user.id]
    );

    if (!EmailService.isEmailConfigured()) {
      if (process.env.NODE_ENV === 'development') {
        logger.info('DEV: Email not configured. Password reset OTP (check server logs)', { email: normalizedEmail, otp });
      }
      res.status(503).json({
        success: false,
        message: process.env.NODE_ENV === 'development'
          ? 'Email is not configured. In development, check server logs for the reset code.'
          : 'Email is not configured. Please contact support.',
      });
      return;
    }

    try {
      await EmailService.sendPasswordResetOtpEmail(normalizedEmail, otp, user.name || user.username || normalizedEmail);
    } catch (emailError) {
      logger.error('Forgot password: failed to send email', { error: emailError, email: normalizedEmail });
      res.status(503).json({
        success: false,
        message: 'Could not send email. Please try again later or contact support.',
      });
      return;
    }

    logger.info('Password reset OTP sent', { email: normalizedEmail, role: user.role });
    res.status(200).json({
      success: true,
      message: 'If an account exists with this email, you will receive a reset code shortly.',
    });
  } catch (error) {
    logger.error('Forgot password error', { error });
    res.status(500).json({ success: false, message: 'Request failed. Please try again later.' });
  }
}

/**
 * POST /auth/verify-reset-otp — verify OTP and return a short-lived reset token.
 */
export async function verifyResetOtp(req: Request, res: Response): Promise<void> {
  try {
    const { email, otp } = req.body as { email: string; otp: string };
    const normalizedEmail = (email || '').trim().toLowerCase();
    if (!normalizedEmail || !otp || otp.length !== 6) {
      res.status(400).json({ success: false, message: 'Email and 6-digit OTP are required' });
      return;
    }

    const userResult = await pool.query(
      `SELECT id, email, name, role, reset_otp_hash, reset_otp_expires_at FROM users WHERE LOWER(email) = $1 AND is_active = true AND auth_provider = 'local'`,
      [normalizedEmail]
    );

    if (userResult.rows.length === 0) {
      res.status(401).json({ success: false, message: 'Invalid or expired code. Please request a new one.' });
      return;
    }

    const user = userResult.rows[0];
    if (!user.reset_otp_hash || !user.reset_otp_expires_at) {
      res.status(401).json({ success: false, message: 'No reset code found. Please request a new one.' });
      return;
    }

    if (new Date() > new Date(user.reset_otp_expires_at)) {
      res.status(401).json({ success: false, message: 'Code has expired. Please request a new one.' });
      return;
    }

    const otpMatch = await comparePassword(otp, user.reset_otp_hash);
    if (!otpMatch) {
      res.status(401).json({ success: false, message: 'Invalid code.' });
      return;
    }

    await pool.query(
      `UPDATE users SET reset_otp_hash = NULL, reset_otp_expires_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [user.id]
    );

    const resetToken = jwt.sign(
      { userId: user.id, email: user.email, purpose: 'password_reset' },
      JWT_SECRET,
      { expiresIn: RESET_TOKEN_EXPIRE }
    );

    res.status(200).json({
      success: true,
      message: 'Code verified. You can now set a new password.',
      data: { resetToken },
    });
  } catch (error) {
    logger.error('Verify reset OTP error', { error });
    res.status(500).json({ success: false, message: 'Verification failed.' });
  }
}

/**
 * POST /auth/reset-password — set new password using reset token from verify-reset-otp.
 */
export async function resetPassword(req: Request, res: Response): Promise<void> {
  try {
    const { resetToken, newPassword } = req.body as { resetToken: string; newPassword: string };
    if (!resetToken || !newPassword) {
      res.status(400).json({ success: false, message: 'Reset token and new password are required' });
      return;
    }

    let decoded: { userId: number; email: string; purpose?: string };
    try {
      decoded = jwt.verify(resetToken, JWT_SECRET) as typeof decoded;
      if (decoded.purpose !== 'password_reset' || !decoded.userId) {
        throw new Error('Invalid token');
      }
    } catch {
      res.status(401).json({ success: false, message: 'Invalid or expired reset link. Please start the process again.' });
      return;
    }

    const userResult = await pool.query(
      'SELECT id, email, auth_provider FROM users WHERE id = $1 AND is_active = true',
      [decoded.userId]
    );

    if (userResult.rows.length === 0 || userResult.rows[0].email !== decoded.email) {
      res.status(401).json({ success: false, message: 'Invalid or expired reset link. Please start the process again.' });
      return;
    }

    const newPasswordHash = await hashPassword(newPassword);
    await pool.query(
      `UPDATE users SET password_hash = $1, is_temp_password = false, temp_password_expires_at = NULL, force_password_change = false, sessions_revoked_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
      [newPasswordHash, decoded.userId]
    );

    await revokeAllUserSessions(decoded.userId);

    logger.info('Password reset completed', { userId: decoded.userId });
    res.status(200).json({
      success: true,
      message: 'Your password has been reset. You can now sign in with your new password.',
    });
  } catch (error) {
    logger.error('Reset password error', { error });
    res.status(500).json({ success: false, message: 'Failed to reset password.' });
  }
}

/**
 * POST /auth/resend-reset-otp — resend OTP for forgot-password flow.
 * Validates that the email exists AND matches the specified role before sending reset email.
 */
export async function resendResetOtp(req: Request, res: Response): Promise<void> {
  try {
    const { email, role } = req.body as { email: string; role: 'admin' | 'employee' };
    const normalizedEmail = (email || '').trim().toLowerCase();
    if (!normalizedEmail) {
      res.status(400).json({ success: false, message: 'Email is required' });
      return;
    }

    if (!role || !['admin', 'employee'].includes(role)) {
      res.status(400).json({ success: false, message: 'Valid role (admin or employee) is required' });
      return;
    }

    const userResult = await pool.query(
      `SELECT id, email, name, username, role, auth_provider FROM users WHERE LOWER(email) = $1 AND is_active = true AND auth_provider = 'local'`,
      [normalizedEmail]
    );

    if (userResult.rows.length === 0) {
      // User not found
      const errorMessage = role === 'admin' 
        ? 'No admin is registered with this email'
        : 'No employee is registered with this email';
      res.status(404).json({ success: false, message: errorMessage });
      return;
    }

    const user = userResult.rows[0];

    // Validate that the user's role matches the requested role
    if (user.role !== role) {
      const errorMessage = role === 'admin' 
        ? 'No admin is registered with this email'
        : 'No employee is registered with this email';
      res.status(404).json({ success: false, message: errorMessage });
      return;
    }

    const otp = generateOtp();
    const otpHash = await hashPassword(otp);
    const otpExpiresAt = new Date(Date.now() + RESET_OTP_EXPIRY_MINUTES * 60 * 1000);

    await pool.query(
      `UPDATE users SET reset_otp_hash = $1, reset_otp_expires_at = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3`,
      [otpHash, otpExpiresAt, user.id]
    );

    if (!EmailService.isEmailConfigured()) {
      if (process.env.NODE_ENV === 'development') {
        logger.info('DEV: Email not configured. Resend reset OTP (check server logs)', { email: normalizedEmail, otp });
      }
      res.status(503).json({
        success: false,
        message: process.env.NODE_ENV === 'development'
          ? 'Email is not configured. In development, check server logs for the code.'
          : 'Email is not configured. Please contact support.',
      });
      return;
    }

    try {
      await EmailService.sendPasswordResetOtpEmail(normalizedEmail, otp, user.name || user.username || normalizedEmail);
    } catch (emailError) {
      logger.error('Resend reset OTP: failed to send email', { error: emailError, email: normalizedEmail });
      res.status(503).json({ success: false, message: 'Could not send email. Please try again later.' });
      return;
    }

    logger.info('Password reset OTP resent', { email: normalizedEmail, role: user.role });
    res.status(200).json({ success: true, message: 'A new code has been sent to your email.' });
  } catch (error) {
    logger.error('Resend reset OTP error', { error });
    res.status(500).json({ success: false, message: 'Failed to resend code.' });
  }
}
