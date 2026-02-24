import { getApiBase, getAuthTokenForApi, clearAuth } from "./auth";

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
};

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

  const response = await fetch(`${getApiBase()}${endpoint}`, {
    method,
    headers: requestHeaders,
    ...(fetchBody !== undefined && { body: fetchBody }),
  });

  if (response.status === 401) {
    clearAuth();
    if (typeof window !== "undefined") window.location.replace("/auth/login");
    return { success: false, message: "Session expired. Please login again." };
  }

  if (response.status === 429) {
    return {
      success: false,
      message: "Too many attempts. Please try again in 15 minutes.",
    };
  }

  const data: ApiResponse<T> = await response.json();
  return data;
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
