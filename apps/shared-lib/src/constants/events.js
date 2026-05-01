export const EVENTS = {
  AUTH_LOGIN: "auth:login",
  AUTH_LOGOUT: "auth:logout",
  AUTH_TOKEN_REFRESHED: "auth:tokenRefreshed",
  DATA_UPLOADED: "data:uploaded",
  DATA_DELETED: "data:deleted",
  DATA_PROCESSED: "data:processed",
  CHART_CREATED: "chart:created",
  CHART_UPDATED: "chart:updated",
  CHART_DELETED: "chart:deleted",
  EXPORT_STARTED: "export:started",
  EXPORT_COMPLETED: "export:completed",
  EXPORT_FAILED: "export:failed",
  SETTINGS_CHANGED: "settings:changed",
  THEME_CHANGED: "theme:changed",
  ERROR_CRITICAL: "error:critical",
  ERROR_WARNING: "error:warning"
};

export default EVENTS;
