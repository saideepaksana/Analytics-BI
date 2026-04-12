import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { formatDateTime } from "../../core/utils/formatters";
import { deleteDataset, listDatasets } from "../../services/datasets.service";
import { downloadDatasetExport } from "../../services/export.service";
import { Download, FileText, FileSpreadsheet, FileJson, ChevronDown, Search, SortAsc, SortDesc, Filter } from "lucide-react";

function DatasetsPage({ activeDatasetId, onOpenDataset }) {
  const [datasets, setDatasets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  
  // New state for enhanced features
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState("createdAt");
  const [sortOrder, setSortOrder] = useState("desc");
  const [selectedDatasets, setSelectedDatasets] = useState([]);
  const [expandedRows, setExpandedRows] = useState(new Set());
  
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
  const datasetToDelete = useMemo(
    () => datasets.find((dataset) => dataset.datasetId === confirmDelete) || null,
    [datasets, confirmDelete]
  );

  // Filtered and sorted datasets
  const filteredDatasets = useMemo(() => {
    let filtered = datasets.filter(dataset =>
      dataset.fileName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      dataset.datasetId?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    filtered.sort((a, b) => {
      let aVal = a[sortBy];
      let bVal = b[sortBy];

      if (sortBy === 'createdAt') {
        aVal = new Date(aVal);
        bVal = new Date(bVal);
      }

      if (aVal < bVal) return sortOrder === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    return filtered;
  }, [datasets, searchTerm, sortBy, sortOrder]);

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

  // New handlers
  const handleSelectDataset = useCallback((datasetId, checked) => {
    setSelectedDatasets(prev => 
      checked 
        ? [...prev, datasetId] 
        : prev.filter(id => id !== datasetId)
    );
  }, []);

  const handleSelectAll = useCallback((checked) => {
    setSelectedDatasets(checked ? filteredDatasets.map(d => d.datasetId) : []);
  }, [filteredDatasets]);

  const handleToggleRow = useCallback((datasetId) => {
    setExpandedRows(prev => {
      const newSet = new Set(prev);
      if (newSet.has(datasetId)) {
        newSet.delete(datasetId);
      } else {
        newSet.add(datasetId);
      }
      return newSet;
    });
  }, []);

  const handleBulkDelete = useCallback(async () => {
    if (selectedDatasets.length === 0) return;
    
    // Implement bulk delete logic
    setError("Bulk delete not implemented yet");
  }, [selectedDatasets]);

  return (
    <section className="card datasets-page-card">
      <div className="panel-head datasets-head">
        <div>
          <h2>Datasets</h2>
          <p className="muted">All datasets inserted through ingestion are listed below.</p>
        </div>
        <button type="button" className="action-btn" onClick={fetchDatasets} disabled={loading}>
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {/* Search and Filter Controls */}
      <div className="datasets-controls">
        <div className="search-container">
          <Search size={16} />
          <input
            type="text"
            placeholder="Search datasets..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
        </div>
        
        <div className="sort-container">
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
            <option value="createdAt">Date Created</option>
            <option value="fileName">File Name</option>
            <option value="rowCount">Row Count</option>
          </select>
          <button 
            type="button" 
            onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
            className="sort-btn"
          >
            {sortOrder === 'asc' ? <SortAsc size={16} /> : <SortDesc size={16} />}
          </button>
        </div>

        {selectedDatasets.length > 0 && (
          <div className="bulk-actions">
            <span>{selectedDatasets.length} selected</span>
            <button type="button" className="action-btn danger-btn" onClick={handleBulkDelete}>
              Delete Selected
            </button>
          </div>
        )}
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
                <th>
                  <input
                    type="checkbox"
                    checked={selectedDatasets.length === filteredDatasets.length && filteredDatasets.length > 0}
                    onChange={(e) => handleSelectAll(e.target.checked)}
                  />
                </th>
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
              {filteredDatasets.map((dataset) => {
                const isActive = dataset.datasetId === activeDatasetId;
                const isSelected = selectedDatasets.includes(dataset.datasetId);
                const isExpanded = expandedRows.has(dataset.datasetId);
                return (
                  <>
                    <tr key={dataset.datasetId} className={isActive ? "dataset-row-active" : ""}>
                      <td>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => handleSelectDataset(dataset.datasetId, e.target.checked)}
                        />
                      </td>
                      <td className="mono">{dataset.datasetId}</td>
                      <td>
                        <button 
                          type="button" 
                          className="expand-btn"
                          onClick={() => handleToggleRow(dataset.datasetId)}
                        >
                          {dataset.fileName || "-"} {isExpanded ? '▼' : '▶'}
                        </button>
                      </td>
                      <td>{dataset.mode || "-"}</td>
                      <td>{dataset.rowCount ?? 0}</td>
                      <td>{dataset.quarantinedCount ?? 0}</td>
                      <td>{formatDateTime(dataset.createdAt)}</td>
                      <td>
                        <div className="dataset-actions">
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
                    {isExpanded && (
                      <tr className="expanded-row">
                        <td colSpan="8">
                          <div className="schema-preview">
                            <h4>Schema Preview</h4>
                            <p>Schema preview not implemented yet. Will show column types and sample data.</p>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
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
              <p>
                Are you sure you want to delete <strong>{datasetToDelete?.fileName || "this file"}</strong>?
                This action cannot be undone and all associated data will be permanently removed.
              </p>
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
