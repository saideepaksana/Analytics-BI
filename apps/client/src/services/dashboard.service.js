import apiClient from "../core/http/apiClient";

const defaultSection = (widgets = []) => ({
  id: `section-${Date.now()}-${Math.round(Math.random() * 10000)}`,
  name: "Sales Overview",
  widgets: Array.isArray(widgets) ? widgets : [],
});

const normalizeSections = (dashboard) => {
  if (Array.isArray(dashboard.sections) && dashboard.sections.length > 0) {
    return dashboard.sections.map((section) => ({
      id: section.id || `section-${Date.now()}-${Math.round(Math.random() * 10000)}`,
      name: section.name || "Untitled Section",
      widgets: Array.isArray(section.widgets) ? section.widgets : [],
    }));
  }

  return [defaultSection(dashboard.widgets || [])];
};

const normalizeDashboard = (dashboard) => {
  // If backend returns a title but no name (on fresh fetches), we map it smoothly to name.
  if (dashboard.title && !dashboard.name) {
    dashboard.name = dashboard.title;
  }
  
  const sections = normalizeSections(dashboard);
  const activeSectionId =
    sections.some((section) => section.id === dashboard.activeSectionId)
      ? dashboard.activeSectionId
      : sections[0]?.id;
  const widgets = sections.flatMap((section) => section.widgets || []);

  return {
    ...dashboard,
    id: dashboard._id || dashboard.id,
    sections,
    activeSectionId,
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
  const sections = Array.isArray(payload.sections) && payload.sections.length > 0
    ? payload.sections
    : [defaultSection(payload.widgets || [])];
    
  const activeSectionId = sections.some((section) => section.id === payload.activeSectionId)
    ? payload.activeSectionId
    : sections[0]?.id;
    
  const name = payload.name?.trim() || "Untitled Dashboard";

  // We wrap the full UI state into _rawFrontendState so the backend persists everything.
  const rawFrontendState = {
    name,
    sections,
    activeSectionId,
    widgets: sections.flatMap((section) => section.widgets || []),
  };

  const response = await apiClient.post('/dashboards', {
    title: name,
    description: payload.description?.trim() || "",
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

  let sections = existingNormalized.sections;
  if (Array.isArray(payload.sections) && payload.sections.length > 0) {
    sections = payload.sections;
  } else if (payload.widgets) {
    const activeId = payload.activeSectionId || existingNormalized.activeSectionId || existingNormalized.sections[0]?.id;
    sections = existingNormalized.sections.map(sec =>
      sec.id === activeId ? { ...sec, widgets: payload.widgets } : sec
    );
    if (sections.length === 0) sections = [defaultSection(payload.widgets)];
  }
  const activeSectionId =
    sections.some((section) => section.id === payload.activeSectionId)
      ? payload.activeSectionId
      : sections.some((section) => section.id === existingNormalized.activeSectionId)
        ? existingNormalized.activeSectionId
        : sections[0]?.id;

  const rawFrontendState = {
    ...existingNormalized,
    ...payload,
    name: payload.name ? payload.name.trim() : existingNormalized.name,
    description: payload.description !== undefined ? payload.description.trim() : existingNormalized.description,
    sections,
    activeSectionId,
    widgets: sections.flatMap((section) => section.widgets || []),
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
