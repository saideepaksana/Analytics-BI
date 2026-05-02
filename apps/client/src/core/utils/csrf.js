/**
 * CSRF Token Management
 *
 * Fetches a CSRF token from /api/csrf-token, caches it for 55 minutes
 * (tokens expire after 60 min server-side), and automatically attaches
 * it to the X-CSRF-Token header on all state-mutating API requests.
 *
 * Usage: call `setupCsrfInterceptor(apiClient)` once after the client
 * is created (done in apiClient.js).
 */
import axios from 'axios';
import { API_BASE_URL } from '../config/env';

/** In-memory token cache — survives page navigation but not full reload. */
let _csrfToken = null;
let _csrfFetchedAt = null;
const CSRF_TTL_MS = 55 * 60 * 1000; // 55 minutes
const AUTH_STORAGE_KEY = "analytics-bi-auth";

const getAuthHeaders = () => {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return {};

    const user = JSON.parse(raw);
    if (!user?.isAuthenticated || !user?.email || !user?.role) {
      return {};
    }

    return {
      "X-User-ID": user.email,
      "X-User-Role": user.role,
    };
  } catch {
    return {};
  }
};

/**
 * Fetch a fresh CSRF token from the server.
 * Silently returns null if the user is unauthenticated.
 */
const fetchCsrfToken = async () => {
  try {
    const response = await axios.get(`${API_BASE_URL}/csrf-token`, {
      withCredentials: true,
      headers: getAuthHeaders(),
    });
    return response.data?.csrfToken || null;
  } catch {
    return null;
  }
};

/**
 * Return the cached CSRF token, re-fetching if expired.
 */
export const getCsrfToken = async () => {
  const now = Date.now();
  if (_csrfToken && _csrfFetchedAt && now - _csrfFetchedAt < CSRF_TTL_MS) {
    return _csrfToken;
  }

  _csrfToken = await fetchCsrfToken();
  _csrfFetchedAt = _csrfToken ? now : null;
  return _csrfToken;
};

/**
 * Clear the cached token (call on logout).
 */
export const clearCsrfToken = () => {
  _csrfToken = null;
  _csrfFetchedAt = null;
};

/**
 * Install a request interceptor on `client` that auto-attaches the
 * X-CSRF-Token header to POST / PUT / PATCH / DELETE requests.
 *
 * @param {import('axios').AxiosInstance} client
 */
export const setupCsrfInterceptor = (client) => {
  client.interceptors.request.use(async (config) => {
    const mutating = ['post', 'put', 'patch', 'delete'].includes(
      (config.method || '').toLowerCase()
    );
    if (!mutating) return config;

    const token = await getCsrfToken();
    if (token) {
      config.headers['X-CSRF-Token'] = token;
    }
    return config;
  });
};
