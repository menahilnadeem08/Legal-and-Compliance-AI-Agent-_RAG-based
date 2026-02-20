import crypto from 'crypto';
import pool from '../config/database';
import logger from '../utils/logger';

const REFRESH_TOKEN_DURATION = '7 days';
const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;

function generateRefreshToken(): string {
  return crypto.randomBytes(40).toString('hex');
}

/**
 * Create a session with a new refresh token. Returns the refresh token.
 */
export async function createSession(
  userId: number,
  client?: { query: typeof pool.query }
): Promise<string> {
  const refreshToken = generateRefreshToken();
  const db = client || pool;
  await db.query(
    `INSERT INTO sessions (user_id, token, expires_at)
     VALUES ($1, $2, NOW() + INTERVAL '${REFRESH_TOKEN_DURATION}')`,
    [userId, refreshToken]
  );
  return refreshToken;
}

/**
 * Validate a refresh token. Returns the session row or null.
 */
export async function validateRefreshToken(
  refreshToken: string
): Promise<{ id: number; user_id: number; created_at: Date } | null> {
  const result = await pool.query(
    'SELECT id, user_id, created_at FROM sessions WHERE token = $1 AND expires_at > NOW()',
    [refreshToken]
  );
  return result.rows[0] || null;
}

/**
 * Replace the old refresh token with a new one (rotation).
 * Returns the new refresh token.
 */
export async function rotateRefreshToken(sessionId: number): Promise<string> {
  const newToken = generateRefreshToken();
  await pool.query(
    `UPDATE sessions SET token = $1, expires_at = NOW() + INTERVAL '${REFRESH_TOKEN_DURATION}' WHERE id = $2`,
    [newToken, sessionId]
  );
  return newToken;
}

/**
 * Delete a single session by its refresh token.
 */
export async function revokeSession(refreshToken: string): Promise<void> {
  await pool.query('DELETE FROM sessions WHERE token = $1', [refreshToken]);
}

/**
 * Delete ALL sessions for a user (forces re-login on every device).
 */
export async function revokeAllUserSessions(userId: number): Promise<number> {
  const result = await pool.query('DELETE FROM sessions WHERE user_id = $1', [userId]);
  return result.rowCount ?? 0;
}

export async function cleanExpiredSessions(): Promise<number> {
  const result = await pool.query('DELETE FROM sessions WHERE expires_at < NOW()');
  const count = result.rowCount ?? 0;
  if (count > 0) {
    console.log(`[SESSION-CLEANUP] Removed ${count} expired session(s)`);
  }
  return count;
}

export function startSessionCleanupScheduler(): NodeJS.Timeout {
  cleanExpiredSessions().catch((err) =>
    logger.error('[SESSION-CLEANUP] Initial cleanup failed', { message: err?.message, stack: err?.stack }));

  return setInterval(() => {
    cleanExpiredSessions().catch((err) =>
      logger.error('[SESSION-CLEANUP] Scheduled cleanup failed', { message: err?.message, stack: err?.stack }));
  }, CLEANUP_INTERVAL_MS);
}
