import crypto from 'crypto';

/**
 * Generate a cryptographically secure random token
 * @param length - Token length in bytes (default: 32)
 * @returns Raw token string (hex encoded)
 */
export function generateSecureToken(length: number = 32): string {
  return crypto.randomBytes(length).toString('hex');
}

/**
 * Hash a token using SHA-256
 * @param token - Raw token to hash
 * @returns Hashed token (hex encoded)
 */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Verify token by comparing with hash
 * @param token - Raw token to verify
 * @param tokenHash - Expected hash
 * @returns true if token matches hash, false otherwise
 */
export function verifyTokenHash(token: string, tokenHash: string): boolean {
  const hash = hashToken(token);
  // Use constant-time comparison to prevent timing attacks
  return crypto.timingSafeEqual(
    Buffer.from(hash, 'hex'),
    Buffer.from(tokenHash, 'hex')
  );
}

/**
 * Generate invitation token and hash
 * @returns Object with raw token and hash
 */
export function generateInvitationToken(): { token: string; hash: string } {
  const token = generateSecureToken(32);
  const hash = hashToken(token);
  return { token, hash };
}

/**
 * Generate activation link URL
 * @param appUrl - Base URL of the application
 * @param token - Raw activation token
 * @returns Full activation URL
 */
export function generateActivationLink(appUrl: string, token: string): string {
  const url = new URL('/activate', appUrl);
  url.searchParams.set('token', token);
  return url.toString();
}
