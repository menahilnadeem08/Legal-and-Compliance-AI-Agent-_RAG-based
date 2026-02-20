import { Response } from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import pool from '../config/database';
import logger from '../utils/logger';
import { hashPassword, comparePassword, validatePassword } from '../utils/passwordUtils';
import { AuthenticatedRequest } from '../types';
import { EmailService } from '../utils/emailService';
import { JWT_SECRET } from '../config/secrets';
import { createSession } from '../helpers/sessionHelper';
import { authError, authSuccess, isDbError, lockedMessage, ERROR_CODES } from '../utils/authErrors';

const ACCESS_TOKEN_EXPIRE = '15m';
const OTP_EXPIRY_MINUTES = 10;

function generateOtp(): string {
  return crypto.randomInt(100000, 999999).toString();
}

function generateAccessToken(payload: object): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRE });
}

export async function adminSignup(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { username, email, password, confirmPassword, companyName } = req.body;

    if (!username || !email || !password || !confirmPassword) {
      logger.warn('[ADMIN:adminSignup] Missing required fields');
      authError(res, 400, 'Name, email, and password are required', ERROR_CODES.MISSING_FIELDS);
      return;
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      logger.warn('[ADMIN:adminSignup] Invalid email format');
      authError(res, 400, 'Please enter a valid email address', ERROR_CODES.INVALID_EMAIL_FORMAT);
      return;
    }

    if (password !== confirmPassword) {
      logger.warn('[ADMIN:adminSignup] Passwords do not match');
      authError(res, 400, 'Passwords do not match', ERROR_CODES.MISSING_FIELDS);
      return;
    }

    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
      logger.warn('[ADMIN:adminSignup] Weak password');
      authError(res, 400, 'Password must be at least 8 characters with uppercase, number, and special character', ERROR_CODES.WEAK_PASSWORD);
      return;
    }

    const client = await pool.connect();

    try {
      const existingUsername = await client.query(
        'SELECT id FROM users WHERE username = $1',
        [username]
      );

      if (existingUsername.rows.length > 0) {
        client.release();
        logger.warn(`[ADMIN:adminSignup] Username exists: ${username}`);
        authError(res, 409, 'An account with this email already exists', ERROR_CODES.EMAIL_EXISTS);
        return;
      }

      const existingEmail = await client.query(
        'SELECT id, email_verified FROM users WHERE email = $1',
        [email]
      );

      if (existingEmail.rows.length > 0) {
        if (existingEmail.rows[0].email_verified) {
          client.release();
          logger.warn(`[ADMIN:adminSignup] Email exists (verified): ${email}`);
          authError(res, 409, 'An account with this email already exists', ERROR_CODES.EMAIL_EXISTS);
          return;
        }
        await client.query('DELETE FROM users WHERE id = $1', [existingEmail.rows[0].id]);
      }

      const passwordHash = await hashPassword(password);
      const otp = generateOtp();
      const otpHash = await hashPassword(otp);
      const otpExpiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

      const newUser = await client.query(
        `INSERT INTO users (username, email, password_hash, name, role, auth_provider, is_active, email_verified, otp_code, otp_expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING id, username, email, name, role`,
        [username, email, passwordHash, companyName || username, 'admin', 'local', true, false, otpHash, otpExpiresAt]
      );

      const user = newUser.rows[0];

      try {
        await EmailService.sendOtpEmail(email, otp, user.name || username);
      } catch (emailError) {
        logger.error('[ADMIN:adminSignup] Email send failed', { message: (emailError as any)?.message, stack: (emailError as any)?.stack });
        client.release();
        authError(res, 500, 'Account created but verification email failed to send. Contact support', ERROR_CODES.UNEXPECTED_ERROR);
        return;
      }

      client.release();

      authSuccess(res, 201, {
        message: 'Account created. Please verify your email with the OTP sent to your inbox.',
        requiresVerification: true,
        email: user.email
      });
    } catch (error) {
      client.release();
      throw error;
    }
  } catch (error: any) {
    logger.error('[ADMIN:adminSignup] Unexpected error', { message: error?.message, stack: error?.stack });
    if (isDbError(error)) {
      authError(res, 503, 'Service temporarily unavailable', ERROR_CODES.SERVICE_UNAVAILABLE);
      return;
    }
    authError(res, 500, 'An unexpected error occurred', ERROR_CODES.UNEXPECTED_ERROR);
  }
}

