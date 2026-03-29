import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { formatDateTime } from "../../core/utils/formatters";
import { deleteDataset, listDatasets } from "../../services/datasets.service";
import { downloadDatasetExport } from "../../services/export.service";
import { Download, FileText, FileSpreadsheet, FileJson, ChevronDown } from "lucide-react";

function DatasetsPage({ activeDatasetId, onOpenDataset }) {
  const [datasets, setDatasets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  
  // Track which dataset's export dropdown is open:
  const [openExportDropdown, setOpenExportDropdown] = useState(null);
  const dropdownRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setOpenExportDropdown(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleExport = (datasetId, format) => {
    downloadDatasetExport(datasetId, format);
    setOpenExportDropdown(null);
  };


  const fetchDatasets = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const data = await listDatasets();
      setDatasets(data);
    } catch (fetchError) {
      setError(fetchError.response?.data?.message || fetchError.message || "Failed to load datasets");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDatasets();
  }, [fetchDatasets]);

  const hasDatasets = useMemo(() => datasets.length > 0, [datasets]);

  const handleShowDeleteConfirm = useCallback((datasetId) => {
    setConfirmDelete(datasetId);
  }, []);

  const handleCancelDelete = useCallback(() => {
    setConfirmDelete(null);
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    const datasetId = confirmDelete;
    setConfirmDelete(null);
    setDeleting(datasetId);

    try {
      await deleteDataset(datasetId);
      // Optimistic local removal avoids a full refetch after a successful delete.
      setDatasets(prev => prev.filter(d => d.datasetId !== datasetId));
    } catch (deleteError) {
      setError(deleteError.response?.data?.message || deleteError.message || "Failed to delete dataset");
    } finally {
      setDeleting(null);
    }
  }, [confirmDelete]);

  return (
    <section className="card">
      <div className="panel-head datasets-head">
        <div>
          <h2>Datasets</h2>
          <p className="muted">All datasets inserted through ingestion are listed below.</p>
        </div>
        <button type="button" className="action-btn" onClick={fetchDatasets} disabled={loading}>
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {loading ? <p>Loading datasets...</p> : null}
      {error ? <p className="error-text">{error}</p> : null}

      {!loading && !error && !hasDatasets ? (
        <p>No datasets found yet. Upload a file in Ingestion to create one.</p>
      ) : null}

      {!loading && hasDatasets ? (
        <div className="table-wrap">
          <table className="basic-table">
            <thead>
              <tr>
                <th>Dataset ID</th>
                <th>File</th>
                <th>Mode</th>
                <th>Rows</th>
                <th>Quarantine</th>
                <th>Created</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {datasets.map((dataset) => {
                const isActive = dataset.datasetId === activeDatasetId;
                return (
                  <tr key={dataset.datasetId} className={isActive ? "dataset-row-active" : ""}>
                    <td className="mono">{dataset.datasetId}</td>
                    <td>{dataset.fileName || "-"}</td>
                    <td>{dataset.mode || "-"}</td>
                    <td>{dataset.rowCount ?? 0}</td>
                    <td>{dataset.quarantinedCount ?? 0}</td>
                    <td>{formatDateTime(dataset.createdAt)}</td>
                    <td>
                      <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                        <button
                          type="button"
                          className="action-btn"
                          onClick={() => onOpenDataset?.(dataset.datasetId)}
                        >
                          Open in Review
                        </button>
                        
                        <div className="export-dropdown-wrapper" ref={openExportDropdown === dataset.datasetId ? dropdownRef : null}>
                          <button 
                            type="button" 
                            className="action-btn secondary-btn"
                            onClick={() => setOpenExportDropdown(openExportDropdown === dataset.datasetId ? null : dataset.datasetId)}
                          >
                            <Download size={14} className="icon-left" /> Export <ChevronDown size={14} className="icon-right" />
                          </button>
                          
                          {openExportDropdown === dataset.datasetId && (
                            <div className="export-dropdown-menu">
                              <button type="button" onClick={() => handleExport(dataset.datasetId, "csv")}>
                                <FileText size={14} /> Export CSV
                              </button>
                              <button type="button" onClick={() => handleExport(dataset.datasetId, "xlsx")}>
                                <FileSpreadsheet size={14} /> Export Excel
                              </button>
                              <button type="button" onClick={() => handleExport(dataset.datasetId, "pdf")}>
                                <FileJson size={14} /> Export PDF
                              </button>
                            </div>
                          )}
                        </div>

                        <button
                          type="button"
                          className="action-btn delete-btn"
                          onClick={() => handleShowDeleteConfirm(dataset.datasetId)}
                          disabled={deleting === dataset.datasetId}
                        >
                          {deleting === dataset.datasetId ? "Deleting..." : "Delete"}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      {confirmDelete && (
        <div className="modal-overlay">
          <div className="modal-dialog">
            <div className="modal-content">
              <h3>Delete Dataset?</h3>
              <p>Are you sure you want to delete this dataset? This action cannot be undone and all associated data will be permanently removed.</p>
              <div className="modal-actions">
                <button
                  type="button"
                  className="action-btn cancel-btn"
                  onClick={handleCancelDelete}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="action-btn danger-btn"
                  onClick={handleConfirmDelete}
                  disabled={deleting !== null}
                >
                  {deleting !== null ? "Deleting..." : "Delete Dataset"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export default DatasetsPage;
