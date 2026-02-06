import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import pool from '../config/database';
import { hashPassword, comparePassword } from '../utils/passwordUtils';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRE = '7d';

interface AuthenticatedRequest extends Request {
  user?: {
    id: number;
    email?: string;
    username?: string;
    name?: string;
    picture?: string;
    role?: string;
  };
}

// Employee/Local login
export async function login(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      res.status(400).json({ error: 'Username and password are required' });
      return;
    }

    const userResult = await pool.query(
      `SELECT id, username, email, name, role, password_hash, is_active, auth_provider
       FROM users
       WHERE username = $1 AND auth_provider = 'local' AND is_active = true`,
      [username]
    );

    if (userResult.rows.length === 0) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const user = userResult.rows[0];

    // Compare password
    const passwordMatch = await comparePassword(password, user.password_hash);
    if (!passwordMatch) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

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

    // Store session in database
    await pool.query(
      'INSERT INTO sessions (user_id, token, expires_at) VALUES ($1, $2, NOW() + INTERVAL \'7 days\')',
      [user.id, token]
    );

    res.json({
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
    console.error('Error in login:', error);
    res.status(500).json({ error: 'Login failed' });
  }
}

// Handle Google OAuth sign-in (called from NextAuth frontend)
export async function handleGoogleSignIn(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { googleId, email, name, image } = req.body;

    if (!email) {
      res.status(400).json({ error: 'Email is required' });
      return;
    }

    const client = await pool.connect();

    try {
      // Check if user exists
      const existingUser = await client.query(
        'SELECT * FROM users WHERE google_id = $1 OR email = $2',
        [googleId, email]
      );

      let user;

      if (existingUser.rows.length > 0) {
        user = existingUser.rows[0];
        // Update user info
        await client.query(
          'UPDATE users SET name = $1, picture = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
          [name, image, user.id]
        );
      } else {
        // Create new user
        const newUser = await client.query(
          'INSERT INTO users (google_id, email, name, picture) VALUES ($1, $2, $3, $4) RETURNING *',
          [googleId, email, name, image]
        );
        user = newUser.rows[0];
      }

      // Generate JWT token
      const token = jwt.sign(
        {
          id: user.id,
          email: user.email,
          googleId: user.google_id
        },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRE }
      );

      // Store session in database
      await client.query(
        'INSERT INTO sessions (user_id, token, expires_at) VALUES ($1, $2, NOW() + INTERVAL \'7 days\')',
        [user.id, token]
      );

      res.json({
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          picture: user.picture
        }
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error in handleGoogleSignIn:', error);
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
