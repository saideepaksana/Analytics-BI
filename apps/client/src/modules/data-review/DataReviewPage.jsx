import { useMemo } from "react";
import DataGrid from "./components/DataGrid";
import SchemaView from "./components/SchemaView";
import QuarantineUI from "./components/QuarantineUI";
import { useMetadata } from "./hooks/useMetadata";

function DataReviewPage({ datasetId }) {
  const {
    schema,
    previewData,
    quarantinedRows,
    loading,
    error,
    updateSchema,
    restoreQuarantinedRow,
    restoreAllValidQuarantinedRows,
    deleteQuarantinedRow,
    deleteAllQuarantinedRows
  } = useMetadata(datasetId, { autoFetch: Boolean(datasetId) });

  const hasData = useMemo(() => {
    return Boolean(datasetId) && (schema.length || previewData.length || quarantinedRows.length);
  }, [datasetId, schema.length, previewData.length, quarantinedRows.length]);

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

      {loading ? <p>Loading metadata...</p> : null}
      {error ? <p className="error-text">{error}</p> : null}

      {hasData ? (
        <>
          <QuarantineUI
            quarantinedRows={quarantinedRows}
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

          <DataGrid data={previewData} />
        </>
      ) : (
        <p>No preview/schema is available for this dataset yet.</p>
      )}
    </section>
  );
}

export default DataReviewPage;
