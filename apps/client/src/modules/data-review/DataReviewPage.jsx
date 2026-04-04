import { useMemo, useState } from "react";
import DataGrid from "./components/DataGrid";
import SchemaView from "./components/SchemaView";
import RelationshipMap from "./components/RelationshipMap";
import QuarantineUI from "./components/QuarantineUI";
import { useMetadata } from "./hooks/useMetadata";

const PREVIEW_ROW_OPTIONS = [10, 20, 50, 100, 150, 200];

function DataReviewPage({ datasetId }) {
  const [previewLimit, setPreviewLimit] = useState(50);

  // Centralized metadata/actions hook used by all review sub-sections.
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
    deleteAllQuarantinedRows,
    qOffset,
    setQOffset
  } = useMetadata(datasetId, {
    autoFetch: Boolean(datasetId),
    previewLimit
  });

  // Keep render branches simple by precomputing whether any review content exists.
  const hasData = useMemo(() => {
    return Boolean(datasetId) && (
      schema.length ||
      relationships.length ||
      previewData.length ||
      quarantinedRows.length
    );
  }, [datasetId, schema.length, relationships.length, previewData.length, quarantinedRows.length]);

  if (!datasetId) {
    return (
      <section className="card">
        <h2>Step 2: Data Review</h2>
        <p>Upload a file to start reviewing schema and preview rows.</p>
      </section>
    );
  }

  return (
    <section className="card">
      <h2>Step 2: Data Review</h2>
      <p><strong>Dataset:</strong> {datasetId}</p>

      {loading && !metadata ? <p>Loading metadata...</p> : null}
      {error ? <p className="error-text">{error}</p> : null}

      {metadata?.inferenceStatus === "pending" ? (
        <div className="processing-state card" style={{ textAlign: 'center', padding: '3rem' }}>
          <div className="spinner" style={{ marginBottom: '1rem' }} />
          <h3>Processing your data...</h3>
          <p className="muted">
            We are analyzing your file, inferring schema, and validating rows in the background. 
            This page will automatically refresh once it's ready.
          </p>
        </div>
      ) : hasData ? (
        <>
          {/* All quarantine actions call backend endpoints via useMetadata service methods. */}
          <QuarantineUI
            quarantinedRows={quarantinedRows}
            totalCount={metadata?.quarantinedCount || quarantinedRows.length}
            qOffset={qOffset}
            onNextPage={() => setQOffset(qOffset + 50)}
            onPrevPage={() => setQOffset(Math.max(0, qOffset - 50))}
            onUpdateAndRestore={(_, index, updatedData) => restoreQuarantinedRow(index, updatedData)}
            onRestoreAll={restoreAllValidQuarantinedRows}
            onDelete={(_, index) => deleteQuarantinedRow(index)}
            onDeleteAll={deleteAllQuarantinedRows}
          />

          <SchemaView
            schema={schema}
            editable
            onRoleChange={(column, role) => updateSchema(column.name, { role })}
          />

          <RelationshipMap relationships={relationships} />

          <DataGrid
            data={previewData}
            rowsToShow={previewLimit}
            onRowsToShowChange={setPreviewLimit}
            rowOptions={PREVIEW_ROW_OPTIONS}
          />
        </>
      ) : !loading && metadata?.inferenceStatus !== "pending" ? (
        <p>No preview/schema is available for this dataset yet.</p>
      ) : null}
    </section>
  );
}

export default DataReviewPage;
