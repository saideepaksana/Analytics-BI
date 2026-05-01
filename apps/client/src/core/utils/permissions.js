/**
 * Frontend Permission Utilities
 *
 * Mirror of the server-side RBAC logic. Used to:
 *  - Hide / disable UI controls for unauthorized users
 *  - Protect route-level actions
 *
 * Role hierarchy: admin > editor > viewer
 *
 * IMPORTANT: These checks are UX guards only.
 * True authorization is enforced server-side via the RBAC middleware.
 */
import { getCurrentUser } from './auth';

const ROLE_LEVELS = { admin: 2, editor: 1, viewer: 0 };

/**
 * Get the effective privilege level of the current user.
 * Returns -1 when unauthenticated.
 */
const getUserLevel = () => {
  const user = getCurrentUser();
  if (!user) return -1;
  return ROLE_LEVELS[user.role] ?? 0;
};

/**
 * isOwnerOrEditor – core permission predicate.
 *
 * True when the current user is an admin/editor, OR when they are the owner
 * of the given resource.
 *
 * @param {Object} resource - object with a `createdBy` field
 * @returns {boolean}
 */
const isOwnerOrEditor = (resource) => {
  const user = getCurrentUser();
  if (!user) return false; // Unauthenticated → no mutations

  if (user.role === 'admin' || user.role === 'editor') return true;
  if (user.role === 'viewer') return false;

  // Fallback: ownership check
  const createdBy = resource?.createdBy;
  // Strict: anonymous-owned resources are NOT editable by regular users
  if (!createdBy || createdBy === 'anonymous') return false;
  return createdBy === user.email;
};

// ── Dashboard Permissions ────────────────────────────────────────────────────

/**
 * Check if the current user can edit a dashboard.
 * @param {Object} dashboard - Dashboard object with createdBy field
 * @returns {boolean}
 */
export const canEditDashboard = (dashboard) => isOwnerOrEditor(dashboard);

/**
 * Check if the current user can delete a dashboard.
 * @param {Object} dashboard
 * @returns {boolean}
 */
export const canDeleteDashboard = (dashboard) => isOwnerOrEditor(dashboard);

/**
 * Check if the current user can publish a dashboard.
 * Only owners and editors can publish.
 * @param {Object} dashboard
 * @returns {boolean}
 */
export const canPublishDashboard = (dashboard) => isOwnerOrEditor(dashboard);

/**
 * Check if the current user can create dashboards.
 * Viewers cannot create.
 * @returns {boolean}
 */
export const canCreateDashboard = () => getUserLevel() >= ROLE_LEVELS.editor;

// ── Chart Permissions ────────────────────────────────────────────────────────

/**
 * Check if the current user can edit a chart.
 * @param {Object} chart - Chart object with createdBy field
 * @returns {boolean}
 */
export const canEditChart = (chart) => isOwnerOrEditor(chart);

/**
 * Check if the current user can delete a chart.
 * @param {Object} chart
 * @returns {boolean}
 */
export const canDeleteChart = (chart) => isOwnerOrEditor(chart);

/**
 * Check if the current user can create charts.
 * Viewers cannot create charts.
 * @returns {boolean}
 */
export const canCreateChart = () => getUserLevel() >= ROLE_LEVELS.editor;

// ── General helpers ──────────────────────────────────────────────────────────

/**
 * Returns true if the current user has at least 'editor' privileges.
 */
export const isEditorOrAbove = () => getUserLevel() >= ROLE_LEVELS.editor;

/**
 * Returns true if the current user is an admin.
 */
export const isAdmin = () => {
  const user = getCurrentUser();
  return user?.role === 'admin';
};

/**
 * Returns true if the current user is authenticated.
 */
export const isLoggedIn = () => getCurrentUser() !== null;