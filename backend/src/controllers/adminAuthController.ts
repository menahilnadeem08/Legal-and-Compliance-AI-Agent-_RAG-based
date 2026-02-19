import { Response } from 'express';
import jwt from 'jsonwebtoken';
import pool from '../config/database';
import { hashPassword, comparePassword, validatePassword } from '../utils/passwordUtils';
import { AuthenticatedRequest } from '../types';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRE = '7d';

// Admin Signup - Create a new admin account
export async function adminSignup(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    console.log('[ADMIN-SIGNUP] 🔐 Admin signup endpoint called');

    const { username, email, password, confirmPassword, companyName } = req.body;

    console.log('[ADMIN-SIGNUP] Request details:', {
      username,
      email,
      hasPassword: !!password,
      companyName
    });

    // Validate input
    if (!username || !email || !password || !confirmPassword) {
      console.log('[ADMIN-SIGNUP] ❌ Missing required fields');
      res.status(400).json({ error: 'Username, email, password, and confirm password are required' });
      return;
    }

    // Validate passwords match
    if (password !== confirmPassword) {
      console.log('[ADMIN-SIGNUP] ❌ Passwords do not match');
      res.status(400).json({ error: 'Passwords do not match' });
      return;
    }

    // Validate password format
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
      console.log('[ADMIN-SIGNUP] ❌ Password validation failed:', passwordValidation.errors);
      res.status(400).json({
        error: 'Password does not meet requirements',
        details: passwordValidation.errors
      });
      return;
    }

    console.log('[ADMIN-SIGNUP] ✓ All validations passed');

    const client = await pool.connect();

    try {
      // Check if username already exists
      console.log('[ADMIN-SIGNUP] ✓ Checking if username exists...');
      const existingUsername = await client.query(
        'SELECT id FROM users WHERE username = $1',
        [username]
      );

      if (existingUsername.rows.length > 0) {
        console.log('[ADMIN-SIGNUP] ❌ Username already exists:', username);
        res.status(409).json({ error: 'Username already exists' });
        return;
      }

      // Check if email already exists
      console.log('[ADMIN-SIGNUP] ✓ Checking if email exists...');
      const existingEmail = await client.query(
        'SELECT id FROM users WHERE email = $1',
        [email]
      );

      if (existingEmail.rows.length > 0) {
        console.log('[ADMIN-SIGNUP] ❌ Email already exists:', email);
        res.status(409).json({ error: 'Email already exists' });
        return;
      }

      console.log('[ADMIN-SIGNUP] ✓ Username and email are unique');

      // Hash password
      console.log('[ADMIN-SIGNUP] ✓ Hashing password...');
      const passwordHash = await hashPassword(password);

      // Create admin user with local auth
      console.log('[ADMIN-SIGNUP] ✓ Creating admin user with local auth...');
      const newUser = await client.query(
        `INSERT INTO users (username, email, password_hash, name, role, auth_provider, is_active, email_verified, email_verified_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id, username, email, name, role, auth_provider, created_at`,
        [username, email, passwordHash, companyName || username, 'admin', 'local', true, true, new Date()]
      );

      const user = newUser.rows[0];
      console.log('[ADMIN-SIGNUP] ✓ Admin user created with ID:', user.id);

      // Generate JWT token
      console.log('[ADMIN-SIGNUP] ✓ Generating JWT token...');
      const token = jwt.sign(
        {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role
        },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRE }
      );

      // Store session in database
      console.log('[ADMIN-SIGNUP] ✓ Storing session in database...');
      await client.query(
        'INSERT INTO sessions (user_id, token, expires_at) VALUES ($1, $2, NOW() + INTERVAL \'7 days\')',
        [user.id, token]
      );

      client.release();

      console.log('[ADMIN-SIGNUP] ✅ Admin signup successful');

      res.status(201).json({
        message: 'Admin account created successfully',
        token,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          name: user.name,
          role: user.role
        }
      });
    } catch (error) {
      client.release();
      throw error;
    }
  } catch (error) {
    console.error('[ADMIN-SIGNUP] ❌ Error:', error);
    console.error('[ADMIN-SIGNUP] Stack:', error instanceof Error ? error.stack : '');
    res.status(500).json({ error: 'Admin signup failed' });
  }
}

