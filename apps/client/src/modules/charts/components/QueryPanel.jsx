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
  AlertTriangle,
} from "lucide-react";

const AGGREGATIONS = ["COUNT", "SUM", "AVG", "MIN", "MAX"];
const FILTER_OPERATORS = ["=", "!=", ">", ">=", "<", "<=", "IN", "NOT IN"];
const NUMERIC_TYPE_REGEX = /(int|float|number|decimal|double|long|short|numeric|real)/;
const CHART_TYPES = [
  { id: "bar", icon: BarChart3, label: "Bar Chart" },
  { id: "line", icon: LineChart, label: "Line Chart" },
  { id: "scatter", icon: ScatterChart, label: "Scatter Plot" },
  { id: "area", icon: AreaChart, label: "Area Chart" },
  { id: "pie", icon: PieChart, label: "Pie Chart" },
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
  metrics = [],
  onSetMetrics,
  onAddMetric,
  onRemoveMetric,
  filters = [],
  onAddFilter,
  onRemoveFilter,
  onUpdateFilter,
  onUpdateChart,
  isLoading = false,
  validationError,
  // Customize tab
  showLegend = true,
  onToggleLegend,
  showGrid = true,
  onToggleGrid,
  colorScheme = "vivid",
  onColorSchemeChange,
  colorSchemeOptions = [],
}) {
  const isScatter = chartType === "scatter";
  const isLineOrArea = chartType === "line" || chartType === "area";
  const [activeTab, setActiveTab] = useState("data");
  const [metricPickerOpen, setMetricPickerOpen] = useState(false);
  const [metricPickerField, setMetricPickerField] = useState(null);
  const [metricPickerTarget, setMetricPickerTarget] = useState("metrics");
  const [scatterAxisTarget, setScatterAxisTarget] = useState("x");
  const [queryOpen, setQueryOpen] = useState(true);

  const numericColumns = columns.filter((c) => {
    const t = (c.type || "").toLowerCase();
    return NUMERIC_TYPE_REGEX.test(t);
  });

  const handleAddMetricClick = (targetAxis = "x", target = "metrics") => {
    setMetricPickerField(null);
    setMetricPickerTarget(target);
    if (isScatter) {
      setScatterAxisTarget(targetAxis);
    }
    setMetricPickerOpen(true);
  };

  const handleSelectMetricField = (field) => {
    if (isScatter) {
      if (!field) return;
      const entry = { field, aggregation: "RAW", label: field };
      const next = [...metrics];

      if (scatterAxisTarget === "y") {
        if (!next[0]) {
          // Y axis is only meaningful after X axis is assigned.
          setMetricPickerOpen(false);
          setMetricPickerField(null);
          return;
        }
        next[1] = entry;
      } else {
        next[0] = entry;
      }

      // Keep only X/Y entries for scatter.
      const normalized = next.slice(0, 2).filter(Boolean);
      onSetMetrics?.(normalized);
      setMetricPickerOpen(false);
      setMetricPickerField(null);
      return;
    }

    if (metricPickerTarget === "lineAreaY") {
      if (!field) return;
      onSetMetrics?.([{ field, aggregation: "RAW", label: field }]);
      setMetricPickerOpen(false);
      setMetricPickerTarget("metrics");
      setMetricPickerField(null);
      return;
    }

    setMetricPickerField(field);
  };

  const handleSelectAggregation = (agg) => {
    if (metricPickerField) {
      const label =
        metricPickerField === "*"
          ? "COUNT(*)"
          : `${agg}(${metricPickerField})`;
      const nextMetric = {
        field: metricPickerField,
        aggregation: agg,
        label,
      };

      if (metricPickerTarget === "lineAreaY") {
        onSetMetrics?.([nextMetric]);
      } else {
        onAddMetric(nextMetric);
      }
    }
    setMetricPickerOpen(false);
    setMetricPickerField(null);
    setMetricPickerTarget("metrics");
  };

  const handleAddCountStar = () => {
    if (isScatter) return;
    onAddMetric({
      field: "*",
      aggregation: "COUNT",
      label: "COUNT(*)",
    });
    setMetricPickerOpen(false);
    setMetricPickerTarget("metrics");
  };

  const handleRemoveScatterAxis = (axisIndex) => {
    if (!onSetMetrics) return;
    const next = [...metrics];
    next.splice(axisIndex, 1);
    onSetMetrics(next);
  };

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
            {validationError && (
              <div style={{ padding: "8px 12px", marginBottom: "12px", backgroundColor: "rgba(239, 68, 68, 0.1)", color: "#ef4444", borderRadius: "6px", display: "flex", alignItems: "center", gap: "8px", fontSize: "0.8rem" }}>
                <AlertTriangle size={16} />
                {validationError}
              </div>
            )}
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
                {!isScatter && (
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

                    {isLineOrArea && (
                      <div className="query-section" style={{ position: "relative" }}>
                        <label className="query-section-label" style={{ marginBottom: 6, display: "block", fontSize: "0.75rem" }}>
                          Y Axis
                        </label>
                        <div className="query-chip-area" onClick={() => handleAddMetricClick("x", "lineAreaY")}>
                          {metrics[0] ? (
                            <span className="query-chip metric">
                              <span style={{ fontSize: "0.7rem", opacity: 0.7 }}>ƒx</span>
                              {metrics[0].label || metrics[0].field}
                              <button
                                className="chip-remove"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onSetMetrics?.([]);
                                }}
                              >
                                <X size={12} />
                              </button>
                            </span>
                          ) : (
                            <div className="query-chip-placeholder">
                              <Plus size={12} />
                              Select numeric column for Y Axis
                            </div>
                          )}
                        </div>

                        {metricPickerOpen && metricPickerTarget === "lineAreaY" && (
                          <>
                            <div
                              className="metric-picker-overlay"
                              onClick={() => {
                                setMetricPickerOpen(false);
                                setMetricPickerTarget("metrics");
                                setMetricPickerField(null);
                              }}
                            />
                            <div className="metric-picker">
                              {!metricPickerField ? (
                                <>
                                  <div className="metric-picker-header">
                                    Select column for Y Axis
                                  </div>
                                  {numericColumns.map((col) => (
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
                    )}

                  </>
                )}

                {/* Metrics */}
                {!isLineOrArea && (
                <div className="query-section" style={{ position: "relative" }}>
                  <label className="query-section-label" style={{ marginBottom: 6, display: "block", fontSize: "0.75rem" }}>
                    Metrics
                  </label>
                  {isScatter ? (
                    <div style={{ display: "grid", gap: 8 }}>
                      <div>
                        <label className="query-section-label" style={{ marginBottom: 4, display: "block", fontSize: "0.75rem" }}>
                          X Axis
                        </label>
                        <div className="query-chip-area" onClick={() => handleAddMetricClick("x")}>
                          {metrics[0] ? (
                            <span className="query-chip metric">
                              <span style={{ fontSize: "0.7rem", opacity: 0.7 }}>ƒx</span>
                              {metrics[0].label || metrics[0].field}
                              <button
                                className="chip-remove"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRemoveScatterAxis(0);
                                }}
                              >
                                <X size={12} />
                              </button>
                            </span>
                          ) : (
                            <div className="query-chip-placeholder">
                              <Plus size={12} />
                              Select numeric column for X Axis
                            </div>
                          )}
                        </div>
                      </div>

                      <div>
                        <label className="query-section-label" style={{ marginBottom: 4, display: "block", fontSize: "0.75rem" }}>
                          Y Axis
                        </label>
                        <div
                          className="query-chip-area"
                          onClick={() => metrics[0] && handleAddMetricClick("y")}
                          style={{ opacity: metrics[0] ? 1 : 0.6, cursor: metrics[0] ? "pointer" : "not-allowed" }}
                        >
                          {metrics[1] ? (
                            <span className="query-chip metric">
                              <span style={{ fontSize: "0.7rem", opacity: 0.7 }}>ƒx</span>
                              {metrics[1].label || metrics[1].field}
                              <button
                                className="chip-remove"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRemoveScatterAxis(1);
                                }}
                              >
                                <X size={12} />
                              </button>
                            </span>
                          ) : (
                            <div className="query-chip-placeholder">
                              <Plus size={12} />
                              {metrics[0] ? "Select numeric column for Y Axis" : "Pick X Axis first"}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="query-chip-area" onClick={() => handleAddMetricClick()}>
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
                  )}

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
                              {metricPickerTarget === "lineAreaY"
                                ? "Select column for Y Axis"
                                : isScatter
                                ? `Select numeric column for ${scatterAxisTarget === "y" ? "Y Axis" : "X Axis"}`
                                : "Select column or metric"}
                            </div>
                            {!isScatter && metricPickerTarget !== "lineAreaY" && (
                              <button
                                className="metric-picker-item"
                                onClick={handleAddCountStar}
                              >
                                <span style={{ color: "#f472b6", fontWeight: 700, fontSize: "0.75rem" }}>ƒx</span>
                                COUNT(*)
                              </button>
                            )}
                            {numericColumns.map((col) => (
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
                )}

                {!isScatter && (
                  <>
                  </>
                )}

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
              disabled={isLoading || !!validationError}
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
              <div className="customize-section-header">
                <p className="customize-title">Display Options</p>
                <p className="customize-subtitle">Control chart overlays and visual guides.</p>
              </div>

              <div className="customize-toggle">
                <div className="customize-toggle-copy">
                  <label>Show Legend</label>
                  <span>Display series labels inside the chart area.</span>
                </div>
                <button
                  className={`toggle-switch ${showLegend ? "on" : ""}`}
                  onClick={onToggleLegend}
                  aria-label="Toggle chart legend"
                />
              </div>

              <div className="customize-toggle">
                <div className="customize-toggle-copy">
                  <label>Show Grid Lines</label>
                  <span>Show horizontal and vertical guide lines.</span>
                </div>
                <button
                  className={`toggle-switch ${showGrid ? "on" : ""}`}
                  onClick={onToggleGrid}
                  aria-label="Toggle chart grid lines"
                />
              </div>

              <div className="customize-palette-wrap">
                <p className="customize-group-title">Color Scheme</p>
                <div className="color-palette-grid">
                  {colorSchemeOptions.map((scheme) => {
                    const gradient = `linear-gradient(90deg, ${scheme.colors.slice(0, 3).join(", ")})`;
                    return (
                      <button
                        key={scheme.id}
                        className={`color-swatch ${colorScheme === scheme.id ? "active" : ""}`}
                        style={{ background: gradient }}
                        onClick={() => onColorSchemeChange?.(scheme.id)}
                        title={scheme.label}
                        aria-label={`Set color scheme to ${scheme.label}`}
                      />
                    );
                  })}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
