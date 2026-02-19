import { Response } from 'express';
import jwt from 'jsonwebtoken';
import pool from '../config/database';
import { hashPassword, comparePassword, validatePassword } from '../utils/passwordUtils';
import { AuthenticatedRequest } from '../types';
import { TempPasswordService } from '../services/tempPasswordService';
import { AuditLogRepository } from '../repositories/invitationRepository';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRE = '7d';

// Employee/Local login
export async function login(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    console.log('[AUTH-CONTROLLER] 🔑 Login endpoint called');
    console.log('[AUTH-CONTROLLER] Request body keys:', Object.keys(req.body));

    const { username, email, password } = req.body;
    const ipAddress = req.headers['x-forwarded-for'] as string || req.socket.remoteAddress || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';

    console.log('[AUTH-CONTROLLER] Received:', {
      username: username ? 'yes' : 'no',
      email: email ? 'yes' : 'no',
      password: password ? 'yes' : 'no'
    });

    // Support both username and email
    const loginIdentifier = username || email;

    if (!loginIdentifier || !password) {
      console.log('[AUTH-CONTROLLER] ❌ Missing username/email or password');
      res.status(400).json({ error: 'Username/email and password are required' });
      return;
    }

    console.log('[AUTH-CONTROLLER] ✓ Querying user by', username ? 'username' : 'email', ':', loginIdentifier);

    const userResult = await pool.query(
      `SELECT id, username, email, name, role, password_hash, is_active, auth_provider, admin_id,
              is_temp_password, temp_password_expires_at, force_password_change
       FROM users
       WHERE ${username ? 'username' : 'email'} = $1 AND auth_provider = 'local' AND is_active = true`,
      [loginIdentifier]
    );

    console.log('[AUTH-CONTROLLER] Query returned', userResult.rows.length, 'user(s)');

    if (userResult.rows.length === 0) {
      console.log('[AUTH-CONTROLLER] ❌ User not found or not active');
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const user = userResult.rows[0];
    console.log('[AUTH-CONTROLLER] ✓ User found:', { id: user.id, email: user.email, role: user.role });

    // Check if user has temporary password
    if (user.is_temp_password) {
      console.log('[AUTH-CONTROLLER] ✓ User has temporary password, validating...');

      try {
        // Validate temp password
        const tempPasswordValid = await TempPasswordService.validateTempPassword(user.id, password);

        if (!tempPasswordValid) {
          console.log('[AUTH-CONTROLLER] ❌ Temporary password mismatch');
          res.status(401).json({ error: 'Invalid credentials' });
          return;
        }

        console.log('[AUTH-CONTROLLER] ✓ Temporary password validated');

        // Log the login event (use admin_id if available, otherwise skip audit)
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
            console.error('[AUTH-CONTROLLER] ⚠️  Audit log failed (non-critical):', auditError);
          }
        }

        // Generate JWT token with forcePasswordChange flag
        const token = jwt.sign(
          {
            id: user.id,
            username: user.username,
            email: user.email,
            role: user.role,
            forcePasswordChange: true,
          },
          JWT_SECRET,
          { expiresIn: JWT_EXPIRE }
        );

        console.log('[AUTH-CONTROLLER] ✓ JWT token generated with forcePasswordChange flag');

        // Store session in database
        await pool.query(
          'INSERT INTO sessions (user_id, token, expires_at) VALUES ($1, $2, NOW() + INTERVAL \'7 days\')',
          [user.id, token]
        );

        console.log('[AUTH-CONTROLLER] ✅ Login successful with temporary password');

        res.json({
          message: 'Login successful. Please change your password.',
          token,
          user: {
            id: user.id,
            username: user.username,
            email: user.email,
            role: user.role,
          },
          forcePasswordChange: true,
        });
        return;
      } catch (tempPassError: any) {
        console.error('[AUTH-CONTROLLER] ❌ Temporary password validation error:', tempPassError.message);
        res.status(401).json({ error: tempPassError.message });
        return;
      }
    }

    // Normal password validation (non-temp password)
    console.log('[AUTH-CONTROLLER] ✓ Comparing regular password...');

    // Compare password
    const passwordMatch = await comparePassword(password, user.password_hash);
    if (!passwordMatch) {
      console.log('[AUTH-CONTROLLER] ❌ Password mismatch');
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    console.log('[AUTH-CONTROLLER] ✓ Password matched');
    console.log('[AUTH-CONTROLLER] ✓ Generating JWT token...');

    // Generate JWT token
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

    console.log('[AUTH-CONTROLLER] ✓ Token generated, storing session...');

    // Store session in database
    await pool.query(
      'INSERT INTO sessions (user_id, token, expires_at) VALUES ($1, $2, NOW() + INTERVAL \'7 days\')',
      [user.id, token]
    );

    console.log('[AUTH-CONTROLLER] ✅ Login successful');

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        name: user.name,
        role: user.role
      },
      forcePasswordChange: false,
    });
  } catch (error) {
    console.error('[AUTH-CONTROLLER] ❌ Error in login:', error);
    console.error('[AUTH-CONTROLLER] Stack trace:', error instanceof Error ? error.stack : '');

    res.status(500).json({ error: 'Login failed' });
  }
}

