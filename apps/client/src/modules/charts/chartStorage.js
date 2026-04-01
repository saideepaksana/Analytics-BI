import apiClient from '../../core/http/apiClient';

/**
 * Chart API Client
 * Each Chart: { id, name, datasetId, chartType, dimensions[], measures[], customization{}, data{}, columns[], createdAt, updatedAt }
 */

export async function loadCharts() {
  try {
    const res = await apiClient.get('/charts');
    // Using apiClient, res directly maps to the response JSON or Axios res.data depending on implementation.
    // Let's assume apiClient returns res directly if interceptor is set or Axios shape, but apiClient from `core/api/apiClient.js` usually just exports an axios instance.
    return res?.data || [];
  } catch (error) {
    console.error("Failed to load charts:", error);
    return [];
  }
}

export async function getChart(id) {
  try {
    const res = await apiClient.get(`/charts/${id}`);
    return res?.data || null;
  } catch (error) {
    console.error(`Failed to fetch chart config for ${id}:`, error);
    return null;
  }
}

export async function saveChart(chartConfig) {
  try {
    let res;
    if (chartConfig.id) {
      res = await apiClient.put(`/charts/${chartConfig.id}`, chartConfig);
    } else {
      res = await apiClient.post('/charts', chartConfig);
    }
    return res?.data || chartConfig;
  } catch (error) {
    console.error("Failed to save chart:", error);
    return chartConfig;
  }
}

export async function deleteChart(id) {
  try {
    await apiClient.delete(`/charts/${id}`);
  } catch (error) {
    console.error(`Failed to delete chart ${id}:`, error);
  }
}
