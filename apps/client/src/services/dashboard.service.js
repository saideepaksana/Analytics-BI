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

const newDashboardId = () => {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `db-${Date.now()}-${Math.round(Math.random() * 100000)}`;
};

export const listDashboards = async () => {
  return readDashboards().sort(
    (a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0)
  );
};

export const getDashboardById = async (dashboardId) => {
  return readDashboards().find((dashboard) => dashboard.id === dashboardId) || null;
};

export const createDashboard = async (payload = {}) => {
  const dashboards = readDashboards();
  const timestamp = nowIso();
  const created = {
    id: newDashboardId(),
    name: payload.name?.trim() || "Untitled Dashboard",
    description: payload.description?.trim() || "",
    widgets: Array.isArray(payload.widgets) ? payload.widgets : [],
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  dashboards.unshift(created);
  writeDashboards(dashboards);
  return created;
};

export const updateDashboard = async (dashboardId, payload = {}) => {
  const dashboards = readDashboards();
  const index = dashboards.findIndex((dashboard) => dashboard.id === dashboardId);
  if (index === -1) {
    throw new Error("Dashboard not found");
  }

  const updated = {
    ...dashboards[index],
    ...payload,
    name: payload.name ? payload.name.trim() : dashboards[index].name,
    description: payload.description !== undefined ? payload.description.trim() : dashboards[index].description,
    widgets: Array.isArray(payload.widgets) ? payload.widgets : dashboards[index].widgets,
    updatedAt: nowIso(),
  };

  dashboards[index] = updated;
  writeDashboards(dashboards);
  return updated;
};

export const deleteDashboard = async (dashboardId) => {
  const dashboards = readDashboards();
  const filtered = dashboards.filter((dashboard) => dashboard.id !== dashboardId);
  writeDashboards(filtered);
  return { deleted: filtered.length !== dashboards.length };
};
