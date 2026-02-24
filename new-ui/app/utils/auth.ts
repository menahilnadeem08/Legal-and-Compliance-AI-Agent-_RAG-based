/**
 * Auth helpers for API calls.
 * Tokens stored in localStorage: accessToken, refreshToken, authUser.
 * On 401 from API, clear storage and redirect to /auth/login.
 */

const API_BASE =
  (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_API_URL) ||
  "http://localhost:5000";

export function getAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("accessToken");
}

/** Returns the token only if it is a real JWT (not a mock token). Use this for API Authorization headers so mock tokens are never sent. */
export function getAuthTokenForApi(): string | null {
  const token = getAuthToken();
  if (!token || token.startsWith("mock-")) return null;
  return token;
}

export function getRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("refreshToken");
}

export function getAuthUser(): { id?: number; username?: string; email?: string; name?: string; role?: string } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem("authUser");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setAuth(accessToken: string, user: object, refreshToken?: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem("accessToken", accessToken);
  localStorage.setItem("authUser", JSON.stringify(user));
  if (refreshToken) localStorage.setItem("refreshToken", refreshToken);
}

export function clearAuth(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem("accessToken");
  localStorage.removeItem("refreshToken");
  localStorage.removeItem("authUser");
}

export function isAuthenticated(): boolean {
  return !!getAuthToken();
}

export function isEmployeeUser(): boolean {
  const user = getAuthUser();
  return !!user && user.role === "employee";
}

export function isAdminUser(): boolean {
  const user = getAuthUser();
  return !!user && user.role === "admin";
}

/** If response is 401, clear auth and redirect to /auth/login. Returns true if handled. */
export function handle401Response(response: Response): boolean {
  if (response.status !== 401) return false;
  clearAuth();
  if (typeof window !== "undefined") window.location.href = "/auth/login";
  return true;
}

export function getApiBase(): string {
  return API_BASE.replace(/\/$/, "") + "/api";
}
