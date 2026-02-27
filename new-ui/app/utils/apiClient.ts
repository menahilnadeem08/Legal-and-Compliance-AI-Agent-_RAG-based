import { getApiBase, getAuthTokenForApi, getAuthUser, getAuthProvider, getRefreshToken, setAuth, clearAuth, getLoginRedirectForRole } from "./auth";

export type ApiResponse<T = unknown> = {
  success: boolean;
  message?: string;
  data?: T;
  errors?: { field: string; message: string }[];
};

type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  headers?: Record<string, string>;
  requiresAuth?: boolean;
  /** When true, body is sent as FormData and Content-Type is not set */
  formData?: boolean;
  /** When true, don't auto-redirect to /auth/login on 401 errors */
  skipAuthRedirectOn401?: boolean;
};

// Refresh token queue for handling concurrent 401 errors
let isRefreshing = false;
const failedQueue: Array<{ resolve: (value: boolean) => void; reject: (error: Error) => void }> = [];

async function processQueue(success: boolean) {
  failedQueue.forEach(prom => {
    if (success) {
      prom.resolve(true);
    } else {
      prom.reject(new Error("Token refresh failed"));
    }
  });
  failedQueue.length = 0;
}

async function refreshAccessToken(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;

  try {
    const response = await fetch(`${getApiBase()}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include", // Send cookies automatically
      body: JSON.stringify({ refreshToken }),
    });

    if (!response.ok) {
      return false;
    }

    const data = await response.json();
    if (data.success && data.data?.accessToken) {
      const user = getAuthUser();
      const provider = getAuthProvider() ?? "manual";
      setAuth(data.data.accessToken, user || {}, data.data.refreshToken, provider);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

async function apiClient<T = unknown>(
  endpoint: string,
  options: RequestOptions = {}
): Promise<ApiResponse<T>> {
  const {
    method = "GET",
    body,
    headers = {},
    requiresAuth = true,
    formData = false,
    skipAuthRedirectOn401 = false,
  } = options;

  const requestHeaders: Record<string, string> = { ...headers };
  if (!formData) requestHeaders["Content-Type"] = "application/json";

  if (requiresAuth) {
    const token = getAuthTokenForApi();
    if (token) {
      requestHeaders["Authorization"] = `Bearer ${token}`;
    }
  }

  const fetchBody =
    body != null
      ? formData && body instanceof FormData
        ? body
        : !formData
          ? JSON.stringify(body)
          : undefined
      : undefined;

  let response: Response;
  try {
    response = await fetch(`${getApiBase()}${endpoint}`, {
      method,
      headers: requestHeaders,
      credentials: "include", // Send cookies automatically
      ...(fetchBody !== undefined && { body: fetchBody }),
    });
  } catch (err) {
    const message =
      err instanceof TypeError && (err.message === "Failed to fetch" || err.message?.includes("fetch"))
        ? "Could not reach the server. Make sure the backend is running and NEXT_PUBLIC_API_URL is correct."
        : err instanceof Error
          ? err.message
          : "Network error.";
    return { success: false, message };
  }

  if (response.status === 401) {
    // Try to refresh token for both manual and Google auth when we have a refresh token.
    // Access tokens expire after ~15 min; NextAuth refetch may not run in time before an API call.
    const hasRefreshToken = !!getRefreshToken();
    const shouldTryRefresh = hasRefreshToken && !skipAuthRedirectOn401;

    if (shouldTryRefresh) {
      if (!isRefreshing) {
        isRefreshing = true;
        const refreshSuccess = await refreshAccessToken();
        isRefreshing = false;
        await processQueue(refreshSuccess);

        if (refreshSuccess) {
          // Retry the original request with new token
          return apiClient<T>(endpoint, options);
        }
      } else {
        // Already refreshing, queue this request
        return new Promise((resolve, reject) => {
          failedQueue.push({
            resolve: async (success) => {
              if (success) {
                resolve(await apiClient<T>(endpoint, options));
              } else {
                reject(new Error("Token refresh failed"));
              }
            },
            reject,
          });
        });
      }
    }

    // If refresh failed or we have no refresh token, redirect to login
    if (!skipAuthRedirectOn401) {
      const role = getAuthUser()?.role;
      clearAuth();
      if (typeof window !== "undefined") window.location.replace(getLoginRedirectForRole(role));
    }

    const data: ApiResponse<T> = await response.json().catch(() => ({ success: false, message: "Session expired. Please login again." }));
    return data;
  }

  if (response.status === 429) {
    return {
      success: false,
      message: "Too many attempts. Please try again in 15 minutes.",
    };
  }

  try {
    const data: ApiResponse<T> = await response.json();
    return data;
  } catch {
    return {
      success: false,
      message: response.ok ? "Invalid response from server." : `Request failed (${response.status}).`,
    };
  }
}

export const api = {
  get: <T = unknown>(endpoint: string, options?: Omit<RequestOptions, "method" | "body">) =>
    apiClient<T>(endpoint, { ...options, method: "GET" }),

  post: <T = unknown>(endpoint: string, body?: unknown, options?: Omit<RequestOptions, "method" | "body">) =>
    apiClient<T>(endpoint, { ...options, method: "POST", body }),
  postFormData: <T = unknown>(endpoint: string, formData: FormData, options?: Omit<RequestOptions, "method" | "body">) =>
    apiClient<T>(endpoint, { ...options, method: "POST", body: formData, formData: true }),

  put: <T = unknown>(endpoint: string, body?: unknown, options?: Omit<RequestOptions, "method" | "body">) =>
    apiClient<T>(endpoint, { ...options, method: "PUT", body }),

  patch: <T = unknown>(endpoint: string, body?: unknown, options?: Omit<RequestOptions, "method" | "body">) =>
    apiClient<T>(endpoint, { ...options, method: "PATCH", body }),

  delete: <T = unknown>(endpoint: string, options?: Omit<RequestOptions, "method" | "body">) =>
    apiClient<T>(endpoint, { ...options, method: "DELETE" }),
};

export default apiClient;
