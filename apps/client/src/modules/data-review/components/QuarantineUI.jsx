import { useState } from "react";

function QuarantineUI({
  quarantinedRows = [],
  totalCount = 0,
  qOffset = 0,
  onNextPage,
  onPrevPage,
  onDelete,
  onDeleteAll,
  onRestoreAll,
  onUpdateAndRestore
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [editingIndex, setEditingIndex] = useState(null);
  const [draft, setDraft] = useState({});
  const [rowErrors, setRowErrors] = useState([]);

  const resetEditor = () => {
    setEditingIndex(null);
    setDraft({});
    setRowErrors([]);
  };

  const startEdit = (row, index) => {
    setEditingIndex(index);
    setDraft({ ...(row.rawData || {}) });
    setRowErrors([]);
    setMessage("");
  };

  const handleDeleteOne = async (row, index) => {
    if (!onDelete) return;
    setBusy(true);
    setMessage("");
    try {
      await onDelete(row, index);
      if (editingIndex === index) {
        resetEditor();
      }
    } catch (error) {
      setMessage(error.response?.data?.message || error.message || "Failed to delete quarantined row");
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteAll = async () => {
    if (!onDeleteAll) return;
    setBusy(true);
    setMessage("");
    try {
      const result = await onDeleteAll();
      resetEditor();
      setMessage(`Deleted ${result?.deletedCount || 0} quarantined rows.`);
    } catch (error) {
      setMessage(error.response?.data?.message || error.message || "Failed to delete all quarantined rows");
    } finally {
      setBusy(false);
    }
  };

  const handleRestoreAll = async () => {
    if (!onRestoreAll) return;
    setBusy(true);
    setMessage("");
    try {
      const result = await onRestoreAll();
      const restoredCount = result?.restoredCount ?? result?.restoredRows?.length ?? 0;
      const failedCount = result?.failedCount ?? result?.failedRows?.length ?? 0;
      setMessage(`Restored ${restoredCount} rows. ${failedCount} still need updates.`);
    } catch (error) {
      setMessage(error.response?.data?.message || error.message || "Failed to restore quarantined rows");
    } finally {
      setBusy(false);
    }
  };

  const handleUpdateAndRestore = async (row, index) => {
    if (!onUpdateAndRestore) return;

    setBusy(true);
    setMessage("");
    setRowErrors([]);
    try {
      await onUpdateAndRestore(row, index, draft);
      setMessage(`Row ${row.rowNumber} restored successfully.`);
      resetEditor();
    } catch (error) {
      const backendErrors = error.response?.data?.errors || [];
      setRowErrors(Array.isArray(backendErrors) ? backendErrors : []);
      setMessage(error.response?.data?.message || error.message || "Failed to update and restore row");
    } finally {
      setBusy(false);
    }
  };

  if (!quarantinedRows.length) {
    return null;
  }

  return (
    <div className="panel-block warning-block">
      <div className="panel-head">
        <h3>Quarantine</h3>
        {totalCount > 50 && (
          <p className="quarantine-subtitle" style={{ fontSize: "0.85em", color: "var(--text-muted)", marginTop: "4px" }}>
            Viewing rows {qOffset + 1}-{Math.min(qOffset + quarantinedRows.length, totalCount)} of {totalCount} total issues
          </p>
        )}
      </div>

      <div className="quarantine-top-actions">
        <button type="button" className="action-btn" onClick={handleRestoreAll} disabled={busy}>
          Restore All
        </button>
        <button type="button" className="action-btn danger" onClick={handleDeleteAll} disabled={busy}>
          Delete All
        </button>
      </div>

      {message ? <p className="quarantine-message">{message}</p> : null}

      <ul className="quarantine-list">
        {quarantinedRows.map((row, index) => {
          const previewEntries = Object.entries(row.rawData || {}).slice(0, 6);

          return (
          <li key={`${row.rowNumber}-${index}`} className="quarantine-item">
            <div className="quarantine-item-content">
              <div className="quarantine-row-meta">
                <span className="quarantine-row-badge">Row {row.rowNumber ?? index + 1}</span>
                <span className="quarantine-row-issues">{(row.errors || []).length || 1} issue(s)</span>
              </div>

              <p className="quarantine-error-text">
                <strong>Error:</strong> {(row.errors || []).join(", ") || "Validation issue detected"}
              </p>

              {previewEntries.length ? (
                <div className="quarantine-field-list">
                  {previewEntries.map(([field, value]) => (
                    <span key={`${row.rowNumber}-${field}`} className="quarantine-field-chip" title={`${field}: ${value ?? ""}`}>
                      <strong>{field}:</strong> {String(value ?? "—")}
                    </span>
                  ))}
                </div>
              ) : null}

              {editingIndex === index ? (
                <div className="fix-form">
                  <p className="fix-form-title">Update row values to match validation rules:</p>
                  {Object.keys(draft).map((field) => (
                    <label key={`${row.rowNumber}-${field}`} className="fix-field">
                      <span>{field}</span>
                      <input
                        type="text"
                        value={draft[field] ?? ""}
                        onChange={(event) =>
                          setDraft((prev) => ({
                            ...prev,
                            [field]: event.target.value
                          }))
                        }
                        disabled={busy}
                      />
                    </label>
                  ))}

                  {rowErrors.length ? (
                    <ul className="row-error-list">
                      {rowErrors.map((err) => (
                        <li key={`${row.rowNumber}-${err}`}>{err}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}
            </div>
            <div className="row-actions">
              {editingIndex === index ? (
                <>
                  <button type="button" onClick={() => handleUpdateAndRestore(row, index)} disabled={busy}>
                    Update & Restore
                  </button>
                  <button type="button" className="muted-action" onClick={resetEditor} disabled={busy}>
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <button type="button" onClick={() => startEdit(row, index)} disabled={busy}>
                    Fix & Restore
                  </button>
                  <button type="button" onClick={() => handleDeleteOne(row, index)} disabled={busy}>
                    Delete
                  </button>
                </>
              )}
            </div>
          </li>
          );
        })}
      </ul>

      {totalCount > 50 && (
        <div className="data-review-pagination" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '1rem', marginTop: '1rem' }}>
          <button
            type="button"
            className="pagination-btn"
            onClick={onPrevPage}
            disabled={qOffset === 0 || busy}
          >
            Prev
          </button>
          <span className="pagination-info">
            Rows {qOffset + 1}-{Math.min(qOffset + quarantinedRows.length, totalCount)} / {totalCount}
          </span>
          <button
            type="button"
            className="pagination-btn"
            onClick={onNextPage}
            disabled={qOffset + quarantinedRows.length >= totalCount || busy}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

export default QuarantineUI;
