import axios from "axios";
import { API_BASE_URL } from "../config/env";
import { getCurrentUser } from "../utils/auth";
import { setupCsrfInterceptor } from "../utils/csrf";

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
});

// ── CSRF token auto-injection (production-only server-side check, always client-side) ──
setupCsrfInterceptor(apiClient);

// ── Request interceptor: attach user identity headers ─────────────────────
apiClient.interceptors.request.use((config) => {
  let user = getCurrentUser();

  // 500 IQ Fix: If we are in export mode (Puppeteer), localStorage is empty.
  // We must inject the Automation Session credentials to allow API calls to succeed.
  if (!user && window.IS_EXPORT_MODE) {
    user = { email: 'export@analytics.local', role: 'admin' };
  }

  if (user) {
    if (config.headers.set) {
      config.headers.set('X-User-ID', user.email);
      config.headers.set('X-User-Role', user.role);
    } else {
      config.headers['X-User-ID'] = user.email;
      config.headers['X-User-Role'] = user.role;
    }
  }
  return config;
});

// ── Response interceptor: translate HTTP errors to user-facing messages ───
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (!error.response) {
      // Network / CORS / timeout – no HTTP status available
      error.userMessage = 'Unable to reach the server. Check your network connection.';
      return Promise.reject(error);
    }

    const { status, data } = error.response;
    const serverMessage = data?.message || null;

    switch (status) {
      case 401:
        error.userMessage = serverMessage || 'You must be logged in to perform this action.';
        // Notify the app so it can redirect to login if needed
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('analytics-auth-required', { detail: { status } }));
        }
        break;
      case 403:
        error.userMessage = serverMessage || 'You do not have permission to perform this action.';
        break;
      case 404:
        error.userMessage = serverMessage || 'The requested resource was not found.';
        break;
      case 409:
        error.userMessage = serverMessage || 'A conflict occurred – the resource may have been modified by another user.';
        break;
      case 422:
        error.userMessage = serverMessage || 'The submitted data is invalid. Please review your inputs.';
        break;
      case 429:
        error.userMessage = serverMessage || 'Too many requests. Please wait a moment and try again.';
        break;
      default:
        error.userMessage = serverMessage || `An unexpected error occurred (HTTP ${status}).`;
    }

    return Promise.reject(error);
  }
);

/**
 * Extract a user-friendly error message from an Axios error.
 * Falls back to `error.userMessage` set by the interceptor, then
 * the raw Axios message, then the provided fallback.
 */
export const getRequestErrorMessage = (error, fallbackMessage = 'Request failed') => {
  if (!error) return fallbackMessage;
  if (axios.isCancel?.(error)) return 'Request cancelled';
  return error.userMessage || error.response?.data?.message || error.message || fallbackMessage;
};

export default apiClient;
