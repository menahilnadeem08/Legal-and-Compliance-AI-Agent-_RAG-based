import pool from '../config/database';
import { hashPassword, comparePassword } from '../utils/passwordUtils';
import crypto from 'crypto';

/**
 * Temporary Password Service
 * Handles secure temporary credential generation for new employees
 */
export class TempPasswordService {
  /**
   * Generate a secure temporary password
   * Format: 12 random alphanumeric characters
   * Guaranteed to have uppercase, lowercase, number, and special char
   */
  static generateSecurePassword(): string {
    // Ensure it meets all requirements: uppercase, lowercase, number, special char
    const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const lowercase = 'abcdefghijklmnopqrstuvwxyz';
    const numbers = '0123456789';
    const special = '!@#$%^&*';

    let password = '';

    // Add one character from each required set
    password += uppercase[Math.floor(Math.random() * uppercase.length)];
    password += lowercase[Math.floor(Math.random() * lowercase.length)];
    password += numbers[Math.floor(Math.random() * numbers.length)];
    password += special[Math.floor(Math.random() * special.length)];

    // Add 8 more random characters
    const allChars = uppercase + lowercase + numbers + special;
    for (let i = 0; i < 8; i++) {
      password += allChars[Math.floor(Math.random() * allChars.length)];
    }

    // Shuffle the password
    return password
      .split('')
      .sort(() => Math.random() - 0.5)
      .join('');
  }

  /**
   * Create temporary password for new employee
   * Sets 2-hour expiry time
   */
  static async createTempPassword(userId: number, ipAddress?: string, userAgent?: string): Promise<string> {
    console.log('[TEMP-PASSWORD] Generating temporary password for user:', userId);

    const tempPassword = this.generateSecurePassword();
    const passwordHash = await hashPassword(tempPassword);

    // 2-hour expiry
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 2);

    console.log('[TEMP-PASSWORD] Setting temp password with 2-hour expiry');

    await pool.query(
      `UPDATE users 
       SET password_hash = $1, 
           is_temp_password = true,
           temp_password_expires_at = $2,
           force_password_change = true,
           updated_at = NOW()
       WHERE id = $3`,
      [passwordHash, expiresAt, userId]
    );

    // Log audit event (optional - don't fail if it doesn't work)
    try {
      // Skip audit log for now since we don't have admin_id context here
      // await AuditLogRepository.createLog(...)
    } catch (auditError) {
      console.error('[TEMP-PASSWORD] ⚠️  Audit log failed (non-critical):', auditError);
    }

    console.log('[TEMP-PASSWORD] ✅ Temporary password created successfully');
    return tempPassword;
  }

  /**
   * Validate temporary password on login
   * Checks if expired and if not already used
   */
  static async validateTempPassword(userId: number, providedPassword: string): Promise<boolean> {
    console.log('[TEMP-PASSWORD] Validating temp password for user:', userId);

    const result = await pool.query(
      `SELECT password_hash, is_temp_password, temp_password_expires_at
       FROM users WHERE id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      console.log('[TEMP-PASSWORD] User not found');
      return false;
    }

    const user = result.rows[0];

    // Check if user has a temp password
    if (!user.is_temp_password) {
      console.log('[TEMP-PASSWORD] User does not have temp password flag set');
      return false;
    }

    // Check if temp password has expired
    if (user.temp_password_expires_at) {
      const now = new Date();
      if (now > new Date(user.temp_password_expires_at)) {
        console.log('[TEMP-PASSWORD] ❌ Temporary password has expired');
        // Log the expiry event (optional)
        try {
          // Skip audit log for now since we don't have admin_id context
          // await AuditLogRepository.createLog(...)
        } catch (auditError) {
          console.error('[TEMP-PASSWORD] ⚠️  Audit log failed (non-critical):', auditError);
        }
        throw new Error('Temporary password expired. Contact your admin for a new invitation.');
      }
    }

    // Validate password match
    const passwordMatch = await comparePassword(providedPassword, user.password_hash);

    if (!passwordMatch) {
      console.log('[TEMP-PASSWORD] Password does not match');
      return false;
    }

    console.log('[TEMP-PASSWORD] ✅ Temporary password validated successfully');
    return true;
  }

  /**
   * Clear temporary password flag after user sets permanent password
   */
  static async clearTempPassword(userId: number): Promise<void> {
    console.log('[TEMP-PASSWORD] Clearing temp password flag for user:', userId);

    await pool.query(
      `UPDATE users 
       SET is_temp_password = false,
           temp_password_expires_at = NULL,
           force_password_change = false,
           updated_at = NOW()
       WHERE id = $1`,
      [userId]
    );

    console.log('[TEMP-PASSWORD] ✅ Temp password cleared');
  }

  /**
   * Check if password is temp and still valid
   */
  static async isTempPasswordValid(userId: number): Promise<boolean> {
    const result = await pool.query(
      `SELECT is_temp_password, temp_password_expires_at
       FROM users WHERE id = $1`,
      [userId]
    );

    if (result.rows.length === 0) return false;

    const user = result.rows[0];

    if (!user.is_temp_password) return false;

    if (user.temp_password_expires_at) {
      const now = new Date();
      return now <= new Date(user.temp_password_expires_at);
    }

    return false;
  }
}
