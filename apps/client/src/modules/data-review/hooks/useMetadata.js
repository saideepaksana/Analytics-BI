import { useCallback, useEffect, useState } from "react";
import axios from "axios";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api";

export const useMetadata = (datasetId, options = {}) => {
  const { autoFetch = true, previewLimit = 200 } = options;

  const [state, setState] = useState({
    metadata: null,
    schema: [],
    quarantinedRows: [],
    previewData: [],
    loading: false,
    error: ""
  });

  const fetchMetadata = useCallback(async () => {
    if (!datasetId) {
      return;
    }

    setState((prev) => ({ ...prev, loading: true, error: "" }));

    try {
      const response = await axios.get(`${API_BASE_URL}/datasets/${datasetId}/metadata`, {
        params: { limit: previewLimit }
      });

      setState((prev) => ({
        ...prev,
        metadata: response.data.metadata || null,
        schema: response.data.schema || [],
        quarantinedRows: response.data.quarantinedRows || [],
        previewData: response.data.preview || [],
        loading: false,
        error: ""
      }));
    } catch (error) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: error.response?.data?.message || error.message || "Failed to load metadata"
      }));
    }
  }, [datasetId, previewLimit]);

  const updateSchema = useCallback(
    async (columnName, updates) => {
      if (!datasetId) {
        return;
      }

      await axios.patch(`${API_BASE_URL}/datasets/${datasetId}/schema/${columnName}`, updates);
      await fetchMetadata();
    },
    [datasetId]
  );

  const deleteQuarantinedRow = useCallback(
    async (rowIndex) => {
      if (!datasetId) {
        return;
      }
      const response = await axios.delete(`${API_BASE_URL}/datasets/${datasetId}/quarantine/${rowIndex}`);
      setState((prev) => {
        const nextRows = prev.quarantinedRows.filter((_, index) => index !== rowIndex);
        return {
          ...prev,
          quarantinedRows: nextRows,
          metadata: prev.metadata
            ? {
                ...prev.metadata,
                rowCount: response.data?.rowCount ?? prev.metadata.rowCount,
                quarantinedCount: response.data?.quarantinedCount ?? nextRows.length
              }
            : prev.metadata
        };
      });
      return response.data;
    },
    [datasetId, fetchMetadata]
  );

  const deleteAllQuarantinedRows = useCallback(
    async () => {
      if (!datasetId) {
        return null;
      }
      const response = await axios.delete(`${API_BASE_URL}/datasets/${datasetId}/quarantine`);
      setState((prev) => ({
        ...prev,
        quarantinedRows: [],
        metadata: prev.metadata
          ? {
              ...prev.metadata,
              rowCount: response.data?.rowCount ?? prev.metadata.rowCount,
              quarantinedCount: response.data?.quarantinedCount ?? 0
            }
          : prev.metadata
      }));
      return response.data;
    },
    [datasetId]
  );

  const restoreQuarantinedRow = useCallback(
    async (rowIndex, updatedData) => {
      if (!datasetId) {
        return;
      }

      // Backend-only validation pass before restore.
      await axios.post(`${API_BASE_URL}/datasets/${datasetId}/quarantine/${rowIndex}/validate`, {
        updatedData
      });

      const response = await axios.post(`${API_BASE_URL}/datasets/${datasetId}/quarantine/${rowIndex}/restore`, {
        updatedData
      });
      setState((prev) => {
        const nextRows = prev.quarantinedRows.filter((_, index) => index !== rowIndex);
        const restoredData = response.data?.restoredData;
        const nextPreview = restoredData
          ? [restoredData, ...prev.previewData].slice(0, previewLimit)
          : prev.previewData;

        return {
          ...prev,
          quarantinedRows: nextRows,
          previewData: nextPreview,
          metadata: prev.metadata
            ? {
                ...prev.metadata,
                rowCount: response.data?.rowCount ?? prev.metadata.rowCount,
                quarantinedCount: response.data?.quarantinedCount ?? nextRows.length
              }
            : prev.metadata
        };
      });
      await fetchMetadata();
      return response.data;
    },
    [datasetId, previewLimit, fetchMetadata]
  );

  const restoreAllValidQuarantinedRows = useCallback(
    async () => {
      if (!datasetId) {
        return null;
      }
      const response = await axios.post(`${API_BASE_URL}/datasets/${datasetId}/quarantine/restore-all`);
      setState((prev) => {
        const failedRows = response.data?.failedRows || [];
        const failedRowNumbers = new Set(failedRows.map((row) => row.rowNumber));

        const remainingQuarantined = prev.quarantinedRows.filter((row) =>
          failedRowNumbers.has(row.rowNumber)
        );

        const restoredRows = (response.data?.restoredRows || []).map((row) => row.data);
        const nextPreview = [...restoredRows, ...prev.previewData].slice(0, previewLimit);

        return {
          ...prev,
          quarantinedRows: remainingQuarantined,
          previewData: nextPreview,
          metadata: prev.metadata
            ? {
                ...prev.metadata,
                rowCount: response.data?.rowCount ?? prev.metadata.rowCount,
                quarantinedCount:
                  response.data?.quarantinedCount ?? remainingQuarantined.length
              }
            : prev.metadata
        };
      });
      await fetchMetadata();
      return response.data;
    },
    [datasetId, previewLimit, fetchMetadata]
  );

  useEffect(() => {
    if (autoFetch && datasetId) {
      fetchMetadata();
    }
  }, [autoFetch, datasetId, fetchMetadata]);

  return {
    ...state,
    refetch: fetchMetadata,
    updateSchema,
    deleteQuarantinedRow,
    deleteAllQuarantinedRows,
    restoreQuarantinedRow,
    restoreAllValidQuarantinedRows
  };
};

export default useMetadata;
