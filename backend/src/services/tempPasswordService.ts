import pool from '../config/database';
import { comparePassword } from '../utils/passwordUtils';

/**
 * Temporary Password Service
 * Handles secure temporary credential generation for new employees
 */
export class TempPasswordService {
  static generateSecurePassword(): string {
    const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const lowercase = 'abcdefghijklmnopqrstuvwxyz';
    const numbers = '0123456789';
    const special = '!@#$%^&*';

    let password = '';
    password += uppercase[Math.floor(Math.random() * uppercase.length)];
    password += lowercase[Math.floor(Math.random() * lowercase.length)];
    password += numbers[Math.floor(Math.random() * numbers.length)];
    password += special[Math.floor(Math.random() * special.length)];

    const allChars = uppercase + lowercase + numbers + special;
    for (let i = 0; i < 8; i++) {
      password += allChars[Math.floor(Math.random() * allChars.length)];
    }

    return password
      .split('')
      .sort(() => Math.random() - 0.5)
      .join('');
  }

  static async validateTempPassword(userId: number, providedPassword: string): Promise<boolean> {
    const result = await pool.query(
      `SELECT password_hash, is_temp_password, temp_password_expires_at
       FROM users WHERE id = $1`,
      [userId]
    );

    if (result.rows.length === 0) return false;

    const user = result.rows[0];

    if (!user.is_temp_password) return false;

    if (user.temp_password_expires_at) {
      const now = new Date();
      if (now > new Date(user.temp_password_expires_at)) {
        throw new Error('Temporary password expired. Contact your admin for new credentials.');
      }
    }

    const passwordMatch = await comparePassword(providedPassword, user.password_hash);
    return passwordMatch;
  }

  static async clearTempPassword(userId: number): Promise<void> {
    await pool.query(
      `UPDATE users 
       SET is_temp_password = false,
           temp_password_expires_at = NULL,
           force_password_change = false,
           updated_at = NOW()
       WHERE id = $1`,
      [userId]
    );
  }
}
