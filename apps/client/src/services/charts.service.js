import apiClient from "../core/http/apiClient";

/**
 * Fetch aggregated data for a dataset based on query config.
 * Returns { results, rowCount, executionTimeMs }
 */
export const queryDataset = async (datasetId, query) => {
  const response = await apiClient.post(`/datasets/${datasetId}/query`, query);
  return response.data;
};

/**
 * Save a new chart or update an existing one.
 */
export const saveChartData = async (chartData) => {
  const response = await apiClient.post(`/charts`, chartData);
  return response.data.chart;
};

/**
 * Update an existing chart by chartId.
 */
export const updateChartData = async (chartId, chartData) => {
  const response = await apiClient.post(`/charts`, { ...chartData, chartId });
  return response.data.chart;
};

/**
 * Get a single chart by ID.
 */
export const getChartById = async (chartId) => {
  const response = await apiClient.get(`/charts/${chartId}`);
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