// Handle Google OAuth sign-in (called from NextAuth frontend)
export async function handleGoogleSignIn(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    console.log('[GOOGLE-AUTH] 🔐 Google Sign In called');
    
    const { googleId, email, name, image } = req.body;

    console.log('[GOOGLE-AUTH] Sign in details:', { email });

    if (!email) {
      console.log('[GOOGLE-AUTH] ❌ Email is required');
      res.status(400).json({ error: 'Email is required' });
      return;
    }

    // Google OAuth always creates/authenticates as admin
    // Employees are created via admin invitation system
    const userRole = 'admin';
    console.log('[GOOGLE-AUTH] ✓ Using role:', userRole);

    const client = await pool.connect();

    try {
      // Check if user exists (by google_id or email)
      console.log('[GOOGLE-AUTH] ✓ Checking if user exists...');
      const existingUser = await client.query(
        'SELECT * FROM users WHERE google_id = $1 OR email = $2',
        [googleId, email]
      );

      let user;

      if (existingUser.rows.length > 0) {
        user = existingUser.rows[0];
        console.log('[GOOGLE-AUTH] ✓ Admin user found, updating info...');
        
        // Update user info and mark email as verified
        await client.query(
          'UPDATE users SET name = $1, picture = $2, email_verified = true, email_verified_at = NOW(), updated_at = CURRENT_TIMESTAMP WHERE id = $3',
          [name, image, user.id]
        );
      } else {
        // Create new admin user via Google OAuth
        console.log('[GOOGLE-AUTH] ✓ Creating new admin user with Google OAuth...');
        
        const newUser = await client.query(
          `INSERT INTO users (google_id, email, name, picture, role, auth_provider, is_active, email_verified, email_verified_at, password_hash)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) 
           RETURNING id, google_id, email, name, picture, role, auth_provider, email_verified`,
          [googleId, email, name, image, userRole, 'google', true, true, new Date(), null]
        );
        user = newUser.rows[0];
        console.log('[GOOGLE-AUTH] ✓ Admin user created via Google with ID:', user.id);
      }

      console.log('[GOOGLE-AUTH] ✓ Generating JWT token...');

      // Generate JWT token with role claim
      const token = jwt.sign(
        {
          id: user.id,
          email: user.email,
          googleId: user.google_id,
          role: user.role
        },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRE }
      );

      console.log('[GOOGLE-AUTH] ✓ Storing session in database...');

      // Store session in database
      await client.query(
        'INSERT INTO sessions (user_id, token, expires_at) VALUES ($1, $2, NOW() + INTERVAL \'7 days\')',
        [user.id, token]
      );

      console.log('[GOOGLE-AUTH] ✅ Google sign in successful');

      res.json({
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          picture: user.picture,
          role: user.role
        }
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('[GOOGLE-AUTH] ❌ Error in handleGoogleSignIn:', error);
    res.status(500).json({ error: 'Failed to sign in' });
  }
}

// Logout
export async function logout(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const token = req.headers.authorization?.split(' ')[1];

    if (token) {
      await pool.query('DELETE FROM sessions WHERE token = $1', [token]);
    }

    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    console.error('Error in logout:', error);
    res.status(500).json({ error: 'Logout failed' });
  }
}

// Get current user
export async function getCurrentUser(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const userResult = await pool.query('SELECT id, email, name, picture FROM users WHERE id = $1', [req.user.id]);

    if (userResult.rows.length === 0) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json({ user: userResult.rows[0] });
  } catch (error) {
    console.error('Error getting current user:', error);
    res.status(500).json({ error: 'Failed to get user' });
  }
}
// Change password (protected route, requires JWT)
export async function changePassword(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body;

    if (!newPassword || !confirmPassword) {
      res.status(400).json({ error: 'New password and confirm password are required' });
      return;
    }

    if (newPassword !== confirmPassword) {
      res.status(400).json({ error: 'New passwords do not match' });
      return;
    }

    const passwordValidation = validatePassword(newPassword);
    if (!passwordValidation.valid) {
      res.status(400).json({ 
        error: 'New password does not meet requirements',
        details: passwordValidation.errors
      });
      return;
    }

    if (!req.user) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    const userResult = await pool.query(
      'SELECT id, password_hash, auth_provider, is_temp_password, force_password_change FROM users WHERE id = $1',
      [req.user.id]
    );

    if (userResult.rows.length === 0) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const user = userResult.rows[0];

    if (user.auth_provider !== 'local') {
      res.status(400).json({ error: 'Password change not available for OAuth users' });
      return;
    }

    // If not forced change, require current password
    if (!user.force_password_change) {
      if (!currentPassword) {
        res.status(400).json({ error: 'Current password is required' });
        return;
      }

      const passwordMatch = await comparePassword(currentPassword, user.password_hash);
      if (!passwordMatch) {
        res.status(401).json({ error: 'Current password is incorrect' });
        return;
      }
    }

    const newPasswordHash = await hashPassword(newPassword);

    await pool.query(
      `UPDATE users 
       SET password_hash = $1, 
           is_temp_password = false,
           temp_password_expires_at = NULL,
           force_password_change = false,
           updated_at = CURRENT_TIMESTAMP 
       WHERE id = $2`,
      [newPasswordHash, req.user.id]
    );

    if (user.is_temp_password) {
      await TempPasswordService.clearTempPassword(req.user.id);
    }

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error('[CHANGE-PASSWORD] Error:', error);
    res.status(500).json({ error: 'Failed to change password' });
  }
}