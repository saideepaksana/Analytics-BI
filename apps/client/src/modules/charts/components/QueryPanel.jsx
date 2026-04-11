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
  Box,
  BarChart,
  AlertTriangle,
} from "lucide-react";

const AGGREGATIONS = ["COUNT", "SUM", "AVG", "MIN", "MAX", "RAW"];
const FILTER_OPERATORS = ["=", "!=", ">", ">=", "<", "<=", "IN", "NOT IN"];
const NUMERIC_TYPE_REGEX = /(int|float|number|decimal|double|long|short|numeric|real)/;
const CHART_TYPES = [
  { id: "bar", icon: BarChart3, label: "Bar Chart" },
  { id: "line", icon: LineChart, label: "Line Chart" },
  { id: "scatter", icon: ScatterChart, label: "Scatter Plot" },
  { id: "area", icon: AreaChart, label: "Area Chart" },
  { id: "pie", icon: PieChart, label: "Pie Chart" },
  { id: "boxplot", icon: Box, label: "Box Plot" },
  { id: "histogram", icon: BarChart, label: "Histogram" },
];

/**
 * QueryPanel — Center panel providing data configuration and visual customization.
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
  colorSchemeOptions = [],
  onColorSchemeChange,
  // Distribution chart specific
  binSize = 10,
  onSetBinSize,
  stacking = false,
  onSetStacking,
}) {
  const isScatter = chartType === "scatter";
  const isDistribution = chartType === "boxplot" || chartType === "histogram";
  const isHistogram = chartType === "histogram";
  const [activeTab, setActiveTab] = useState("data");
  const [queryOpen, setQueryOpen] = useState(true);

  const handleUpdateMetric = (idx, updates) => {
    const next = [...metrics];
    const updated = { ...next[idx], ...updates };
    
    // Auto-update label based on selection
    if (updated.field === "*") {
      updated.label = "COUNT(*)";
      updated.aggregation = "COUNT";
    } else {
      const agg = updated.aggregation || "SUM";
      updated.label = agg === "RAW" ? updated.field : `${agg}(${updated.field})`;
    }
    
    next[idx] = updated;
    onSetMetrics?.(next);
  };

  const handleAddFieldAsMetric = (field) => {
    if (!field) return;
    const isPie = chartType === "pie";
    const newMetric = field === "*" 
      ? { field: "*", aggregation: "COUNT", label: "COUNT(*)" }
      : { field, aggregation: "SUM", label: `SUM(${field})` };
    
    if (isPie) {
      onSetMetrics?.([newMetric]);
    } else {
      onAddMetric(newMetric);
    }
  };

  return (
    <div className="query-panel">
      {/* Chart Type Selector */}
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

      {/* Tabs Navigator */}
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
              <div className="query-validation-error">
                <AlertTriangle size={16} />
                {validationError}
              </div>
            )}

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
              <div className="query-stack">
                {/* X-Axis: Standard dimension selection for non-scatter and non-distribution charts */}
                {!isScatter && !isDistribution && (
                  <div className="query-section">
                    <label className="query-section-label">
                      {chartType === "pie" ? "Dimension" : "X-axis"}
                    </label>
                    <select
                      className="query-select"
                      value={xAxis || ""}
                      onChange={(e) => onSetXAxis(e.target.value)}
                    >
                      <option value="">Select column…</option>
                      {columns.map((col) => (
                        <option key={col.name} value={col.name}>
                          {col.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Metrics: The core data configuration section */}
                <div className="query-section">
                  <label className="query-section-label">
                    {isScatter ? "Axis Configuration" : (isDistribution ? "Numeric Column" : (chartType === "pie" ? "Metric" : "Metrics"))}
                  </label>
                  
                  {isScatter ? (
                    <div className="scatter-config-grid">
                      <div>
                        <label className="sub-label">X Axis (Numeric)</label>
                        <select
                          className="query-select"
                          value={metrics[0]?.field || ""}
                          onChange={(e) => {
                            const val = e.target.value;
                            const next = [...metrics];
                            if (val) next[0] = { field: val, aggregation: "RAW", label: val };
                            else next.splice(0, 1);
                            onSetMetrics(next.filter(Boolean));
                          }}
                        >
                          <option value="">Select column…</option>
                          {columns.filter(c => NUMERIC_TYPE_REGEX.test((c.type || "").toLowerCase())).map(col => (
                            <option key={col.name} value={col.name}>{col.name}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="sub-label">Y Axis (Numeric)</label>
                        <select
                          className="query-select"
                          value={metrics[1]?.field || ""}
                          onChange={(e) => {
                            const val = e.target.value;
                            const next = [...metrics];
                            if (val) next[1] = { field: val, aggregation: "RAW", label: val };
                            else next.splice(1, 1);
                            onSetMetrics(next.filter(Boolean));
                          }}
                          disabled={!metrics[0]}
                        >
                          <option value="">Select column…</option>
                          {columns.filter(c => NUMERIC_TYPE_REGEX.test((c.type || "").toLowerCase())).map(col => (
                            <option key={col.name} value={col.name}>{col.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  ) : isDistribution ? (
                    <div className="metrics-list">
                      {metrics.map((m, idx) => (
                        <div key={idx} className="metric-row">
                          <select
                            className="query-select field-select"
                            style={{ width: metrics.length > 1 ? "calc(100% - 30px)" : "100%" }}
                            value={m.field || ""}
                            onChange={(e) => {
                              const next = [...metrics];
                              next[idx] = { ...next[idx], field: e.target.value, label: e.target.value, aggregation: "RAW" };
                              onSetMetrics(next);
                            }}
                          >
                            <option value="">Select numeric column…</option>
                            {columns
                              .filter((c) => NUMERIC_TYPE_REGEX.test((c.type || "").toLowerCase()))
                              .map((col) => (
                                <option key={col.name} value={col.name}>
                                  {col.name}
                                </option>
                              ))}
                          </select>
                          {metrics.length > 1 && (
                            <button
                              className="filter-remove-btn"
                              onClick={() => onRemoveMetric(idx)}
                              title="Remove metric"
                            >
                              <X size={14} />
                            </button>
                          )}
                        </div>
                      ))}

                      {isHistogram && (
                        <div style={{ marginTop: 12 }}>
                          <label className="sub-label">Bin Size</label>
                          <input
                            type="number"
                            className="query-select"
                            value={binSize}
                            min="1"
                            onChange={(e) => onSetBinSize?.(Number(e.target.value))}
                            placeholder="Default: 10"
                          />
                        </div>
                      )}

                      <button
                        className="filter-add-btn"
                        style={{ marginTop: 12 }}
                        onClick={() => {
                          const firstNumeric = columns.find((c) =>
                            NUMERIC_TYPE_REGEX.test((c.type || "").toLowerCase())
                          );
                          if (firstNumeric) {
                            onAddMetric({
                              field: firstNumeric.name,
                              aggregation: "RAW",
                              label: firstNumeric.name,
                            });
                          }
                        }}
                      >
                        <Plus size={12} />
                        Add Metric
                      </button>
                    </div>
                  ) : (
                    <div className="metrics-list">
                      {metrics.map((m, idx) => (
                        <div key={idx} className="metric-row">
                          <select
                            className="query-select field-select"
                            value={m.field}
                            onChange={(e) => handleUpdateMetric(idx, { field: e.target.value })}
                          >
                            <option value="*">COUNT(*)</option>
                            {columns.map(col => <option key={col.name} value={col.name}>{col.name}</option>)}
                          </select>
                          {m.field !== "*" && (
                            <select
                              className="query-select agg-select"
                              value={m.aggregation}
                              onChange={(e) => handleUpdateMetric(idx, { aggregation: e.target.value })}
                            >
                              {AGGREGATIONS.map(agg => (
                                <option key={agg} value={agg}>
                                  {agg === "RAW" ? "None" : agg}
                                </option>
                              ))}
                            </select>
                          )}
                          <button 
                            className="filter-remove-btn" 
                            onClick={() => onRemoveMetric(idx)}
                            title="Remove metric"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ))}

                      {(chartType !== "pie" || metrics.length === 0) && (
                        <button
                          className="filter-add-btn"
                          onClick={() => handleAddFieldAsMetric(columns[0]?.name || "*")}
                        >
                          <Plus size={12} />
                          Add Metric
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Filters Section */}
                <div className="query-section">
                  <label className="query-section-label">Filters</label>
                  {filters.map((f, idx) => (
                    <div key={idx} className="filter-row">
                      <select
                        value={f.field}
                        onChange={(e) => onUpdateFilter(idx, { ...f, field: e.target.value })}
                      >
                        <option value="">Column</option>
                        {columns.map((c) => (
                          <option key={c.name} value={c.name}>{c.name}</option>
                        ))}
                      </select>
                      <select
                        value={f.operator}
                        onChange={(e) => onUpdateFilter(idx, { ...f, operator: e.target.value })}
                      >
                        {FILTER_OPERATORS.map((op) => (
                          <option key={op} value={op}>{op}</option>
                        ))}
                      </select>
                      <input
                        type="text"
                        value={f.value}
                        placeholder="Value"
                        onChange={(e) => onUpdateFilter(idx, { ...f, value: e.target.value })}
                      />
                      <button
                        className="filter-remove-btn"
                        onClick={() => onRemoveFilter(idx)}
                        title="Remove filter"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                  <button
                    className="filter-add-btn"
                    onClick={() => onAddFilter({ field: "", operator: "=", value: "" })}
                  >
                    <Plus size={12} />
                    Add Filter
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          /* Customize Tab: Visual Settings */
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

            {(chartType === "bar" || chartType === "line" || chartType === "area") && (
              <div className="customize-toggle">
                <div className="customize-toggle-copy">
                  <label>Stacked Mode</label>
                  <span>Display multiple metrics in a stacked format.</span>
                </div>
                <button
                  className={`toggle-switch ${stacking ? "on" : ""}`}
                  onClick={() => onSetStacking?.(!stacking)}
                  aria-label="Toggle stacked rendering"
                />
              </div>
            )}
          </div>
        )}
      </div>

      <div className="query-panel-footer">
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
      </div>
    </div>
  );
}
