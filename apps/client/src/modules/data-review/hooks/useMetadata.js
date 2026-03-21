import { useCallback, useEffect, useState } from "react";
import {
  deleteAllQuarantineRows,
  deleteQuarantineRow,
  getDatasetMetadata,
  restoreAllValidQuarantineRows,
  restoreQuarantineRow,
  updateSchemaColumn,
  validateQuarantineRow,
} from "../../../services/datasets.service";

export const useMetadata = (datasetId, options = {}) => {
  const { autoFetch = true, previewLimit = 200, previewOffset = 0 } = options;

  const [state, setState] = useState({
    metadata: null,
    schema: [],
    relationships: [],
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
      const response = await getDatasetMetadata(datasetId, {
        limit: previewLimit,
        offset: previewOffset,
      });

      setState((prev) => ({
        ...prev,
        metadata: response.metadata || null,
        schema: response.schema || [],
        relationships: response.relationships || [],
        quarantinedRows: response.quarantinedRows || [],
        previewData: response.preview || [],
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
  }, [datasetId, previewLimit, previewOffset]);

  const updateSchema = useCallback(
    async (columnName, updates) => {
      if (!datasetId) {
        return;
      }

      await updateSchemaColumn(datasetId, columnName, updates);
      await fetchMetadata();
    },
    [datasetId]
  );

  const deleteQuarantinedRow = useCallback(
    async (rowIndex) => {
      if (!datasetId) {
        return;
      }
      const response = await deleteQuarantineRow(datasetId, rowIndex);
      setState((prev) => {
        const nextRows = prev.quarantinedRows.filter((_, index) => index !== rowIndex);
        return {
          ...prev,
          quarantinedRows: nextRows,
          metadata: prev.metadata
            ? {
                ...prev.metadata,
                  rowCount: response?.rowCount ?? prev.metadata.rowCount,
                  quarantinedCount: response?.quarantinedCount ?? nextRows.length
              }
            : prev.metadata
        };
      });
        return response;
    },
    [datasetId, fetchMetadata]
  );

  const deleteAllQuarantinedRows = useCallback(
    async () => {
      if (!datasetId) {
        return null;
      }
      const response = await deleteAllQuarantineRows(datasetId);
      setState((prev) => ({
        ...prev,
        quarantinedRows: [],
        metadata: prev.metadata
          ? {
              ...prev.metadata,
              rowCount: response?.rowCount ?? prev.metadata.rowCount,
              quarantinedCount: response?.quarantinedCount ?? 0
            }
          : prev.metadata
      }));
      return response;
    },
    [datasetId]
  );

  const restoreQuarantinedRow = useCallback(
    async (rowIndex, updatedData) => {
      if (!datasetId) {
        return;
      }

      // Backend-only validation pass before restore.
      await validateQuarantineRow(datasetId, rowIndex, updatedData);

      const response = await restoreQuarantineRow(datasetId, rowIndex, updatedData);
      setState((prev) => {
        const nextRows = prev.quarantinedRows.filter((_, index) => index !== rowIndex);
        const restoredData = response?.restoredData;
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
                  rowCount: response?.rowCount ?? prev.metadata.rowCount,
                  quarantinedCount: response?.quarantinedCount ?? nextRows.length
              }
            : prev.metadata
        };
      });
      await fetchMetadata();
        return response;
    },
    [datasetId, previewLimit, fetchMetadata]
  );

  const restoreAllValidQuarantinedRows = useCallback(
    async () => {
      if (!datasetId) {
        return null;
      }
      const response = await restoreAllValidQuarantineRows(datasetId);
      setState((prev) => {
        const failedRows = response?.failedRows || [];
        const failedRowNumbers = new Set(failedRows.map((row) => row.rowNumber));

        const remainingQuarantined = prev.quarantinedRows.filter((row) =>
          failedRowNumbers.has(row.rowNumber)
        );

        const restoredRows = (response?.restoredRows || []).map((row) => row.data);
        const nextPreview = [...restoredRows, ...prev.previewData].slice(0, previewLimit);

        return {
          ...prev,
          quarantinedRows: remainingQuarantined,
          previewData: nextPreview,
          metadata: prev.metadata
            ? {
                ...prev.metadata,
                  rowCount: response?.rowCount ?? prev.metadata.rowCount,
                quarantinedCount:
                    response?.quarantinedCount ?? remainingQuarantined.length
              }
            : prev.metadata
        };
      });
      await fetchMetadata();
        return response;
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
