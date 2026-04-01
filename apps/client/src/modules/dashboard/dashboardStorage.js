import apiClient from '../../core/http/apiClient';

/**
 * Dashboard API client
 * Each dashboard, { id, name, layout[], chartIds[], annotations{}, filters, createdAt, updatedAt }
 */

export async function loadDashboards() {
  try {
    const res = await apiClient.get('/dashboards');
    return res?.data || [];
  } catch (error) {
    console.error("Failed to load dashboards:", error);
    return [];
  }
}

export async function getDashboard(id) {
  try {
    const res = await apiClient.get(`/dashboards/${id}`);
    return res?.data || null;
  } catch (error) {
    console.error(`Failed to load dashboard ${id}:`, error);
    return null;
  }
}

export async function saveDashboard(dashConfig) {
  try {
    let res;
    if (dashConfig.id) {
      res = await apiClient.put(`/dashboards/${dashConfig.id}`, dashConfig);
    } else {
      res = await apiClient.post('/dashboards', dashConfig);
    }
    return res?.data || dashConfig;
  } catch (error) {
    console.error("Failed to save dashboard:", error);
    return dashConfig;
  }
}

export async function deleteDashboard(id) {
  try {
    await apiClient.delete(`/dashboards/${id}`);
  } catch (error) {
    console.error(`Failed to delete dashboard ${id}:`, error);
  }
}
