import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api';

/**
 * useMetadata Hook - Fetches and manages inferred metadata from backend
 * @param {string} datasetId - The ID of the dataset to fetch metadata for
 * @param {Object} options - Configuration options
 * @returns {Object} - { metadata, schema, quarantinedRows, previewData, loading, error, refetch, updateSchema }
 */
export const useMetadata = (datasetId, options = {}) => {
  const { autoFetch = true, previewLimit = 100 } = options;

  const [state, setState] = useState({
    metadata: null,
    schema: [],
    quarantinedRows: [],
    previewData: [],
    columns: [],
    loading: false,
    error: null,
  });

  // Fetch all metadata for a dataset
  const fetchMetadata = useCallback(async () => {
    if (!datasetId) return;

    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const response = await axios.get(`${API_BASE_URL}/datasets/${datasetId}/metadata`);
      const { metadata, schema, quarantinedRows, preview, columns } = response.data;

      setState({
        metadata,
        schema: schema || [],
        quarantinedRows: quarantinedRows || [],
        previewData: preview || [],
        columns: columns || [],
        loading: false,
        error: null,
      });
    } catch (err) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: err.response?.data?.message || err.message || 'Failed to fetch metadata',
      }));
    }
  }, [datasetId]);

  // Fetch only preview data
  const fetchPreview = useCallback(async (limit = previewLimit) => {
    if (!datasetId) return;

    try {
      const response = await axios.get(
        `${API_BASE_URL}/datasets/${datasetId}/preview`,
        { params: { limit } }
      );
      setState((prev) => ({
        ...prev,
        previewData: response.data.preview || [],
        columns: response.data.columns || prev.columns,
      }));
    } catch (err) {
      console.error('Failed to fetch preview:', err);
    }
  }, [datasetId, previewLimit]);

  // Fetch only schema
  const fetchSchema = useCallback(async () => {
    if (!datasetId) return;

    try {
      const response = await axios.get(`${API_BASE_URL}/datasets/${datasetId}/schema`);
      setState((prev) => ({
        ...prev,
        schema: response.data.schema || [],
      }));
    } catch (err) {
      console.error('Failed to fetch schema:', err);
    }
  }, [datasetId]);

  // Fetch quarantined rows
  const fetchQuarantinedRows = useCallback(async () => {
    if (!datasetId) return;

    try {
      const response = await axios.get(`${API_BASE_URL}/datasets/${datasetId}/quarantine`);
      setState((prev) => ({
        ...prev,
        quarantinedRows: response.data.quarantinedRows || [],
      }));
    } catch (err) {
      console.error('Failed to fetch quarantined rows:', err);
    }
  }, [datasetId]);

  // Update schema (e.g., change column role)
  const updateSchema = useCallback(async (columnName, updates) => {
    if (!datasetId) return;

    try {
      const response = await axios.patch(
        `${API_BASE_URL}/datasets/${datasetId}/schema/${columnName}`,
        updates
      );
      
      setState((prev) => ({
        ...prev,
        schema: prev.schema.map((col) =>
          col.name === columnName ? { ...col, ...updates } : col
        ),
      }));

      return response.data;
    } catch (err) {
      console.error('Failed to update schema:', err);
      throw err;
    }
  }, [datasetId]);

  // Delete quarantined row
  const deleteQuarantinedRow = useCallback(async (rowIndex) => {
    if (!datasetId) return;

    try {
      await axios.delete(
        `${API_BASE_URL}/datasets/${datasetId}/quarantine/${rowIndex}`
      );
      
      setState((prev) => ({
        ...prev,
        quarantinedRows: prev.quarantinedRows.filter((_, i) => i !== rowIndex),
      }));
    } catch (err) {
      console.error('Failed to delete quarantined row:', err);
      throw err;
    }
  }, [datasetId]);

  // Restore quarantined row to main dataset
  const restoreQuarantinedRow = useCallback(async (rowIndex) => {
    if (!datasetId) return;

    try {
      await axios.post(
        `${API_BASE_URL}/datasets/${datasetId}/quarantine/${rowIndex}/restore`
      );
      
      setState((prev) => ({
        ...prev,
        quarantinedRows: prev.quarantinedRows.filter((_, i) => i !== rowIndex),
      }));
      
      // Refetch preview to include restored row
      await fetchPreview();
    } catch (err) {
      console.error('Failed to restore quarantined row:', err);
      throw err;
    }
  }, [datasetId, fetchPreview]);

  // Export quarantined rows
  const exportQuarantinedRows = useCallback(async (format = 'csv') => {
    if (!datasetId) return;

    try {
      const response = await axios.get(
        `${API_BASE_URL}/datasets/${datasetId}/quarantine/export`,
        { 
          params: { format },
          responseType: 'blob' 
        }
      );
      
      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `quarantine-${datasetId}.${format}`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to export quarantined rows:', err);
      throw err;
    }
  }, [datasetId]);

  // Auto-fetch on mount and datasetId change
  useEffect(() => {
    if (autoFetch && datasetId) {
      fetchMetadata();
    }
  }, [autoFetch, datasetId, fetchMetadata]);

  return {
    ...state,
    refetch: fetchMetadata,
    fetchPreview,
    fetchSchema,
    fetchQuarantinedRows,
    updateSchema,
    deleteQuarantinedRow,
    restoreQuarantinedRow,
    exportQuarantinedRows,
  };
};

export default useMetadata;
