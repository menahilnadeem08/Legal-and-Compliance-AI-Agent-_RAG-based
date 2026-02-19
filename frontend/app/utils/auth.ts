/**
 * Unified auth utilities.
 *
 * Token pair:
 *   accessToken  – short-lived JWT (15 min), used for Authorization header
 *   refreshToken – long-lived opaque string (7 days), used to obtain new access tokens
 *
 * Storage:
 *   localStorage: authToken (access), refreshToken, authUser
 *   cookie:       auth-token (access, for Next.js middleware), force-password-change
 */

const COOKIE_MAX_AGE = 7 * 24 * 60 * 60;
const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

function setCookie(name: string, value: string, maxAge: number) {
  document.cookie = `${name}=${value}; path=/; max-age=${maxAge}; SameSite=Lax`;
}

function deleteCookie(name: string) {
  document.cookie = `${name}=; path=/; max-age=0; SameSite=Lax`;
}

// ---------------------------------------------------------------------------
// Read helpers
// ---------------------------------------------------------------------------

export function getAuthToken(session?: any): string | null {
  if (typeof window === 'undefined') return null;

  const token = localStorage.getItem('authToken');
  if (token) return token;

  if (session?.user && (session.user as any)?.token) {
    return (session.user as any).token;
  }

  return null;
}

export function getRefreshToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('refreshToken');
}

export function getAuthUser(): any | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem('authUser');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function isEmployeeUser(): boolean {
  if (typeof window === 'undefined') return false;
  const user = getAuthUser();
  return !!user && user.role === 'employee';
}

export function isAdminUser(session?: any): boolean {
  if (typeof window === 'undefined') return false;
  const user = getAuthUser();
  if (user && user.role === 'admin') return true;
  if (session?.user && (session.user as any)?.token) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Write helpers
// ---------------------------------------------------------------------------

/**
 * Store auth state for any user type.
 * Clears all previous auth state first to prevent stale cross-role tokens.
 */
export function setAuth(accessToken: string, user: any, refreshToken?: string): void {
  clearAllAuth();
  localStorage.setItem('authToken', accessToken);
  localStorage.setItem('authUser', JSON.stringify(user));
  if (refreshToken) {
    localStorage.setItem('refreshToken', refreshToken);
  }
  setCookie('auth-token', accessToken, COOKIE_MAX_AGE);
}

export function clearAllAuth(): void {
  localStorage.removeItem('authToken');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('authUser');
  localStorage.removeItem('forcePasswordChange');
  deleteCookie('auth-token');
  deleteCookie('force-password-change');

  // Legacy keys
  localStorage.removeItem('adminToken');
  localStorage.removeItem('adminUser');
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  deleteCookie('admin-token');
  deleteCookie('employee-token');
}

// ---------------------------------------------------------------------------
// Token refresh
// ---------------------------------------------------------------------------

let refreshPromise: Promise<string | null> | null = null;

/**
 * Call POST /auth/refresh with the stored refresh token.
 * Returns the new access token, or null if refresh failed (user must re-login).
 * De-duplicates concurrent calls so only one refresh request is in flight.
 */
export async function refreshAccessToken(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      const currentRefresh = getRefreshToken();
      if (!currentRefresh) return null;

      const res = await fetch(`${API_URL}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: currentRefresh }),
      });

      if (!res.ok) {
        clearAllAuth();
        return null;
      }

      const data = await res.json();
      localStorage.setItem('authToken', data.accessToken);
      localStorage.setItem('refreshToken', data.refreshToken);
      setCookie('auth-token', data.accessToken, COOKIE_MAX_AGE);
      return data.accessToken as string;
    } catch {
      clearAllAuth();
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

// ---------------------------------------------------------------------------
// Fetch wrapper with automatic token refresh on 401
// ---------------------------------------------------------------------------

/**
 * Drop-in replacement for fetch() that:
 *   1. Attaches Authorization: Bearer <accessToken>
 *   2. On 401, tries to refresh the token and retries the request once
 *   3. If refresh fails, clears auth and redirects to /auth/login
 */
export async function apiFetch(
  input: string,
  init?: RequestInit
): Promise<Response> {
  const doFetch = (token: string | null) => {
    const headers = new Headers(init?.headers);
    if (token) headers.set('Authorization', `Bearer ${token}`);
    return fetch(input, { ...init, headers });
  };

  let token = getAuthToken();
  let res = await doFetch(token);

  if (res.status === 401) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      res = await doFetch(newToken);
    } else if (typeof window !== 'undefined') {
      window.location.href = '/auth/login';
    }
  }

  return res;
}
