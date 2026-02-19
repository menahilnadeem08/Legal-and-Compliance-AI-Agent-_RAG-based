import pool from '../config/database';

const SESSION_DURATION = '7 days';
const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Create a session record in the database.
 * @param userId - The user's ID
 * @param token - The JWT token to store
 * @param client - Optional DB client (use inside existing transactions)
 */
export async function createSession(
  userId: number,
  token: string,
  client?: { query: typeof pool.query }
): Promise<void> {
  const db = client || pool;
  await db.query(
    `INSERT INTO sessions (user_id, token, expires_at) VALUES ($1, $2, NOW() + INTERVAL '${SESSION_DURATION}')`,
    [userId, token]
  );
}

/**
 * Delete all sessions whose expires_at is in the past.
 * Safe to call at any time — only removes already-invalid rows.
 */
export async function cleanExpiredSessions(): Promise<number> {
  const result = await pool.query('DELETE FROM sessions WHERE expires_at < NOW()');
  const count = result.rowCount ?? 0;
  if (count > 0) {
    console.log(`[SESSION-CLEANUP] Removed ${count} expired session(s)`);
  }
  return count;
}

/**
 * Run an immediate cleanup, then schedule recurring cleanup every 24 hours.
 * Returns the interval handle so the caller can clear it on shutdown.
 */
export function startSessionCleanupScheduler(): NodeJS.Timeout {
  cleanExpiredSessions().catch((err) =>
    console.error('[SESSION-CLEANUP] Initial cleanup failed:', err)
  );

  return setInterval(() => {
    cleanExpiredSessions().catch((err) =>
      console.error('[SESSION-CLEANUP] Scheduled cleanup failed:', err)
    );
  }, CLEANUP_INTERVAL_MS);
}