// Admin Login - Local login for admin users
// Supports username or email login
// Blocks password login for Google-only accounts
export async function adminLogin(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    console.log('[ADMIN-LOGIN] 🔐 Admin login endpoint called');

    const { username, email, password } = req.body;

    console.log('[ADMIN-LOGIN] Request details:', {
      username: username ? 'provided' : 'not provided',
      email: email ? 'provided' : 'not provided',
      hasPassword: !!password
    });

    // Support both username and email for login
    const loginIdentifier = username || email;

    if (!loginIdentifier || !password) {
      console.log('[ADMIN-LOGIN] ❌ Missing username/email or password');
      res.status(400).json({ error: 'Username/email and password are required' });
      return;
    }

    console.log('[ADMIN-LOGIN] ✓ Validating password format...');

    // Validate password format
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
      console.log('[ADMIN-LOGIN] ❌ Password validation failed:', passwordValidation.errors);
      res.status(400).json({
        error: 'Invalid password format',
        details: passwordValidation.errors
      });
      return;
    }

    console.log('[ADMIN-LOGIN] ✓ Querying admin user by', username ? 'username' : 'email', ':', loginIdentifier);

    // Query for admin user
    const userResult = await pool.query(
      `SELECT id, username, email, name, role, password_hash, is_active, auth_provider, email_verified
       FROM users
       WHERE ${username ? 'username' : 'email'} = $1 AND role = 'admin' AND is_active = true`,
      [loginIdentifier]
    );

    console.log('[ADMIN-LOGIN] Query returned', userResult.rows.length, 'user(s)');

    if (userResult.rows.length === 0) {
      console.log('[ADMIN-LOGIN] ❌ Admin user not found or not active');
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const user = userResult.rows[0];
    console.log('[ADMIN-LOGIN] ✓ Admin user found:', { id: user.id, email: user.email, auth_provider: user.auth_provider });

    // Block password login for Google-only accounts
    if (user.auth_provider === 'google' || !user.password_hash) {
      console.log('[ADMIN-LOGIN] ❌ Password login blocked for Google-only account');
      res.status(403).json({ 
        error: 'This account uses Google OAuth. Please sign in with Google.',
        auth_provider: 'google'
      });
      return;
    }

    // Check if email is verified (for local accounts)
    if (!user.email_verified) {
      console.log('[ADMIN-LOGIN] ❌ Email not verified for local account');
      res.status(403).json({ 
        error: 'Email verification required. Please check your email.',
        email_verified: false
      });
      return;
    }

    console.log('[ADMIN-LOGIN] ✓ Comparing password...');

    // Compare password
    const passwordMatch = await comparePassword(password, user.password_hash);
    if (!passwordMatch) {
      console.log('[ADMIN-LOGIN] ❌ Password mismatch');
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    console.log('[ADMIN-LOGIN] ✓ Password matched');
    console.log('[ADMIN-LOGIN] ✓ Generating JWT token with role claim...');

    // Generate JWT token with role claim
    const token = jwt.sign(
      {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRE }
    );

    console.log('[ADMIN-LOGIN] ✓ Token generated, storing session...');

    // Store session in database
    await pool.query(
      'INSERT INTO sessions (user_id, token, expires_at) VALUES ($1, $2, NOW() + INTERVAL \'7 days\')',
      [user.id, token]
    );

    console.log('[ADMIN-LOGIN] ✅ Admin login successful');

    res.json({
      message: 'Admin login successful',
      token,
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
    console.error('[ADMIN-LOGIN] ❌ Error in admin login:', error);
    console.error('[ADMIN-LOGIN] Stack trace:', error instanceof Error ? error.stack : '');
    res.status(500).json({ error: 'Admin login failed' });
  }
}
