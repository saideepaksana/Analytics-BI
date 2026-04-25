export { globalEventBus } from "./utils/eventBus.js";
export { EVENTS } from "./constants/events.js";
export { API_BASE_URL, SOCKET_URL } from "./config/env.js";
export { default as apiClient, getRequestErrorMessage } from "./http/apiClient.js";
export {
  AUTH_EVENTS,
  getCurrentUser,
  getDefaultPreferences,
  getEffectiveTheme,
  isAuthenticated,
  getUserRole,
  login,
  signup,
  updateCurrentUserProfile,
  updateCurrentUserPreferences,
  logout
} from "./utils/authBridge.js";
