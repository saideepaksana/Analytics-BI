import React, { useState, useEffect, useCallback } from "react";
import { Search, Database, Check } from "lucide-react";
import { listDatasets } from "../../../services/datasets.service";
import { formatDateTime } from "../../../core/utils/formatters";

export default function DatasetExplorer({ selectedId, onSelect }) {
  const [datasets, setDatasets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  const fetchDatasets = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await listDatasets();
      setDatasets(data);
    } catch (err) {
      setError(err.message || "Failed to load datasets");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDatasets();
  }, [fetchDatasets]);

  const filteredDatasets = datasets.filter((d) =>
    (d.fileName || d.datasetId || "").toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="dataset-explorer">
      <div className="explorer-search">
        <Search className="explorer-search-icon" size={18} />
        <input
          type="text"
          placeholder="Search datasets by name or ID..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {loading && <div className="explorer-status">Loading datasets...</div>}
      {error && <div className="explorer-status error-text">{error}</div>}

      {!loading && !error && filteredDatasets.length === 0 && (
        <div className="explorer-status muted">
          {searchTerm ? "No datasets match your search." : "No datasets available."}
        </div>
      )}

      <div className="explorer-list">
        {filteredDatasets.map((dataset) => {
          const isSelected = dataset.datasetId === selectedId;
          return (
            <div
              key={dataset.datasetId}
              className={`dataset-item ${isSelected ? "selected" : ""}`}
              onClick={() => onSelect(dataset.datasetId)}
            >
              <div className="dataset-item-info">
                <span className="dataset-item-title">{dataset.fileName || "Untitled Dataset"}</span>
                <div className="dataset-item-meta">
                  <span className="mono">{dataset.datasetId}</span>
                  <span>•</span>
                  <span>{dataset.rowCount?.toLocaleString() || 0} rows</span>
                  <span>•</span>
                  <span>{formatDateTime(dataset.createdAt)}</span>
                </div>
              </div>
              <div className="dataset-item-check">
                <Check size={14} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
