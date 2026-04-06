import React, { useState } from "react";
import {
  ChevronDown,
  X,
  Plus,
  RefreshCw,
  BarChart3,
  LineChart,
  AreaChart,
  PieChart,
  ScatterChart,
  Table2,
} from "lucide-react";

const AGGREGATIONS = ["COUNT", "SUM", "AVG", "MIN", "MAX"];
const CONTRIBUTION_MODES = [
  { value: "none", label: "None" },
  { value: "row", label: "Row" },
];
const FILTER_OPERATORS = ["=", "!=", ">", ">=", "<", "<=", "IN", "NOT IN"];
const NUMERIC_TYPE_REGEX = /(int|float|number|decimal|double|long|short|numeric|real)/;
const CHART_TYPES = [
  { id: "bar", icon: BarChart3, label: "Bar Chart" },
  { id: "line", icon: LineChart, label: "Line Chart" },
  { id: "area", icon: AreaChart, label: "Area Chart" },
  { id: "table", icon: Table2, label: "Table View" },
  { id: "pie", icon: PieChart, label: "Pie Chart" },
  { id: "scatter", icon: ScatterChart, label: "Scatter Plot" },
];

/**
 * QueryPanel — Center panel matching Superset's "Data" tab with query controls.
 */
export default function QueryPanel({
  chartType = "bar",
  onSetChartType,
  columns = [],
  xAxis,
  onSetXAxis,
  xAxisSortBy,
  onSetXAxisSortBy,
  metrics = [],
  onAddMetric,
  onRemoveMetric,
  dimensionsList = [],
  onAddDimension,
  onRemoveDimension,
  contributionMode = "none",
  onSetContributionMode,
  filters = [],
  onAddFilter,
  onRemoveFilter,
  onUpdateFilter,
  onUpdateChart,
  isLoading = false,
  // Customize tab
  showLegend = true,
  onToggleLegend,
  showGrid = true,
  onToggleGrid,
}) {
  const [activeTab, setActiveTab] = useState("data");
  const [metricPickerOpen, setMetricPickerOpen] = useState(false);
  const [metricPickerField, setMetricPickerField] = useState(null);
  const [queryOpen, setQueryOpen] = useState(true);

  const handleAddMetricClick = () => {
    setMetricPickerField(null);
    setMetricPickerOpen(true);
  };

  const handleSelectMetricField = (field) => {
    setMetricPickerField(field);
  };

  const handleSelectAggregation = (agg) => {
    if (metricPickerField) {
      const label =
        metricPickerField === "*"
          ? "COUNT(*)"
          : `${agg}(${metricPickerField})`;
      onAddMetric({
        field: metricPickerField,
        aggregation: agg,
        label,
      });
    }
    setMetricPickerOpen(false);
    setMetricPickerField(null);
  };

  const handleAddCountStar = () => {
    onAddMetric({
      field: "*",
      aggregation: "COUNT",
      label: "COUNT(*)",
    });
    setMetricPickerOpen(false);
  };

  // Get sortable fields (xAxis + metric labels)
  const sortableFields = [
    ...(xAxis ? [xAxis] : []),
    ...metrics.map((m) => m.label || m.field),
  ];

  return (
    <div className="query-panel">
      <div className="query-chart-type-bar">
        {CHART_TYPES.map((ct) => {
          const Icon = ct.icon;
          return (
            <button
              key={ct.id}
              className={`query-chart-type-btn ${chartType === ct.id ? "active" : ""}`}
              onClick={() => onSetChartType?.(ct.id)}
              title={ct.label}
            >
              <Icon size={15} />
              <span>{ct.label.replace(" Chart", "")}</span>
            </button>
          );
        })}
      </div>

      {/* Tabs: Data | Customize */}
      <div className="query-panel-tabs">
        <button
          className={`query-panel-tab ${activeTab === "data" ? "active" : ""}`}
          onClick={() => setActiveTab("data")}
        >
          Data
        </button>
        <button
          className={`query-panel-tab ${activeTab === "customize" ? "active" : ""}`}
          onClick={() => setActiveTab("customize")}
        >
          Customize
        </button>
      </div>

      <div className="query-panel-body">
        {activeTab === "data" ? (
          <>
            {/* Query Section Header */}
            <div
              className="query-section-header"
              onClick={() => setQueryOpen(!queryOpen)}
            >
              <span className="query-section-label">Query</span>
              <ChevronDown
                size={14}
                className={`query-section-chevron ${queryOpen ? "open" : ""}`}
              />
            </div>

            {queryOpen && (
              <>
                {/* X-Axis */}
                <div className="query-section">
                  <label className="query-section-label" style={{ marginBottom: 6, display: "block", fontSize: "0.75rem" }}>
                    X-axis
                  </label>
                  <div className="query-chip-area">
                    {xAxis ? (
                      <span className="query-chip dimension">
                        <span style={{ fontSize: "0.7rem", opacity: 0.7 }}>A</span>
                        {xAxis}
                        <button
                          className="chip-remove"
                          onClick={() => onSetXAxis(null)}
                        >
                          <X size={12} />
                        </button>
                      </span>
                    ) : (
                      <div className="query-chip-placeholder">
                        <Plus size={12} />
                        Drop columns here or click
                      </div>
                    )}
                  </div>
                </div>

                {/* X-Axis Sort By */}
                <div className="query-section">
                  <label className="query-section-label" style={{ marginBottom: 6, display: "block", fontSize: "0.75rem" }}>
                    X-Axis Sort By
                  </label>
                  <select
                    className="query-select"
                    value={xAxisSortBy || ""}
                    onChange={(e) => onSetXAxisSortBy(e.target.value || null)}
                  >
                    <option value="">Select…</option>
                    {columns.map((col) => (
                      <option key={col.name} value={col.name}>
                        {col.name}
                      </option>
                    ))}
                    {metrics.map((m) => (
                      <option key={m.label} value={m.label}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Metrics */}
                <div className="query-section" style={{ position: "relative" }}>
                  <label className="query-section-label" style={{ marginBottom: 6, display: "block", fontSize: "0.75rem" }}>
                    Metrics
                  </label>
                  <div className="query-chip-area" onClick={handleAddMetricClick}>
                    {metrics.map((m, idx) => (
                      <span key={idx} className="query-chip metric">
                        <span style={{ fontSize: "0.7rem", opacity: 0.7 }}>ƒx</span>
                        {m.label || m.field}
                        <button
                          className="chip-remove"
                          onClick={(e) => {
                            e.stopPropagation();
                            onRemoveMetric(idx);
                          }}
                        >
                          <X size={12} />
                        </button>
                      </span>
                    ))}
                    {metrics.length === 0 && (
                      <div className="query-chip-placeholder">
                        <Plus size={12} />
                        Drop columns/metrics here or click
                      </div>
                    )}
                  </div>

                  {/* Metric picker dropdown */}
                  {metricPickerOpen && (
                    <>
                      <div
                        className="metric-picker-overlay"
                        onClick={() => setMetricPickerOpen(false)}
                      />
                      <div className="metric-picker">
                        {!metricPickerField ? (
                          <>
                            <div className="metric-picker-header">
                              Select column or metric
                            </div>
                            <button
                              className="metric-picker-item"
                              onClick={handleAddCountStar}
                            >
                              <span style={{ color: "#f472b6", fontWeight: 700, fontSize: "0.75rem" }}>ƒx</span>
                              COUNT(*)
                            </button>
                            {columns
                              .filter((c) => {
                                const t = (c.type || "").toLowerCase();
                                return NUMERIC_TYPE_REGEX.test(t);
                              })
                              .map((col) => (
                                <button
                                  key={col.name}
                                  className="metric-picker-item"
                                  onClick={() => handleSelectMetricField(col.name)}
                                >
                                  <span style={{ color: "#818cf8", fontWeight: 700, fontSize: "0.75rem" }}>#</span>
                                  {col.name}
                                </button>
                              ))}
                          </>
                        ) : (
                          <>
                            <div className="metric-picker-header">
                              Aggregation for {metricPickerField}
                            </div>
                            {AGGREGATIONS.map((agg) => (
                              <button
                                key={agg}
                                className="metric-picker-item"
                                onClick={() => handleSelectAggregation(agg)}
                              >
                                {agg}({metricPickerField})
                              </button>
                            ))}
                          </>
                        )}
                      </div>
                    </>
                  )}
                </div>

                {/* Dimensions */}
                <div className="query-section">
                  <label className="query-section-label" style={{ marginBottom: 6, display: "block", fontSize: "0.75rem" }}>
                    Dimensions
                  </label>
                  <div className="query-chip-area">
                    {dimensionsList.map((dim, idx) => (
                      <span key={idx} className="query-chip dimension">
                        {dim}
                        <button
                          className="chip-remove"
                          onClick={() => onRemoveDimension(idx)}
                        >
                          <X size={12} />
                        </button>
                      </span>
                    ))}
                    {dimensionsList.length === 0 && (
                      <div className="query-chip-placeholder">
                        <Plus size={12} />
                        Drop columns here or click
                      </div>
                    )}
                  </div>
                </div>

                {/* Contribution Mode */}
                <div className="query-section">
                  <label className="query-section-label" style={{ marginBottom: 6, display: "block", fontSize: "0.75rem" }}>
                    Contribution Mode
                  </label>
                  <select
                    className="query-select"
                    value={contributionMode}
                    onChange={(e) => onSetContributionMode(e.target.value)}
                  >
                    {CONTRIBUTION_MODES.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Filters */}
                <div className="query-section">
                  <label className="query-section-label" style={{ marginBottom: 6, display: "block", fontSize: "0.75rem" }}>
                    Filters
                  </label>
                  {filters.map((f, idx) => (
                    <div key={idx} className="filter-row">
                      <select
                        value={f.field}
                        onChange={(e) =>
                          onUpdateFilter(idx, { ...f, field: e.target.value })
                        }
                      >
                        <option value="">Column</option>
                        {columns.map((c) => (
                          <option key={c.name} value={c.name}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                      <select
                        value={f.operator}
                        onChange={(e) =>
                          onUpdateFilter(idx, { ...f, operator: e.target.value })
                        }
                      >
                        {FILTER_OPERATORS.map((op) => (
                          <option key={op} value={op}>
                            {op}
                          </option>
                        ))}
                      </select>
                      <input
                        type="text"
                        value={f.value}
                        placeholder="Value"
                        onChange={(e) =>
                          onUpdateFilter(idx, { ...f, value: e.target.value })
                        }
                      />
                      <button
                        className="filter-remove-btn"
                        onClick={() => onRemoveFilter(idx)}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                  <button
                    className="filter-add-btn"
                    onClick={() =>
                      onAddFilter({ field: "", operator: "=", value: "" })
                    }
                  >
                    <Plus size={12} />
                    Drop columns/metrics here or click
                  </button>
                </div>

              </>
            )}

            {/* Update chart button */}
            <button
              className="query-update-btn"
              onClick={onUpdateChart}
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <RefreshCw size={16} className="explore-spinner" />
                  Querying…
                </>
              ) : (
                <>
                  <RefreshCw size={16} />
                  Update chart
                </>
              )}
            </button>
          </>
        ) : (
          /* Customize Tab */
          <>
            <div className="customize-section">
              <div className="customize-toggle">
                <label>Show Legend</label>
                <button
                  className={`toggle-switch ${showLegend ? "on" : ""}`}
                  onClick={onToggleLegend}
                />
              </div>
              <div className="customize-toggle">
                <label>Show Grid Lines</label>
                <button
                  className={`toggle-switch ${showGrid ? "on" : ""}`}
                  onClick={onToggleGrid}
                />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
