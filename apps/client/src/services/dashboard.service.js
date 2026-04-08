const STORAGE_KEY = "analyticsbi_dashboards_v1";

const safeJsonParse = (value, fallback) => {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const readDashboards = () => {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  const parsed = safeJsonParse(raw, []);
  return Array.isArray(parsed) ? parsed : [];
};

const writeDashboards = (dashboards) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(dashboards));
};

const nowIso = () => new Date().toISOString();

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
  const sections = normalizeSections(dashboard);
  const activeSectionId =
    sections.some((section) => section.id === dashboard.activeSectionId)
      ? dashboard.activeSectionId
      : sections[0]?.id;
  const widgets = sections.flatMap((section) => section.widgets || []);

  return {
    ...dashboard,
    sections,
    activeSectionId,
    widgets,
  };
};

const newDashboardId = () => {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `db-${Date.now()}-${Math.round(Math.random() * 100000)}`;
};

export const listDashboards = async () => {
  return readDashboards()
    .map(normalizeDashboard)
    .sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0));
};

export const getDashboardById = async (dashboardId) => {
  const found = readDashboards().find((dashboard) => dashboard.id === dashboardId);
  return found ? normalizeDashboard(found) : null;
};

export const createDashboard = async (payload = {}) => {
  const dashboards = readDashboards();
  const timestamp = nowIso();
  const sections = Array.isArray(payload.sections) && payload.sections.length > 0
    ? payload.sections
    : [defaultSection(payload.widgets || [])];
  const activeSectionId = sections.some((section) => section.id === payload.activeSectionId)
    ? payload.activeSectionId
    : sections[0]?.id;
  const created = {
    id: newDashboardId(),
    name: payload.name?.trim() || "Untitled Dashboard",
    description: payload.description?.trim() || "",
    sections,
    activeSectionId,
    widgets: sections.flatMap((section) => section.widgets || []),
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  dashboards.unshift(created);
  writeDashboards(dashboards);
  return normalizeDashboard(created);
};

export const updateDashboard = async (dashboardId, payload = {}) => {
  const dashboards = readDashboards();
  const index = dashboards.findIndex((dashboard) => dashboard.id === dashboardId);
  if (index === -1) {
    throw new Error("Dashboard not found");
  }

  const existingNormalized = normalizeDashboard(dashboards[index]);
  
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

  const updated = {
    ...dashboards[index],
    ...payload,
    name: payload.name ? payload.name.trim() : dashboards[index].name,
    description: payload.description !== undefined ? payload.description.trim() : dashboards[index].description,
    sections,
    activeSectionId,
    widgets: sections.flatMap((section) => section.widgets || []),
    updatedAt: nowIso(),
  };

  dashboards[index] = updated;
  writeDashboards(dashboards);
  return normalizeDashboard(updated);
};

export const deleteDashboard = async (dashboardId) => {
  const dashboards = readDashboards();
  const filtered = dashboards.filter((dashboard) => dashboard.id !== dashboardId);
  writeDashboards(filtered);
  return { deleted: filtered.length !== dashboards.length };
};
