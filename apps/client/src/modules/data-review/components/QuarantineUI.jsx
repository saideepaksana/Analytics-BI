import { useState } from "react";

function QuarantineUI({
  quarantinedRows = [],
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
        <h3>Quarantine ({quarantinedRows.length})</h3>
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
        {quarantinedRows.map((row, index) => (
          <li key={`${row.rowNumber}-${index}`} className="quarantine-item">
            <div>
              <p><strong>Row:</strong> {row.rowNumber}</p>
              <p><strong>Error:</strong> {(row.errors || []).join(", ")}</p>

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
        ))}
      </ul>
    </div>
  );
}

export default QuarantineUI;
