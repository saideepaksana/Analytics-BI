import React, { useState, useEffect, useCallback } from "react";
import { Plus, X, Filter, ChevronDown, ChevronUp, Database } from "lucide-react";
import { getDatasetSchema, getDatasetMetadata } from "../../../services/datasets.service";

const FILTER_OPERATORS = ["=", "!=", ">", ">=", "<", "<=", "IN", "NOT IN"];

export default function GlobalFilterPanel({ filters = {}, setFilters, charts = [], isEditMode }) {
  const [isOpen, setIsOpen] = useState(true);
  const [availableDatasets, setAvailableDatasets] = useState([]);
  const [loading, setLoading] = useState(false);

  // Collect all unique datasets used in the dashboard
  useEffect(() => {
    const fetchDatasetDetails = async () => {
      const datasetIds = [...new Set(charts.map(c => c.dataSource?.datasetId || c.datasetId).filter(Boolean))];
      if (datasetIds.length === 0) {
        setAvailableDatasets([]);
        return;
      }

      setLoading(true);
      try {
        const details = await Promise.all(datasetIds.map(async (id) => {
          const [schema, meta] = await Promise.all([
            getDatasetSchema(id),
            getDatasetMetadata(id, { limit: 1 })
          ]);
          return {
            id,
            name: meta.metadata?.fileName || meta.dataset || `Dataset ${id.slice(-4)}`,
            schema
          };
        }));

        setAvailableDatasets(details.sort((a, b) => a.name.localeCompare(b.name)));
      } catch (err) {
        console.error("Failed to fetch dataset details for global filters", err);
      } finally {
        setLoading(false);
      }
    };

    fetchDatasetDetails();
  }, [charts]);

  const handleAddFilter = () => {
    const firstDataset = availableDatasets[0];
    const firstCol = firstDataset?.schema?.[0]?.name || "";
    const id = `filter-${Date.now()}`;
    
    setFilters({
      ...filters,
      [id]: { 
        datasetId: firstDataset?.id || "", 
        field: firstCol, 
        operator: "=", 
        value: "" 
      }
    });
  };

  const handleRemoveFilter = (id) => {
    const newFilters = { ...filters };
    delete newFilters[id];
    setFilters(newFilters);
  };

  const handleUpdateFilter = (id, updates) => {
    setFilters({
      ...filters,
      [id]: { ...filters[id], ...updates }
    });
  };

  const filterEntries = Object.entries(filters);

  if (!isEditMode && filterEntries.length === 0) return null;

  return (
    <div className="global-filter-panel">
      <div className="global-filter-header" onClick={() => setIsOpen(!isOpen)}>
        <div className="header-left">
          <Filter size={16} />
          <span>Dashboard Filters</span>
          {filterEntries.length > 0 && (
            <span className="filter-count-badge">{filterEntries.length}</span>
          )}
        </div>
        <div className="header-right">
          {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
      </div>

      {isOpen && (
        <div className="global-filter-body">
          <div className="filters-grid">
            {filterEntries.map(([id, f]) => {
              const selectedDataset = availableDatasets.find(d => d.id === f.datasetId);
              const fields = selectedDataset?.schema || [];

              return (
                <div key={id} className="global-filter-row">
                  {/* Dataset Selector */}
                  <div className="filter-field-group">
                    <span className="filter-group-label">Dataset</span>
                    <Database size={12} className="field-icon" />
                    <select
                      value={f.datasetId}
                      onChange={(e) => {
                        const newDsId = e.target.value;
                        const newDs = availableDatasets.find(d => d.id === newDsId);
                        handleUpdateFilter(id, { 
                          datasetId: newDsId, 
                          field: newDs?.schema?.[0]?.name || "" 
                        });
                      }}
                      className="filter-select dataset-select"
                    >
                      {availableDatasets.map((ds) => (
                        <option key={ds.id} value={ds.id}>{ds.name}</option>
                      ))}
                    </select>
                  </div>

                  <span className="filter-separator">▸</span>

                  {/* Field Selector */}
                  <div className="filter-field-group">
                    <span className="filter-group-label">Field</span>
                    <select
                      value={f.field}
                      onChange={(e) => handleUpdateFilter(id, { field: e.target.value })}
                      className="filter-select field-select"
                    >
                      <option value="">Select Field</option>
                      {fields.map((c) => (
                        <option key={c.name} value={c.name}>{c.name}</option>
                      ))}
                    </select>
                  </div>

                  <select
                    value={f.operator}
                    onChange={(e) => handleUpdateFilter(id, { operator: e.target.value })}
                    className="filter-select operator-select"
                  >
                    {FILTER_OPERATORS.map((op) => (
                      <option key={op} value={op}>{op}</option>
                    ))}
                  </select>

                  <input
                    type="text"
                    value={f.value}
                    placeholder="Value..."
                    onChange={(e) => handleUpdateFilter(id, { value: e.target.value })}
                    className="filter-input"
                  />

                  <button
                    className="filter-remove-btn"
                    onClick={() => handleRemoveFilter(id)}
                    title="Remove filter"
                  >
                    <X size={14} />
                  </button>
                </div>
              );
            })}

            {isEditMode && (
              <button className="add-filter-btn" onClick={handleAddFilter}>
                <Plus size={14} />
                <span>Add Filter</span>
              </button>
            )}
          </div>
          {loading && <div className="filters-loading-overlay">Updating available fields...</div>}
        </div>
      )}
    </div>
  );
}
