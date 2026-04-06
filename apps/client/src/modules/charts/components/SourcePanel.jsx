import React, { useState, useMemo } from "react";
import { Search, ChevronDown, Hash, Type, Calendar, BarChart3 } from "lucide-react";

const NUMERIC_TYPE_REGEX = /(int|float|number|decimal|double|long|short|numeric|real)/;
const METRIC_OPTIONS = [
  { name: "COUNT(*)", field: "*", aggregation: "COUNT", type: "metric", isBuiltin: true },
  { name: "SUM", aggregation: "SUM", type: "metric", requiresColumn: true },
  { name: "AVG", aggregation: "AVG", type: "metric", requiresColumn: true },
  { name: "MIN", aggregation: "MIN", type: "metric", requiresColumn: true },
  { name: "MAX", aggregation: "MAX", type: "metric", requiresColumn: true },
];

/**
 * SourcePanel — Left sidebar matching Superset's "Chart Source" panel.
 * Shows dataset selector, searchable metrics/columns lists.
 */
export default function SourcePanel({
  datasets = [],
  selectedDatasetId,
  onSelectDataset,
  columns = [],
  onColumnClick,
  pendingMetricAggregation = null,
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [metricsOpen, setMetricsOpen] = useState(true);
  const [columnsOpen, setColumnsOpen] = useState(true);

  // Keep metric options aggregation-first and list dataset columns separately.
  const { metrics, regularColumns } = useMemo(() => {
    const c = [];

    columns.forEach((col) => {
      c.push(col);
    });

    return {
      metrics: METRIC_OPTIONS,
      regularColumns: c,
    };
  }, [columns]);

  const displayColumns = useMemo(() => {
    if (!pendingMetricAggregation) return regularColumns;
    return regularColumns.filter((col) => NUMERIC_TYPE_REGEX.test((col.type || "").toLowerCase()));
  }, [regularColumns, pendingMetricAggregation]);

  const filterBySearch = (items) =>
    items.filter((col) =>
      col.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

  const filteredMetrics = filterBySearch(metrics);
  const filteredColumns = filterBySearch(displayColumns);

  const getTypeIcon = (type = "") => {
    const t = type.toLowerCase();
    if (t === "metric") return { icon: "ƒx", className: "metric" };
    if (NUMERIC_TYPE_REGEX.test(t))
      return { icon: "#", className: "numeric" };
    if (t.includes("date") || t.includes("time"))
      return { icon: "⏱", className: "date" };
    return { icon: "Aa", className: "text" };
  };

  return (
    <div className="source-panel">
      <div className="source-panel-header">Chart Source</div>

      {/* Dataset selector */}
      <div className="source-dataset-select">
        <select
          className="source-dataset-dropdown"
          value={selectedDatasetId || ""}
          onChange={(e) => onSelectDataset(e.target.value)}
        >
          <option value="">Select a dataset…</option>
          {datasets.map((ds) => (
            <option key={ds.datasetId} value={ds.datasetId}>
              {ds.fileName || ds.datasetId}
            </option>
          ))}
        </select>
      </div>

      {/* Search */}
      <div className="source-search">
        <div className="source-search-wrapper">
          <Search size={14} />
          <input
            type="text"
            placeholder="Search Metrics & Columns"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* Scrollable sections */}
      <div className="source-sections">
        {/* Metrics section */}
        <div className="source-section">
          <div
            className="source-section-header"
            onClick={() => setMetricsOpen(!metricsOpen)}
          >
            <span className="source-section-title">
              <BarChart3 size={14} />
              Metrics
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {pendingMetricAggregation ? (
                <span className="source-section-count" title="Click a numeric column to apply this aggregation">
                  Selected: {pendingMetricAggregation}
                </span>
              ) : null}
              <span className="source-section-count">
                Showing {filteredMetrics.length} of {metrics.length} items
              </span>
              <ChevronDown
                size={14}
                className={`source-section-chevron ${metricsOpen ? "open" : ""}`}
              />
            </div>
          </div>
          {metricsOpen && (
            <div className="source-column-list">
              {filteredMetrics.map((col) => {
                const { icon, className } = getTypeIcon(col.type);
                return (
                  <div
                    key={col.name}
                    className="source-column-item"
                    onClick={() => onColumnClick(col, "metric")}
                    title={`Click to add ${col.name} as a metric`}
                  >
                    <span className={`source-column-icon ${className}`}>{icon}</span>
                    <span className="source-column-name">{col.name}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Columns section */}
        <div className="source-section">
          <div
            className="source-section-header"
            onClick={() => setColumnsOpen(!columnsOpen)}
          >
            <span className="source-section-title">
              <Hash size={14} />
              Columns
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {pendingMetricAggregation ? (
                <span className="source-section-count">
                  Pick a numeric column
                </span>
              ) : null}
              <span className="source-section-count">
                Showing {filteredColumns.length} of {regularColumns.length} items
              </span>
              <ChevronDown
                size={14}
                className={`source-section-chevron ${columnsOpen ? "open" : ""}`}
              />
            </div>
          </div>
          {columnsOpen && (
            <div className="source-column-list">
              {filteredColumns.map((col) => {
                const { icon, className } = getTypeIcon(col.type);
                const isNumeric = NUMERIC_TYPE_REGEX.test((col.type || "").toLowerCase());
                return (
                  <div
                    key={col.name}
                    className="source-column-item"
                    onClick={() => onColumnClick(col, "column")}
                    title={
                      pendingMetricAggregation && isNumeric
                        ? `Click to add ${pendingMetricAggregation}(${col.name}) metric`
                        : `Click to add ${col.name} to X-axis`
                    }
                  >
                    <span className={`source-column-icon ${className}`}>{icon}</span>
                    <span className="source-column-name">{col.name}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
