import apiClient from "../core/http/apiClient";

/**
 * Fetch aggregated data for a dataset based on query config.
 */
export const queryDataset = async (datasetId, query) => {
  const response = await apiClient.post(`/datasets/${datasetId}/query`, query);
  return response.data.results;
};

/**
 * Save a new chart or update an existing one.
 */
export const saveChartData = async (chartData) => {
  const response = await apiClient.post(`/charts`, chartData);
  return response.data.chart;
};

/**
 * List charts with optional filtering.
 */
export const fetchCharts = async (params = {}) => {
  const response = await apiClient.get(`/charts`, { params });
  return response.data;
};

/**
 * Delete a chart.
 */
export const deleteChartData = async (id) => {
  const response = await apiClient.delete(`/charts/${id}`);
  return response.data;
};
