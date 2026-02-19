/**
 * Unified auth utilities.
 * Single source of truth for token retrieval across all auth methods:
 *   - Google OAuth admin (synced from NextAuth session)
 *   - Local admin (stored directly on login/signup)
 *   - Employee (stored on login)
 */

export function getAuthToken(session?: any): string | null {
  if (typeof window === 'undefined') return null;

  const adminToken = localStorage.getItem('adminToken');
  if (adminToken) return adminToken;

  if (session?.user && (session.user as any)?.token) {
    return (session.user as any).token;
  }

  const employeeToken = localStorage.getItem('token');
  if (employeeToken) return employeeToken;

  return null;
}

export function isEmployeeUser(): boolean {
  if (typeof window === 'undefined') return false;
  return !!localStorage.getItem('token') && !!localStorage.getItem('user');
}

export function isAdminUser(session?: any): boolean {
  if (typeof window === 'undefined') return false;
  if (localStorage.getItem('adminToken')) return true;
  if (session?.user && (session.user as any)?.token) return true;
  return false;
}

export function setAdminAuth(token: string, user: any): void {
  localStorage.setItem('adminToken', token);
  localStorage.setItem('adminUser', JSON.stringify(user));
  document.cookie = `admin-token=${token}; path=/; max-age=${7 * 24 * 60 * 60}; SameSite=Lax`;
}

export function clearAllAuth(): void {
  localStorage.removeItem('adminToken');
  localStorage.removeItem('adminUser');
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  document.cookie = 'admin-token=; path=/; max-age=0';
  document.cookie = 'employee-token=; path=/; max-age=0';
  document.cookie = 'force-password-change=; path=/; max-age=0';
}
