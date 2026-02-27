import { Response } from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import pool from '../config/database';
import { hashPassword, comparePassword } from '../utils/passwordUtils';
import { AuthenticatedRequest } from '../types';
import { EmailService } from '../utils/emailService';
import { JWT_SECRET } from '../config/secrets';
import { createSession } from '../helpers/sessionHelper';
import logger from '../utils/logger';

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

    const client = await pool.connect();

    try {
      const existingUsername = await client.query(
        'SELECT id FROM users WHERE username = $1',
        [username]
      );

      if (existingUsername.rows.length > 0) {
        res.status(409).json({ success: false, message: 'Username already exists' });
        return;
      }

      const existingEmail = await client.query(
        'SELECT id, email_verified FROM users WHERE email = $1',
        [email]
      );

      if (existingEmail.rows.length > 0) {
        if (existingEmail.rows[0].email_verified) {
          res.status(409).json({ success: false, message: 'Email already exists' });
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

      if (!EmailService.isEmailConfigured()) {
        if (process.env.NODE_ENV === 'development') {
          logger.info('DEV: Email not configured. Admin signup OTP (check server logs)', { email, otp });
        }
        client.release();
        res.status(503).json({
          success: false,
          message: process.env.NODE_ENV === 'development'
            ? 'Email is not configured. In development, check server logs for the OTP.'
            : 'Email is not configured. Please contact support.',
        });
        return;
      }

      try {
        await EmailService.sendOtpEmail(email, otp, user.name || username);
      } catch (emailError) {
        client.release();
        logger.error('Admin signup: failed to send OTP email', { error: emailError, email });
        res.status(503).json({
          success: false,
          message: 'Could not send verification email. Please try again later or contact support.',
        });
        return;
      }

      client.release();

      res.status(201).json({
        success: true,
        message: 'Admin account created. Please verify your email with the OTP sent to your inbox.',
        data: { user: { id: user.id, username: user.username, email: user.email, name: user.name, role: user.role }, requiresVerification: true, email: user.email },
      });
    } catch (error) {
      client.release();
      throw error;
    }
  } catch (error) {
    logger.error('Admin signup error', { error });
    res.status(500).json({ success: false, message: 'Admin signup failed' });
  }
}

export async function adminLogin(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { username, email, password } = req.body;
    const loginIdentifier = username || email;

    const userResult = await pool.query(
      `SELECT id, username, email, name, role, password_hash, is_active, auth_provider, email_verified
       FROM users
       WHERE ${username ? 'username' : 'email'} = $1 AND role = 'admin' AND is_active = true`,
      [loginIdentifier]
    );

    if (userResult.rows.length === 0) {
      logger.warn('Admin login failed - invalid credentials', { identifier: loginIdentifier });
      res.status(401).json({ success: false, message: 'Invalid credentials' });
      return;
    }

    const user = userResult.rows[0];

    if (user.auth_provider === 'google' || !user.password_hash) {
      res.status(403).json({
        success: false,
        message: 'This account uses Google OAuth. Please sign in with Google.',
        auth_provider: 'google'
      });
      return;
    }

    if (!user.email_verified) {
      logger.warn('Admin login failed - email not verified', { identifier: loginIdentifier });
      res.status(403).json({
        success: false,
        message: 'Email verification required. Please check your email.',
        email_verified: false
      });
      return;
    }

    const passwordMatch = await comparePassword(password, user.password_hash);
    if (!passwordMatch) {
      logger.warn('Admin login failed - wrong password', { identifier: loginIdentifier });
      res.status(401).json({ success: false, message: 'Invalid credentials' });
      return;
    }

    const tokenPayload = { id: user.id, username: user.username, email: user.email, role: user.role };
    const accessToken = generateAccessToken(tokenPayload);
    const refreshToken = await createSession(user.id);

    logger.info('Admin login success', { username: user.username, email: user.email });
    res.status(200).json({
      success: true,
      message: 'Admin login successful',
      data: {
        user: { id: user.id, username: user.username, email: user.email, name: user.name, role: user.role, email_verified: user.email_verified },
        accessToken,
        refreshToken,
      },
    });
  } catch (error) {
    logger.error('Admin login error', { error });
    res.status(500).json({ success: false, message: 'Admin login failed' });
  }
}

