/**
 * Unified auth utilities.
 * All auth state uses two keys:
 *   localStorage: authToken, authUser
 *   cookie:       auth-token, force-password-change
 *
 * The user's role is stored inside authUser (e.g. { role: 'admin' | 'employee' }).
 */

const COOKIE_MAX_AGE = 7 * 24 * 60 * 60; // 7 days

function setCookie(name: string, value: string, maxAge: number) {
  document.cookie = `${name}=${value}; path=/; max-age=${maxAge}; SameSite=Lax`;
}

function deleteCookie(name: string) {
  document.cookie = `${name}=; path=/; max-age=0; SameSite=Lax`;
}

export function getAuthToken(session?: any): string | null {
  if (typeof window === 'undefined') return null;

  const token = localStorage.getItem('authToken');
  if (token) return token;

  if (session?.user && (session.user as any)?.token) {
    return (session.user as any).token;
  }

  return null;
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

/**
 * Store auth state for any user type (admin or employee).
 * Clears all previous auth state first to prevent stale cross-role tokens.
 */
export function setAuth(token: string, user: any): void {
  clearAllAuth();
  localStorage.setItem('authToken', token);
  localStorage.setItem('authUser', JSON.stringify(user));
  setCookie('auth-token', token, COOKIE_MAX_AGE);
}

export function clearAllAuth(): void {
  localStorage.removeItem('authToken');
  localStorage.removeItem('authUser');
  localStorage.removeItem('forcePasswordChange');
  deleteCookie('auth-token');
  deleteCookie('force-password-change');

  // Clean up legacy keys from before unification
  localStorage.removeItem('adminToken');
  localStorage.removeItem('adminUser');
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  deleteCookie('admin-token');
  deleteCookie('employee-token');
}
