/**
 * Utility to extract admin_id for multi-tenant query filtering
 */

export interface User {
  id: number;
  email?: string;
  username?: string;
  role?: string;
  admin_id?: number;
}

/**
 * GET admin_id for query filtering based on user role
 * - Admins use their own id
 * - Employees use their assigned admin_id
 */
export function getAdminIdForUser(user: User | undefined): number | null {
  if (!user) return null;
  
  if (user.role === 'admin') {
    return user.id;
  } else if (user.role === 'employee') {
    return user.admin_id || null;
  }
  return null;
}
