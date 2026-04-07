import apiClient from "../core/http/apiClient";

const STORAGE_KEY = "analytics-bi-dashboards";

export const loadDashboardsFromStorage = () => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
};

export const saveDashboardsToStorage = (dashboards) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(dashboards));
};

// Calls the live PATCH endpoint for metadata fields only
export const patchDashboardMetadata = async (dashboardId, updates) => {
  const response = await apiClient.patch(
    `/dashboard/${dashboardId}/metadata`,
    updates
  );
  return response.data.dashboard;
};