export async function verifyOtp(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { email, otp } = req.body;

    const userResult = await pool.query(
      `SELECT id, username, email, name, role, otp_code, otp_expires_at
       FROM users
       WHERE email = $1 AND role = 'admin' AND email_verified = false`,
      [email]
    );

    if (userResult.rows.length === 0) {
      logger.warn('OTP verification failed - no pending verification', { email });
      res.status(404).json({ success: false, message: 'No pending verification found for this email' });
      return;
    }

    const user = userResult.rows[0];

    if (!user.otp_code || !user.otp_expires_at) {
      res.status(400).json({ success: false, message: 'No OTP found. Please request a new one.' });
      return;
    }

    if (new Date() > new Date(user.otp_expires_at)) {
      logger.warn('OTP verification failed - OTP expired', { email });
      res.status(401).json({ success: false, message: 'OTP has expired. Please request a new one.' });
      return;
    }

    const otpMatch = await comparePassword(otp, user.otp_code);
    if (!otpMatch) {
      logger.warn('OTP verification failed - invalid OTP', { email });
      res.status(401).json({ success: false, message: 'Invalid OTP' });
      return;
    }

    await pool.query(
      `UPDATE users 
       SET email_verified = true, email_verified_at = NOW(), otp_code = NULL, otp_expires_at = NULL, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $1`,
      [user.id]
    );

    const tokenPayload = { id: user.id, username: user.username, email: user.email, role: user.role };
    const accessToken = generateAccessToken(tokenPayload);
    const refreshToken = await createSession(user.id);

    logger.info('OTP verified successfully', { email: user.email });
    res.status(200).json({
      success: true,
      message: 'OTP verified successfully',
      data: {
        user: { id: user.id, username: user.username, email: user.email, name: user.name, role: user.role },
        accessToken,
        refreshToken,
      },
    });
  } catch (error) {
    logger.error('Verify OTP error', { error });
    res.status(500).json({ success: false, message: 'OTP verification failed' });
  }
}

export async function resendOtp(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { email } = req.body;

    const userResult = await pool.query(
      `SELECT id, name, email FROM users WHERE email = $1 AND role = 'admin' AND email_verified = false`,
      [email]
    );

    if (userResult.rows.length === 0) {
      logger.warn('OTP resend requested - no pending verification', { email });
      res.status(404).json({ success: false, message: 'No pending verification found for this email' });
      return;
    }

    const user = userResult.rows[0];

    const otp = generateOtp();
    const otpHash = await hashPassword(otp);
    const otpExpiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

    await pool.query(
      'UPDATE users SET otp_code = $1, otp_expires_at = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
      [otpHash, otpExpiresAt, user.id]
    );

    if (!EmailService.isEmailConfigured()) {
      if (process.env.NODE_ENV === 'development') {
        logger.info('DEV: Email not configured. Admin resend OTP (check server logs)', { email, otp });
      }
      res.status(503).json({
        success: false,
        message: process.env.NODE_ENV === 'development'
          ? 'Email is not configured. In development, check server logs for the OTP.'
          : 'Email is not configured. Please contact support.',
      });
      return;
    }

    try {
      await EmailService.sendOtpEmail(email, otp, user.name || email);
    } catch (emailError) {
      logger.error('Resend OTP: failed to send email', { error: emailError, email });
      res.status(503).json({ success: false, message: 'Could not send email. Please try again later.' });
      return;
    }

    logger.info('OTP resend sent', { email });
    res.status(200).json({ success: true, message: 'OTP resent successfully' });
  } catch (error) {
    logger.error('Resend OTP error', { error });
    res.status(500).json({ success: false, message: 'Failed to resend OTP' });
  }
}
