import apiClient from "../core/http/apiClient";

const defaultTab = (widgets = []) => ({
  id: `tab-${Date.now()}-${Math.round(Math.random() * 10000)}`,
  name: "Main",
  widgets: Array.isArray(widgets) ? widgets : [],
});

const normalizeTabs = (dashboard) => {
  if (Array.isArray(dashboard.tabs) && dashboard.tabs.length > 0) {
    return dashboard.tabs.map((tab) => ({
      id: tab.id || `tab-${Date.now()}-${Math.round(Math.random() * 10000)}`,
      name: tab.name || "Untitled Tab",
      widgets: Array.isArray(tab.widgets) ? tab.widgets : [],
    }));
  }

  return [defaultTab(dashboard.widgets || dashboard.layout || [])];
};

const normalizeDashboard = (dashboard) => {
  // If backend returns a title but no name (on fresh fetches), we map it smoothly to name.
  if (dashboard.title && !dashboard.name) {
    dashboard.name = dashboard.title;
  }

  const tabs = normalizeTabs(dashboard);
  const activeTabId =
    tabs.some((tab) => tab.id === dashboard.activeTabId)
      ? dashboard.activeTabId
      : tabs[0]?.id;
  const widgets = tabs.flatMap((tab) => tab.widgets || []);

  return {
    ...dashboard,
    id: dashboard._id || dashboard.id,
    tabs,
    activeTabId,
    widgets,
  };
};

export const listDashboards = async () => {
  const response = await apiClient.get('/dashboards');
  const dbs = response.data.dashboards || [];
  return dbs.map(normalizeDashboard);
};

export const getDashboardById = async (dashboardId) => {
  const response = await apiClient.get(`/dashboards/${dashboardId}`);
  return normalizeDashboard(response.data.dashboard);
};

export const createDashboard = async (payload = {}) => {
  const tabs = Array.isArray(payload.tabs) && payload.tabs.length > 0
    ? payload.tabs
    : [defaultTab(payload.widgets || [])];

  const activeTabId = tabs.some((tab) => tab.id === payload.activeTabId)
    ? payload.activeTabId
    : tabs[0]?.id;

  const name = payload.name?.trim() || "Untitled Dashboard";

  // We wrap the full UI state into _rawFrontendState so the backend persists everything.
  const rawFrontendState = {
    name,
    tabs,
    activeTabId,
    thumbnail: payload.thumbnail || null,
    widgets: tabs.flatMap((tab) => tab.widgets || []),
  };

  const response = await apiClient.post('/dashboards', {
    ...rawFrontendState,
    title: name,
    description: payload.description?.trim() || "",
    tabs,
    activeTabId,
    _rawFrontendState: rawFrontendState
  });

  return normalizeDashboard(response.data.dashboard);
};

export const updateDashboard = async (dashboardId, payload = {}) => {
  // First, fetch existing to replicate the merge logic that was previously sync
  const getRes = await apiClient.get(`/dashboards/${dashboardId}`);
  if (!getRes.data || !getRes.data.dashboard) {
    throw new Error("Dashboard not found");
  }
  const existingNormalized = normalizeDashboard(getRes.data.dashboard);

  let tabs = existingNormalized.tabs;
  if (Array.isArray(payload.tabs) && payload.tabs.length > 0) {
    tabs = payload.tabs;
  } else if (payload.widgets) {
    const activeId = payload.activeTabId || existingNormalized.activeTabId || existingNormalized.tabs[0]?.id;
    tabs = existingNormalized.tabs.map(t =>
      t.id === activeId ? { ...t, widgets: payload.widgets } : t
    );
    if (tabs.length === 0) tabs = [defaultTab(payload.widgets)];
  }
  const activeTabId =
    tabs.some((tab) => tab.id === payload.activeTabId)
      ? payload.activeTabId
      : tabs.some((tab) => tab.id === existingNormalized.activeTabId)
        ? existingNormalized.activeTabId
        : tabs[0]?.id;

  const rawFrontendState = {
    ...existingNormalized,
    ...payload,
    name: payload.name ? payload.name.trim() : existingNormalized.name,
    description: payload.description !== undefined ? payload.description.trim() : existingNormalized.description,
    tabs,
    activeTabId,
    widgets: tabs.flatMap((tab) => tab.widgets || []),
  };

  const clientVersion = typeof payload.__v === "number" ? payload.__v : existingNormalized.__v || 0;

  const response = await apiClient.patch(`/dashboards/${dashboardId}`, {
    __v: clientVersion,
    dashboardState: {
      ...rawFrontendState,
      title: rawFrontendState.name, // send mapping for backend
      _rawFrontendState: rawFrontendState
    }
  });

  return normalizeDashboard(response.data.dashboard);
};

export const deleteDashboard = async (dashboardId) => {
  const response = await apiClient.delete(`/dashboards/${dashboardId}`);
  return { deleted: true };
};

/**
 * Publish a draft dashboard to make it live
 */
export const publishDashboard = async (dashboardId) => {
  const response = await apiClient.post(`/dashboards/${dashboardId}/publish`);
  return normalizeDashboard(response.data.dashboard);
};

/**
 * Unpublish a dashboard (revert to draft)
 */
export const unpublishDashboard = async (dashboardId) => {
  const response = await apiClient.post(`/dashboards/${dashboardId}/unpublish`);
  return normalizeDashboard(response.data.dashboard);
};

/**
 * Save draft state without publishing
 */
export const saveDraft = async (dashboardId, draftState) => {
  const response = await apiClient.post(`/dashboards/${dashboardId}/save-draft`, {
    draftState
  });
  return normalizeDashboard(response.data.dashboard);
};

/**
 * Get draft state of a dashboard
 */
export const getDraftState = async (dashboardId) => {
  const response = await apiClient.get(`/dashboards/${dashboardId}/draft`);
  return response.data.draftState;
};
