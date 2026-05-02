import axios from "axios";
import { API_BASE_URL } from "../config/env";
import { getCurrentUser } from "../utils/auth";

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
});

// Add user info to all requests
apiClient.interceptors.request.use((config) => {
  let user = getCurrentUser();

  // 500 IQ Fix: If we are in export mode (Puppeteer), localStorage is empty.
  // We must inject the Automation Session credentials to allow API calls to succeed.
  if (!user && window.IS_EXPORT_MODE) {
    user = { email: 'export@analytics.local', role: 'admin' };
  }

  if (user) {
    config.headers['X-User-ID'] = user.email;
    config.headers['X-User-Role'] = user.role;
  }
  return config;
});

export const getRequestErrorMessage = (error, fallbackMessage = "Request failed") => {
  if (!error) return fallbackMessage;
  if (axios.isCancel?.(error)) return "Request cancelled";
  return error.response?.data?.message || error.message || fallbackMessage;
};

export default apiClient;
