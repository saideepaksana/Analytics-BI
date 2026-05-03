import apiClient from "../core/http/apiClient";

export const listDatasets = async (params = {}) => {
  const response = await apiClient.get("/datasets", { params });
  return response.data?.datasets || [];
};

export const deleteDataset = async (datasetId) => {
  const response = await apiClient.delete(`/datasets/${datasetId}`);
  return response.data;
};

export const bulkDeleteDatasets = async (datasetIds) => {
  const response = await apiClient.post("/datasets/bulk-delete", { datasetIds });
  return response.data;
};

const metadataCache = new Map();

export const getDatasetMetadata = async (datasetId, { limit = 200, offset = 0, qLimit, qOffset } = {}) => {
  // If we're just fetching basic metadata (limit=1 or similar) we can cache it
  const cacheKey = `${datasetId}-${limit}-${offset}-${qLimit}-${qOffset}`;
  
  if (metadataCache.has(cacheKey)) {
    return metadataCache.get(cacheKey);
  }

  const request = apiClient.get(`/datasets/${datasetId}/metadata`, {
    params: { limit, offset, qLimit, qOffset },
  }).then(response => response.data);

  metadataCache.set(cacheKey, request);
  
  try {
    return await request;
  } catch (error) {
    metadataCache.delete(cacheKey);
    throw error;
  }
};

export const getDatasetSchema = async (datasetId) => {
  const response = await apiClient.get(`/datasets/${datasetId}/schema`);
  return response.data?.columns || [];
};

export const updateSchemaColumn = async (datasetId, columnName, updates) => {
  const response = await apiClient.patch(`/datasets/${datasetId}/schema/${columnName}`, updates);
  return response.data;
};

export const deleteQuarantineRow = async (datasetId, rowIndex) => {
  const response = await apiClient.delete(`/datasets/${datasetId}/quarantine/${rowIndex}`);
  return response.data;
};

export const deleteAllQuarantineRows = async (datasetId) => {
  const response = await apiClient.delete(`/datasets/${datasetId}/quarantine`);
  return response.data;
};

export const validateQuarantineRow = async (datasetId, rowIndex, updatedData) => {
  const response = await apiClient.post(`/datasets/${datasetId}/quarantine/${rowIndex}/validate`, {
    updatedData,
  });
  return response.data;
};

export const restoreQuarantineRow = async (datasetId, rowIndex, updatedData) => {
  const response = await apiClient.post(`/datasets/${datasetId}/quarantine/${rowIndex}/restore`, {
    updatedData,
  });
  return response.data;
};

export const restoreAllValidQuarantineRows = async (datasetId) => {
  const response = await apiClient.post(`/datasets/${datasetId}/quarantine/restore-all`);
  return response.data;
};

export const addRelationship = async (datasetId, payload) => {
  const response = await apiClient.post(`/datasets/${datasetId}/relationships`, payload);
  return response.data;
};

export const removeRelationship = async (datasetId, payload) => {
  const response = await apiClient.delete(`/datasets/${datasetId}/relationships`, {
    data: payload
  });
  return response.data;
};
