import pool from '../config/database';

const SESSION_DURATION = '7 days';

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
