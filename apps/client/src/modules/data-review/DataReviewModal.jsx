import { useState, useMemo } from "react";
import DataGrid from "./components/DataGrid";
import SchemaView from "./components/SchemaView";
import RelationshipMap from "./components/RelationshipMap";
import QuarantineUI from "./components/QuarantineUI";
import { useMetadata } from "./hooks/useMetadata";

const PREVIEW_ROW_OPTIONS = [10, 20, 50, 100, 150, 200];
const TABS = {
  review: "review",
  quarantine: "quarantine",
  relationships: "relationships"
};

function DataReviewModal({ datasetId, onClose }) {
  const [activeTab, setActiveTab] = useState(TABS.review);
  const [previewLimit, setPreviewLimit] = useState(50);
  const [previewOffset, setPreviewOffset] = useState(0);

  const {
    metadata,
    schema,
    relationships,
    previewData,
    quarantinedRows,
    loading,
    error,
    updateSchema,
    restoreQuarantinedRow,
    restoreAllValidQuarantinedRows,
    deleteQuarantinedRow,
    deleteAllQuarantinedRows
  } = useMetadata(datasetId, {
    autoFetch: Boolean(datasetId),
    previewLimit,
    previewOffset
  });

  const hasData = useMemo(() => {
    return Boolean(datasetId) && (
      schema.length ||
      relationships.length ||
      previewData.length ||
      quarantinedRows.length
    );
  }, [datasetId, schema.length, relationships.length, previewData.length, quarantinedRows.length]);

  const hasQuarantineData = quarantinedRows.length > 0;
  const hasRelationships = relationships.length > 0;
  const totalPreviewRows = Math.max(0, metadata?.rowCount || 0);
  const currentPreviewEnd = previewOffset + previewData.length;
  const canGoPrev = previewOffset > 0;
  const canGoNext = currentPreviewEnd < totalPreviewRows;

  return (
    <div className="data-review-modal-overlay">
      <div className="data-review-modal-container">
        {/* Header with close button */}
        <div className="data-review-modal-header">
          <div className="data-review-modal-title">
            <h2>Data Review</h2>
            <p className="data-review-dataset-id">{datasetId}</p>
          </div>
          <button
            type="button"
            className="data-review-modal-close"
            onClick={onClose}
            aria-label="Close"
            title="Close"
          >
            ✕
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="data-review-modal-tabs">
          <button
            type="button"
            className={`data-review-tab ${activeTab === TABS.review ? "active" : ""}`}
            onClick={() => setActiveTab(TABS.review)}
          >
            Data Review
          </button>
          <button
            type="button"
            className={`data-review-tab ${activeTab === TABS.quarantine ? "active" : ""}`}
            onClick={() => setActiveTab(TABS.quarantine)}
            disabled={!hasQuarantineData}
            title={!hasQuarantineData ? "No quarantined rows" : undefined}
          >
            Quarantine
            {hasQuarantineData && (
              <span className="data-review-tab-badge">{quarantinedRows.length}</span>
            )}
          </button>
          <button
            type="button"
            className={`data-review-tab ${activeTab === TABS.relationships ? "active" : ""}`}
            onClick={() => setActiveTab(TABS.relationships)}
            disabled={!hasRelationships}
            title={!hasRelationships ? "No relationships defined" : undefined}
          >
            Relationships
          </button>
        </div>

        {/* Loading and Error states */}
        {loading && !hasData && <div className="data-review-modal-content"><p className="loading-text">Loading metadata...</p></div>}
        {error && <div className="data-review-modal-content"><p className="error-text">{error}</p></div>}

        {/* Tab Content */}
        {!error && hasData && (
          <div className="data-review-modal-content">
            {/* Data Review Tab */}
            {activeTab === TABS.review && (
              <div className="tab-content-section">
                <SchemaView
                  schema={schema}
                  editable
                  onRoleChange={(column, role) => updateSchema(column.name, { role })}
                />

                <div style={{ marginTop: "24px" }}>
                  <DataGrid
                    data={previewData}
                    rowsToShow={previewLimit}
                    onRowsToShowChange={(newLimit) => {
                      setPreviewLimit(newLimit);
                      setPreviewOffset(0);
                    }}
                    rowOptions={PREVIEW_ROW_OPTIONS}
                    pagination={{
                      offset: previewOffset,
                      totalRows: totalPreviewRows,
                      canGoPrev,
                      canGoNext,
                      onPrev: () => setPreviewOffset(Math.max(0, previewOffset - previewLimit)),
                      onNext: () => setPreviewOffset(previewOffset + previewLimit)
                    }}
                  />
                </div>
              </div>
            )}

            {/* Quarantine Tab */}
            {activeTab === TABS.quarantine && (
              <div className="tab-content-section">
                <QuarantineUI
                  quarantinedRows={quarantinedRows}
                  onUpdateAndRestore={(_, index, updatedData) => restoreQuarantinedRow(index, updatedData)}
                  onRestoreAll={restoreAllValidQuarantinedRows}
                  onDelete={(_, index) => deleteQuarantinedRow(index)}
                  onDeleteAll={deleteAllQuarantinedRows}
                />
              </div>
            )}

            {/* Relationships Tab */}
            {activeTab === TABS.relationships && (
              <div className="tab-content-section">
                <RelationshipMap relationships={relationships} />
              </div>
            )}
          </div>
        )}

        {!loading && !error && !hasData && (
          <div className="data-review-modal-content">
            <p>No preview/schema is available for this dataset yet.</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default DataReviewModal;
