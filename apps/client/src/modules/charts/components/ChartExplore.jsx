import React, { useState, useEffect, useCallback, useRef } from "react";
import { Loader2 } from "lucide-react";
import ExploreTopBar from "./ExploreTopBar";
import SourcePanel from "./SourcePanel";
import QueryPanel from "./QueryPanel";
import ChartPanel from "./ChartPanel";
import { listDatasets, getDatasetMetadata } from "../../../services/datasets.service";
import { queryDataset, saveChartData, getChartById } from "../../../services/charts.service";
import "../styles/explore.css";

/**
 * ChartExplore — Full-page Superset-style chart exploration view.
 * Manages all state: dataset, schema, query config, results, timing.
 */
export default function ChartExplore({ chartId, onBack }) {
  const isEditing = chartId && chartId !== "new";
  const NUMERIC_TYPE_REGEX = /(int|float|number|decimal|double|long|short|numeric|real)/;

  // ── Data state ──
  const [datasets, setDatasets] = useState([]);
  const [selectedDatasetId, setSelectedDatasetId] = useState("");
  const [columns, setColumns] = useState([]);
  const [sampleData, setSampleData] = useState([]);
  const [loadingDatasets, setLoadingDatasets] = useState(true);
  const [loadingSchema, setLoadingSchema] = useState(false);

  // ── Query config ──
  const [chartType, setChartType] = useState("bar");
  const [chartName, setChartName] = useState("Untitled Chart");

  const handleSetChartType = useCallback((newType) => {
    setChartType(newType);
    setMetrics([]);
    setXAxis(null);
    setDimensionsList([]);
    setResultData([]);
    setRowCount(0);
    setIsDirty(false);
    setError(null);
  }, []);
  const [xAxis, setXAxis] = useState(null);
  const [xAxisSortBy, setXAxisSortBy] = useState(null);
  const [metrics, setMetrics] = useState([]);
  const [pendingMetricAggregation, setPendingMetricAggregation] = useState(null);
  const [dimensionsList, setDimensionsList] = useState([]);
  const [contributionMode, setContributionMode] = useState("none");
  const [filters, setFilters] = useState([]);
  const [seriesLimit, setSeriesLimit] = useState(0);
  const [sortBy, setSortBy] = useState([]);
  const [rowLimit, setRowLimit] = useState(10000);

  // ── Customize ──
  const [showLegend, setShowLegend] = useState(true);
  const [showGrid, setShowGrid] = useState(true);

  // ── Results state ──
  const [resultData, setResultData] = useState([]);
  const [rowCount, setRowCount] = useState(0);
  const [executionTimeMs, setExecutionTimeMs] = useState(0);
  const [isQuerying, setIsQuerying] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [savedChartId, setSavedChartId] = useState(isEditing ? chartId : null);
  const [lastSaved, setLastSaved] = useState(null);
  const [isDirty, setIsDirty] = useState(false);
  const [error, setError] = useState(null);

  // Track if initial load from editing
  const initialLoadDone = useRef(false);
  const [schemaLoaded, setSchemaLoaded] = useState(false);

  // ── Load datasets ──
  useEffect(() => {
    (async () => {
      setLoadingDatasets(true);
      try {
        const data = await listDatasets();
        setDatasets(data);
      } catch (err) {
        console.error("Failed to load datasets", err);
      } finally {
        setLoadingDatasets(false);
      }
    })();
  }, []);

  // ── Load existing chart data if editing ──
  useEffect(() => {
    if (isEditing && !initialLoadDone.current) {
      (async () => {
        try {
          const chart = await getChartById(chartId);
          if (chart) {
            setChartName(chart.name || "Untitled Chart");
            setChartType(chart.visualization?.type || "bar");
            setSelectedDatasetId(chart.dataSource?.datasetId || "");
            setShowLegend(chart.style?.showLegend !== false);
            setShowGrid(chart.style?.showGrid !== false);
            setLastSaved(chart.updatedAt);

            // Restore query config
            if (chart.visualization?.xAxis) setXAxis(chart.visualization.xAxis);
            if (chart.query?.measures?.length > 0) {
              setMetrics(
                chart.query.measures.map((m) => ({
                  field: m.field,
                  aggregation: m.aggregation || "SUM",
                  label: m.label || (m.field === "*" ? "COUNT(*)" : `${m.aggregation || "SUM"}(${m.field})`),
                }))
              );
            }
            if (chart.query?.dimensions?.length > 0) {
              setDimensionsList(chart.query.dimensions.map((d) => d.field || d));
            }
            if (chart.query?.filters?.length > 0) {
              setFilters(chart.query.filters);
            }
            initialLoadDone.current = true;
          }
        } catch (err) {
          console.error("Failed to load chart", err);
        }
      })();
    }
  }, [isEditing, chartId]);

  // ── Fetch schema when dataset changes ──
  useEffect(() => {
    if (!selectedDatasetId) {
      setColumns([]);
      setSampleData([]);
      return;
    }
    (async () => {
      setLoadingSchema(true);
      try {
        const data = await getDatasetMetadata(selectedDatasetId);
        setColumns(data.schema || []);
        setSampleData(data.preview || []);

        // Auto-select first dimension and metric for new charts
        if (!schemaLoaded && (!isEditing || !initialLoadDone.current)) {
          const schema = data.schema || [];
          const numericCols = schema.filter((col) => {
            const t = (col.type || "").toLowerCase();
            return t.includes("int") || t.includes("float") || t.includes("number") || t.includes("decimal");
          });
          const textCols = schema.filter((col) => !numericCols.some((n) => n.name === col.name));

          if (textCols.length > 0 && !xAxis) {
            setXAxis(textCols[0].name);
          }
          if (metrics.length === 0) {
            setMetrics([{ field: "*", aggregation: "COUNT", label: "COUNT(*)" }]);
          }
          setSchemaLoaded(true);
        }
      } catch (err) {
        console.error("Failed to fetch schema", err);
      } finally {
        setLoadingSchema(false);
      }
    })();
  }, [selectedDatasetId, isEditing, schemaLoaded, xAxis, metrics]);

  // ── Mark dirty when config changes ──
  useEffect(() => {
    if (resultData.length > 0) {
      setIsDirty(true);
    }
  }, [xAxis, xAxisSortBy, metrics, dimensionsList, contributionMode, filters, seriesLimit, sortBy, rowLimit, chartType]);

  // ── Execute query ──
  const handleUpdateChart = useCallback(async () => {
    if (!selectedDatasetId) return;
    setIsQuerying(true);
    setError(null);
    setIsDirty(false);

    try {
      const isScatter = chartType === "scatter";
      const isLineOrArea = chartType === "line" || chartType === "area";
      const isLineAreaRaw = isLineOrArea && metrics.some((m) => (m.aggregation || "").toUpperCase() === "RAW");
      const queryPayload = {
        dimensions: isScatter ? [] : (xAxis ? [xAxis] : []),
        measures: metrics.map((m) => ({
          field: m.field,
          aggregation: m.aggregation,
          label: m.label,
        })),
        filters: filters.filter((f) => f.field && f.operator),
        sortBy,
        orderBy: sortBy.length > 0 ? sortBy : (metrics.length > 0 ? [{ field: metrics[0].label || metrics[0].field, direction: "desc" }] : []),
        raw: isScatter || isLineAreaRaw,
        rowLimit,
        seriesLimit,
        contributionMode,
      };

      const response = await queryDataset(selectedDatasetId, queryPayload);
      setResultData(response.results || []);
      setRowCount(response.rowCount || 0);
      setExecutionTimeMs(response.executionTimeMs || 0);
    } catch (err) {
      setError("Query failed: " + (err.message || "Unknown error"));
      console.error(err);
    } finally {
      setIsQuerying(false);
    }
  }, [selectedDatasetId, chartType, xAxis, metrics, dimensionsList, filters, sortBy, rowLimit, seriesLimit, contributionMode]);

  useEffect(() => {
    if (!selectedDatasetId || loadingDatasets || loadingSchema) return;

    const hasRenderableQuery =
      chartType === "scatter" ? metrics.length >= 2 : metrics.length > 0;

    if (!hasRenderableQuery) return;

    const timer = setTimeout(() => {
      handleUpdateChart();
    }, 200);

    return () => clearTimeout(timer);
  }, [
    selectedDatasetId,
    chartType,
    xAxis,
    metrics,
    dimensionsList,
    filters,
    contributionMode,
    loadingDatasets,
    loadingSchema,
    handleUpdateChart,
  ]);

  // ── Save chart ──
  const handleSave = useCallback(async () => {
    if (!selectedDatasetId) return;
    setIsSaving(true);
    try {
      const isScatter = chartType === "scatter";
      const isLineOrArea = chartType === "line" || chartType === "area";
      const isLineAreaRaw = isLineOrArea && metrics.some((m) => (m.aggregation || "").toUpperCase() === "RAW");
      const payload = {
        ...(savedChartId ? { chartId: savedChartId } : {}),
        name: chartName || "Untitled Chart",
        dataSource: { datasetId: selectedDatasetId, table: "cleaned_records" },
        query: {
          dimensions: (xAxis ? [{ field: xAxis, type: "categorical" }] : []),
          measures: metrics.map((m) => ({
            field: m.field,
            aggregation: m.aggregation,
            label: m.label,
          })),
          raw: isScatter || isLineAreaRaw,
          filters: filters.filter((f) => f.field && f.operator),
          groupBy: xAxis ? [xAxis] : [],
          orderBy: sortBy,
        },
        visualization: {
          type: chartType,
          xAxis: xAxis || "",
          yAxis: metrics[0]?.label || metrics[0]?.field || "",
          series: { stack: false, grouped: true },
        },
        style: {
          colorPalette: ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"],
          showLegend,
          showGrid,
        },
      };

      const saved = await saveChartData(payload);
      setSavedChartId(saved.chartId);
      setLastSaved(new Date().toISOString());
      setIsDirty(false);
    } catch (err) {
      setError("Save failed: " + (err.message || "Unknown error"));
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  }, [savedChartId, chartName, selectedDatasetId, chartType, xAxis, metrics, dimensionsList, filters, sortBy, showLegend, showGrid]);

  // ── Handle column click from source panel ──
  const handleColumnClick = useCallback((col, role) => {
    if (!col || !col.name) return;

    if (role === "metric") {
      const aggregation = col.aggregation || "SUM";

      if (col.requiresColumn) {
        if (pendingMetricAggregation === aggregation) {
          setPendingMetricAggregation(null);
          return;
        }
        setPendingMetricAggregation(aggregation);
        return;
      }

      const field = col.field || "*";
      const label = field === "*" ? "COUNT(*)" : `${aggregation}(${field})`;
      if (!metrics.some((m) => m.label === label)) {
        setMetrics((prev) => [...prev, { field, aggregation, label }]);
      }
      setPendingMetricAggregation(null);
    } else {
      const isNumeric = NUMERIC_TYPE_REGEX.test((col.type || "").toLowerCase());

      if (chartType === "scatter") {
        if (!isNumeric) return;
        const exists = metrics.some((m) => (m.field || m.label) === col.name);
        if (exists || metrics.length >= 2) return;
        setMetrics((prev) => [
          ...prev,
          { field: col.name, aggregation: "RAW", label: col.name },
        ]);
        setPendingMetricAggregation(null);
        return;
      }

      if (pendingMetricAggregation && isNumeric) {
        const label = `${pendingMetricAggregation}(${col.name})`;
        if (!metrics.some((m) => m.label === label)) {
          setMetrics((prev) => [
            ...prev,
            { field: col.name, aggregation: pendingMetricAggregation, label },
          ]);
        }
        setPendingMetricAggregation(null);
        return;
      }

      if (pendingMetricAggregation && !isNumeric) {
        return;
      }

      // Add as x-axis if not set, else as dimension
      if (!xAxis) {
        setXAxis(col.name);
      } else if (!dimensionsList.includes(col.name) && col.name !== xAxis) {
        setDimensionsList((prev) => [...prev, col.name]);
      }
    }
  }, [metrics, xAxis, dimensionsList, pendingMetricAggregation, chartType]);

  const CHART_CONSTRAINTS = {
    bar:     { minDim: 1, maxDim: null, minMeas: 1, maxMeas: null },
    line:    { minDim: 1, maxDim: null, minMeas: 1, maxMeas: null },
    area:    { minDim: 1, maxDim: null, minMeas: 1, maxMeas: null },
    pie:     { minDim: 1, maxDim: 1,    minMeas: 1, maxMeas: 1    },
    scatter: { minDim: 0, maxDim: null, minMeas: 2, maxMeas: 2    },
    table:   { minDim: 0, maxDim: null, minMeas: 0, maxMeas: null },
  };

  const c = CHART_CONSTRAINTS[chartType];
  let exploreValidationError = null;
  if (c) {
    const dimCount = xAxis ? 1 + dimensionsList.length : dimensionsList.length;
    if (c.maxDim !== null && dimCount > c.maxDim)
      exploreValidationError = `${chartType} supports at most ${c.maxDim} dimension(s).`;
    else if (c.maxMeas !== null && metrics.length > c.maxMeas)
      exploreValidationError = `${chartType} supports at most ${c.maxMeas} measure(s).`;
    else if (c.minMeas > 0 && metrics.length < c.minMeas)
      exploreValidationError = `Add ${c.minMeas - metrics.length} more measure(s) for ${chartType}.`;
    else if (c.minDim > 0 && dimCount < c.minDim)
      exploreValidationError = `Add at least ${c.minDim} dimension for ${chartType}.`;
  }

  // ── Loading state ──
  if (loadingDatasets) {
    return (
      <div className="explore-page">
        <div className="explore-loading">
          <Loader2 size={36} className="explore-spinner" />
          <p>Loading datasets…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="explore-page">
      <ExploreTopBar
        chartName={chartName}
        onChartNameChange={setChartName}
        isEditing={!!savedChartId}
        isDirty={isDirty}
        isSaving={isSaving}
        onSave={handleSave}
        onBack={onBack}
        lastSaved={lastSaved}
      />

      <div className="explore-layout">
        <SourcePanel
          datasets={datasets}
          selectedDatasetId={selectedDatasetId}
          pendingMetricAggregation={pendingMetricAggregation}
          onSelectDataset={(id) => {
            setSelectedDatasetId(id);
            setResultData([]);
            setRowCount(0);
            setExecutionTimeMs(0);
            setXAxis(null);
            setMetrics([]);
            setPendingMetricAggregation(null);
            setFilters([]);
            setSortBy([]);
          }}
          columns={columns}
          onColumnClick={handleColumnClick}
        />

        <QueryPanel
          chartType={chartType}
          onSetChartType={handleSetChartType}
          validationError={exploreValidationError}
          columns={columns}
          xAxis={xAxis}
          onSetXAxis={(v) => setXAxis(v)}
          xAxisSortBy={xAxisSortBy}
          onSetXAxisSortBy={(v) => setXAxisSortBy(v)}
          metrics={metrics}
          onSetMetrics={setMetrics}
          onAddMetric={(m) => setMetrics((prev) => [...prev, m])}
          onRemoveMetric={(idx) => setMetrics((prev) => prev.filter((_, i) => i !== idx))}
          contributionMode={contributionMode}
          onSetContributionMode={setContributionMode}
          filters={filters}
          onAddFilter={(f) => setFilters((prev) => [...prev, f])}
          onRemoveFilter={(idx) => setFilters((prev) => prev.filter((_, i) => i !== idx))}
          onUpdateFilter={(idx, f) => setFilters((prev) => prev.map((item, i) => (i === idx ? f : item)))}
          onUpdateChart={handleUpdateChart}
          isLoading={isQuerying}
          showLegend={showLegend}
          onToggleLegend={() => setShowLegend((v) => !v)}
          showGrid={showGrid}
          onToggleGrid={() => setShowGrid((v) => !v)}
        />

        <ChartPanel
          chartType={chartType}
          data={resultData}
          xAxis={xAxis}
          metrics={metrics}
          dimensionsList={dimensionsList}
          showLegend={showLegend}
          showGrid={showGrid}
          rowCount={rowCount}
          executionTimeMs={executionTimeMs}
          isDirty={isDirty}
          onUpdateChart={handleUpdateChart}
          sampleData={sampleData}
        />
      </div>
    </div>
  );
}
