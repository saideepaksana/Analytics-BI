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

  const [qOffset, setQOffset] = useState(0);

  const fetchMetadata = useCallback(async () => {
    if (!datasetId) {
      return;
    }

    setState((prev) => ({ ...prev, loading: true, error: "" }));

    try {
      const response = await getDatasetMetadata(datasetId, {
        limit: previewLimit,
        offset: previewOffset,
        qLimit: 50,
        qOffset
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
  }, [datasetId, previewLimit, previewOffset, qOffset]);

  // Schema edits are persisted first, then metadata is refreshed for consistency.
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
      const response = await deleteQuarantineRow(datasetId, qOffset + rowIndex);
      // Update local state immediately so row actions feel responsive.
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

      // Single-row restore enforces backend validation before moving data back to clean records.
      await validateQuarantineRow(datasetId, qOffset + rowIndex, updatedData);

      const response = await restoreQuarantineRow(datasetId, qOffset + rowIndex, updatedData);
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
      // Merge restored rows into preview, keep only rows that backend reports as failed.
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

  // Special case: if processing is ongoing, poll every 3 seconds
  useEffect(() => {
    let timer;
    if (state.metadata?.inferenceStatus === "pending" && !state.loading && datasetId) {
       timer = setTimeout(() => {
           fetchMetadata();
       }, 3000);
    }
    return () => clearTimeout(timer);
  }, [state.metadata?.inferenceStatus, state.loading, datasetId, fetchMetadata]);

  return {
    ...state,
    refetch: fetchMetadata,
    updateSchema,
    deleteQuarantinedRow,
    deleteAllQuarantinedRows,
    restoreQuarantinedRow,
    restoreAllValidQuarantinedRows,
    qOffset,
    setQOffset
  };
};

export default useMetadata;
