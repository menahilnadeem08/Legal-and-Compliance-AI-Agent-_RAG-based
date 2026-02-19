import { Response } from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import pool from '../config/database';
import { hashPassword, comparePassword, validatePassword } from '../utils/passwordUtils';
import { AuthenticatedRequest } from '../types';
import { EmailService } from '../utils/emailService';
import { JWT_SECRET } from '../config/secrets';
import { createSession } from '../helpers/sessionHelper';

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
      res.status(400).json({ error: 'Username, email, password, and confirm password are required' });
      return;
    }

    if (password !== confirmPassword) {
      res.status(400).json({ error: 'Passwords do not match' });
      return;
    }

    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
      res.status(400).json({
        error: 'Password does not meet requirements',
        details: passwordValidation.errors
      });
      return;
    }

    const client = await pool.connect();

    try {
      const existingUsername = await client.query(
        'SELECT id FROM users WHERE username = $1',
        [username]
      );

      if (existingUsername.rows.length > 0) {
        res.status(409).json({ error: 'Username already exists' });
        return;
      }

      const existingEmail = await client.query(
        'SELECT id, email_verified FROM users WHERE email = $1',
        [email]
      );

      if (existingEmail.rows.length > 0) {
        if (existingEmail.rows[0].email_verified) {
          res.status(409).json({ error: 'Email already exists' });
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

      await EmailService.sendOtpEmail(email, otp, user.name || username);

      client.release();

      res.status(201).json({
        message: 'Account created. Please verify your email with the OTP sent to your inbox.',
        requiresVerification: true,
        email: user.email
      });
    } catch (error) {
      client.release();
      throw error;
    }
  } catch (error) {
    console.error('[ADMIN-SIGNUP] Error:', error);
    res.status(500).json({ error: 'Admin signup failed' });
  }
}

export async function adminLogin(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { username, email, password } = req.body;
    const loginIdentifier = username || email;

    if (!loginIdentifier || !password) {
      res.status(400).json({ error: 'Username/email and password are required' });
      return;
    }

    const userResult = await pool.query(
      `SELECT id, username, email, name, role, password_hash, is_active, auth_provider, email_verified
       FROM users
       WHERE ${username ? 'username' : 'email'} = $1 AND role = 'admin' AND is_active = true`,
      [loginIdentifier]
    );

    if (userResult.rows.length === 0) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const user = userResult.rows[0];

    if (user.auth_provider === 'google' || !user.password_hash) {
      res.status(403).json({
        error: 'This account uses Google OAuth. Please sign in with Google.',
        auth_provider: 'google'
      });
      return;
    }

    if (!user.email_verified) {
      res.status(403).json({
        error: 'Email verification required. Please check your email.',
        email_verified: false
      });
      return;
    }

    const passwordMatch = await comparePassword(password, user.password_hash);
    if (!passwordMatch) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const tokenPayload = { id: user.id, username: user.username, email: user.email, role: user.role };
    const accessToken = generateAccessToken(tokenPayload);
    const refreshToken = await createSession(user.id);

    res.json({
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
  } catch (error) {
    console.error('[ADMIN-LOGIN] Error:', error);
    res.status(500).json({ error: 'Admin login failed' });
  }
}

export async function verifyOtp(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      res.status(400).json({ error: 'Email and OTP are required' });
      return;
    }

    const userResult = await pool.query(
      `SELECT id, username, email, name, role, otp_code, otp_expires_at
       FROM users
       WHERE email = $1 AND role = 'admin' AND email_verified = false`,
      [email]
    );

    if (userResult.rows.length === 0) {
      res.status(404).json({ error: 'No pending verification found for this email' });
      return;
    }

    const user = userResult.rows[0];

    if (!user.otp_code || !user.otp_expires_at) {
      res.status(400).json({ error: 'No OTP found. Please request a new one.' });
      return;
    }

    if (new Date() > new Date(user.otp_expires_at)) {
      res.status(401).json({ error: 'OTP has expired. Please request a new one.' });
      return;
    }

    const otpMatch = await comparePassword(otp, user.otp_code);
    if (!otpMatch) {
      res.status(401).json({ error: 'Invalid OTP' });
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

    res.json({
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
  } catch (error) {
    console.error('[VERIFY-OTP] Error:', error);
    res.status(500).json({ error: 'OTP verification failed' });
  }
}

export async function resendOtp(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { email } = req.body;

    if (!email) {
      res.status(400).json({ error: 'Email is required' });
      return;
    }

    const userResult = await pool.query(
      `SELECT id, name, email FROM users WHERE email = $1 AND role = 'admin' AND email_verified = false`,
      [email]
    );

    if (userResult.rows.length === 0) {
      res.status(404).json({ error: 'No pending verification found for this email' });
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

    await EmailService.sendOtpEmail(email, otp, user.name || email);

    res.json({ message: 'A new OTP has been sent to your email' });
  } catch (error) {
    console.error('[RESEND-OTP] Error:', error);
    res.status(500).json({ error: 'Failed to resend OTP' });
  }
}
