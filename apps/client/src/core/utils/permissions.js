import { getCurrentUser } from './auth';

/**
 * Check if the current user can edit a dashboard
 * @param {Object} dashboard - Dashboard object with createdBy field
 * @returns {boolean}
 */
export const canEditDashboard = (dashboard) => {
  const user = getCurrentUser();
  if (!user) return true; // Backward compatibility - allow if no auth

  // Admins and editors can edit all dashboards
  if (user.role === 'admin' || user.role === 'editor') return true;

  // Viewers cannot edit
  if (user.role === 'viewer') return false;

  // Owners can edit their own dashboards
  // For backward compatibility, if createdBy is not set or is "anonymous", allow editing
  const createdBy = dashboard?.createdBy;
  if (!createdBy || createdBy === 'anonymous') return true;

  return createdBy === user.email;
};

/**
 * Check if the current user can delete a dashboard
 * @param {Object} dashboard - Dashboard object with createdBy field
 * @returns {boolean}
 */
export const canDeleteDashboard = (dashboard) => {
  return canEditDashboard(dashboard);
};

/**
 * Check if the current user can edit a chart
 * @param {Object} chart - Chart object with createdBy field
 * @returns {boolean}
 */
export const canEditChart = (chart) => {
  const user = getCurrentUser();
  if (!user) return true; // Backward compatibility - allow if no auth

  // Admins and editors can edit all charts
  if (user.role === 'admin' || user.role === 'editor') return true;

  // Viewers cannot edit
  if (user.role === 'viewer') return false;

  // Owners can edit their own charts
  // For backward compatibility, if createdBy is not set or is "anonymous", allow editing
  const createdBy = chart?.createdBy;
  if (!createdBy || createdBy === 'anonymous') return true;

  return createdBy === user.email;
};

/**
 * Check if the current user can delete a chart
 * @param {Object} chart - Chart object with createdBy field
 * @returns {boolean}
 */
export const canDeleteChart = (chart) => {
  return canEditChart(chart);
};

/**
 * Check if the current user can create dashboards
 * @returns {boolean}
 */
export const canCreateDashboard = () => {
  const user = getCurrentUser();
  if (!user) return true; // Backward compatibility - allow if no auth

  // Viewers cannot create dashboards
  return user.role !== 'viewer';
};

/**
 * Check if the current user can create charts
 * @returns {boolean}
 */
export const canCreateChart = () => {
  const user = getCurrentUser();
  if (!user) return true; // Backward compatibility - allow if no auth

  // Viewers cannot create charts
  return user.role !== 'viewer';
};