export async function adminLogin(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { username, email, password } = req.body;
    const loginIdentifier = username || email;

    if (!loginIdentifier || !password) {
      logger.warn('[ADMIN:adminLogin] Missing credentials');
      authError(res, 400, 'Email and password are required', ERROR_CODES.MISSING_FIELDS);
      return;
    }

    const userResult = await pool.query(
      `SELECT id, username, email, name, role, password_hash, is_active, auth_provider, email_verified, locked_until
       FROM users
       WHERE ${username ? 'username' : 'email'} = $1 AND role = 'admin'`,
      [loginIdentifier]
    );

    if (userResult.rows.length === 0) {
      logger.warn('[ADMIN:adminLogin] User not found');
      authError(res, 401, 'Invalid email or password', ERROR_CODES.INVALID_CREDENTIALS);
      return;
    }

    const user = userResult.rows[0];

    // Check if account is locked
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      logger.warn(`[ADMIN:adminLogin] Account locked: ${user.email}`);
      authError(res, 423, lockedMessage(new Date(user.locked_until)), ERROR_CODES.ACCOUNT_LOCKED);
      return;
    }

    // Check if account is inactive
    if (!user.is_active) {
      logger.warn(`[ADMIN:adminLogin] Inactive account: ${user.email}`);
      authError(res, 403, 'Account has been deactivated', ERROR_CODES.ACCOUNT_INACTIVE);
      return;
    }

    // Check if using Google OAuth
    if (user.auth_provider === 'google' || !user.password_hash) {
      logger.warn(`[ADMIN:adminLogin] Google OAuth account: ${user.email}`);
      authError(res, 403, 'This account uses Google Sign-In. Please use the Google login button', ERROR_CODES.GOOGLE_ACCOUNT);
      return;
    }

    // Check email verification
    if (!user.email_verified) {
      logger.warn(`[ADMIN:adminLogin] Unverified email: ${user.email}`);
      authError(res, 403, 'Please verify your email. Check your inbox for the verification code', ERROR_CODES.EMAIL_UNVERIFIED);
      return;
    }

    // Check password
    const passwordMatch = await comparePassword(password, user.password_hash);
    if (!passwordMatch) {
      logger.warn(`[ADMIN:adminLogin] Invalid password: ${user.email}`);
      authError(res, 401, 'Invalid email or password', ERROR_CODES.INVALID_CREDENTIALS);
      return;
    }

    const tokenPayload = { id: user.id, username: user.username, email: user.email, role: user.role };
    const accessToken = generateAccessToken(tokenPayload);
    const refreshToken = await createSession(user.id);

    authSuccess(res, 200, {
      message: 'Admin login successful',
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        name: user.name,
        role: user.role,
        email_verified: user.email_verified
      }
    });
  } catch (error: any) {
    logger.error('[ADMIN:adminLogin] Unexpected error', { message: error?.message, stack: error?.stack });
    if (isDbError(error)) {
      authError(res, 503, 'Service temporarily unavailable', ERROR_CODES.SERVICE_UNAVAILABLE);
      return;
    }
    authError(res, 500, 'An unexpected error occurred', ERROR_CODES.UNEXPECTED_ERROR);
  }
}

export async function verifyOtp(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      logger.warn('[ADMIN:verifyOtp] Missing email or OTP');
      authError(res, 400, 'Email and OTP are required', ERROR_CODES.MISSING_FIELDS);
      return;
    }

    const userResult = await pool.query(
      `SELECT id, username, email, name, role, otp_code, otp_expires_at, otp_failed_attempts
       FROM users
       WHERE email = $1 AND role = 'admin' AND email_verified = false`,
      [email]
    );

    if (userResult.rows.length === 0) {
      logger.warn(`[ADMIN:verifyOtp] Email not found: ${email}`);
      authError(res, 404, 'No account found with this email', ERROR_CODES.NOT_FOUND);
      return;
    }

    const user = userResult.rows[0];

    // Check if already verified
    if (user.email_verified) {
      logger.warn(`[ADMIN:verifyOtp] Already verified: ${email}`);
      authError(res, 409, 'Email already verified. Please login', ERROR_CODES.OTP_ALREADY_VERIFIED);
      return;
    }

    if (!user.otp_code || !user.otp_expires_at) {
      logger.warn(`[ADMIN:verifyOtp] No OTP found: ${email}`);
      authError(res, 400, 'No OTP found. Please request a new one', ERROR_CODES.MISSING_FIELDS);
      return;
    }

    // Check if OTP expired
    if (new Date() > new Date(user.otp_expires_at)) {
      logger.warn(`[ADMIN:verifyOtp] OTP expired: ${email}`);
      authError(res, 410, 'OTP has expired. Please request a new one', ERROR_CODES.OTP_EXPIRED);
      return;
    }

    // Check failed attempts (max 5)
    if (user.otp_failed_attempts && user.otp_failed_attempts >= 5) {
      logger.warn(`[ADMIN:verifyOtp] Too many failed attempts: ${email}`);
      authError(res, 429, 'Too many failed attempts. Please request a new OTP', ERROR_CODES.TOO_MANY_ATTEMPTS);
      return;
    }

    // Verify OTP
    const otpMatch = await comparePassword(otp, user.otp_code);
    if (!otpMatch) {
      logger.warn(`[ADMIN:verifyOtp] Invalid OTP: ${email}`);
      // Increment failed attempts
      await pool.query(
        'UPDATE users SET otp_failed_attempts = COALESCE(otp_failed_attempts, 0) + 1 WHERE id = $1',
        [user.id]
      );
      authError(res, 401, 'Invalid OTP. Please check and try again', ERROR_CODES.OTP_INVALID);
      return;
    }

    // Clear OTP and mark as verified
    await pool.query(
      `UPDATE users 
       SET email_verified = true, email_verified_at = NOW(), otp_code = NULL, otp_expires_at = NULL, otp_failed_attempts = 0, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $1`,
      [user.id]
    );

    const tokenPayload = { id: user.id, username: user.username, email: user.email, role: user.role };
    const accessToken = generateAccessToken(tokenPayload);
    const refreshToken = await createSession(user.id);

    authSuccess(res, 200, {
      message: 'Email verified successfully',
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        name: user.name,
        role: user.role
      }
    });
  } catch (error: any) {
    logger.error('[ADMIN:verifyOtp] Unexpected error', { message: error?.message, stack: error?.stack });
    if (isDbError(error)) {
      authError(res, 503, 'Service temporarily unavailable', ERROR_CODES.SERVICE_UNAVAILABLE);
      return;
    }
    authError(res, 500, 'An unexpected error occurred', ERROR_CODES.UNEXPECTED_ERROR);
  }
}

export async function resendOtp(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { email } = req.body;

    if (!email) {
      logger.warn('[ADMIN:resendOtp] Missing email');
      authError(res, 400, 'Email is required', ERROR_CODES.MISSING_FIELDS);
      return;
    }

    const userResult = await pool.query(
      `SELECT id, name, email, email_verified FROM users WHERE email = $1 AND role = 'admin'`,
      [email]
    );

    if (userResult.rows.length === 0) {
      logger.warn(`[ADMIN:resendOtp] Email not found: ${email}`);
      authError(res, 404, 'No account found with this email', ERROR_CODES.NOT_FOUND);
      return;
    }

    const user = userResult.rows[0];

    // Check if already verified
    if (user.email_verified) {
      logger.warn(`[ADMIN:resendOtp] Already verified: ${email}`);
      authError(res, 409, 'Email already verified. Please login', ERROR_CODES.OTP_ALREADY_VERIFIED);
      return;
    }

    const otp = generateOtp();
    const otpHash = await hashPassword(otp);
    const otpExpiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

    await pool.query(
      'UPDATE users SET otp_code = $1, otp_expires_at = $2, otp_failed_attempts = 0, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
      [otpHash, otpExpiresAt, user.id]
    );

    try {
      await EmailService.sendOtpEmail(email, otp, user.name || email);
    } catch (emailError) {
      logger.error('[ADMIN:resendOtp] Email send failed', { message: (emailError as any)?.message, stack: (emailError as any)?.stack });
      authError(res, 500, 'Failed to send OTP. Please try again', ERROR_CODES.UNEXPECTED_ERROR);
      return;
    }

    authSuccess(res, 200, { message: 'A new OTP has been sent to your email' });
  } catch (error: any) {
    logger.error('[ADMIN:resendOtp] Unexpected error', { message: error?.message, stack: error?.stack });
    if (isDbError(error)) {
      authError(res, 503, 'Service temporarily unavailable', ERROR_CODES.SERVICE_UNAVAILABLE);
      return;
    }
    authError(res, 500, 'An unexpected error occurred', ERROR_CODES.UNEXPECTED_ERROR);
  }
}
