import React, { useState, useEffect, useCallback, useRef } from "react";
import { Loader2 } from "lucide-react";
import ExploreTopBar from "./ExploreTopBar";
import SourcePanel from "./SourcePanel";
import QueryPanel from "./QueryPanel";
import ChartPanel from "./ChartPanel";
import { listDatasets, getDatasetMetadata } from "../../../services/datasets.service";
import { queryDataset, saveChartData, getChartById } from "../../../services/charts.service";
import "../styles/explore.css";

const COLOR_SCHEMES = {
  vivid: ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"],
  ocean: ["#0284c7", "#06b6d4", "#0ea5e9", "#38bdf8", "#7dd3fc"],
  sunset: ["#f97316", "#fb7185", "#f43f5e", "#f59e0b", "#eab308"],
  forest: ["#14532d", "#166534", "#15803d", "#22c55e", "#86efac"],
  mono: ["#334155", "#475569", "#64748b", "#94a3b8", "#cbd5e1"],
  cyber: ["#8b5cf6", "#c084fc", "#10b981", "#06b6d4", "#e879f9"],
  emerald: ["#10b981", "#34d399", "#f59e0b", "#3b82f6", "#64748b"],
  glassy: ["#0284c7", "#38bdf8", "#0ea5e9", "#7dd3fc", "#ef4444"],
};

const getSchemeByPalette = (palette = []) => {
  const entry = Object.entries(COLOR_SCHEMES).find(([, colors]) =>
    colors.length === palette.length && colors.every((color, idx) => color === palette[idx])
  );
  return entry?.[0] || "vivid";
};

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

  // Store selections per chart type to restore when returning
  const chartSelections = useRef({
    bar: { xAxis: null, metrics: [] },
    line: { xAxis: null, metrics: [] },
    area: { xAxis: null, metrics: [] },
    pie: { xAxis: null, metrics: [] },
    scatter: { xAxis: null, metrics: [] },
  });

  const initialLoadDone = useRef(false);

  const handleSetChartType = useCallback((newType, currentType, currentXAxis, currentMetrics) => {
    // Save current selections before switching
    if (currentType && chartSelections.current[currentType]) {
      chartSelections.current[currentType] = {
        xAxis: currentXAxis,
        metrics: currentMetrics,
      };
    }

    // Restore saved selections for new chart type if they exist
    const savedSelections = chartSelections.current[newType] || { xAxis: null, metrics: [] };
    if (savedSelections.xAxis) {
      setXAxis(savedSelections.xAxis);
    }
    if (savedSelections.metrics && savedSelections.metrics.length > 0) {
      setMetrics(savedSelections.metrics);
    }

    setChartType(newType);
    setDimensionsList([]);
    setResultData([]);
    setRowCount(0);
    setExecutionTimeMs(0);
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
  const [colorScheme, setColorScheme] = useState("vivid");

  // ── Results state ──
  const [resultData, setResultData] = useState([]);
  const [rowCount, setRowCount] = useState(0);
  const [executionTimeMs, setExecutionTimeMs] = useState(0);
  const [isQuerying, setIsQuerying] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [savedChartId, setSavedChartId] = useState(isEditing ? chartId : null);
  const [lastSaved, setLastSaved] = useState(null);
  const [isDirty, setIsDirty] = useState(false);
  const [isChartOutdated, setIsChartOutdated] = useState(false);
  const [error, setError] = useState(null);

  const [schemaLoaded, setSchemaLoaded] = useState(false);

  // ── Navigation Guard ──
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  const handleBack = useCallback(() => {
    if (isDirty) {
      if (window.confirm("You have unsaved changes. Are you sure you want to leave?")) {
        onBack();
      }
    } else {
      onBack();
    }
  }, [isDirty, onBack]);

  const extractErrorMessage = (err, fallback) => {
    return err?.response?.data?.message || err?.response?.data?.detail || err?.message || fallback;
  };

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
            setColorScheme(getSchemeByPalette(chart.style?.colorPalette || []));
            setLastSaved(chart.updatedAt);
            setSavedChartId(chart.chartId);

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
            // ── Auto-query on first load ──
            const chartTypeVal = chart.visualization?.type || "bar";
            const isScatter = chartTypeVal === "scatter";
            const isLineOrArea = chartTypeVal === "line" || chartTypeVal === "area";
            const isLineAreaRaw = isLineOrArea && chart.query?.measures?.some((m) => (m.aggregation || "").toUpperCase() === "RAW");
            const finalXAxis = chart.visualization?.xAxis || "";
            
            const queryPayload = {
              dimensions: isScatter ? [] : (finalXAxis ? [finalXAxis] : []),
              measures: chart.query?.measures || [],
              filters: (chart.query?.filters || []).filter((f) => f.field && f.operator),
              sortBy: chart.query?.sortBy || [],
              orderBy: chart.query?.orderBy || [],
              raw: isScatter || isLineAreaRaw,
              rowLimit: chart.query?.rowLimit || 10000,
              seriesLimit: chart.query?.seriesLimit || 0,
              contributionMode: chart.query?.contributionMode || "none",
            };

            setIsQuerying(true);
            try {
              const response = await queryDataset(chart.dataSource.datasetId, queryPayload);
              setResultData(response.results || []);
              setRowCount(response.rowCount || 0);
              setExecutionTimeMs(response.executionTimeMs || 0);
              setIsDirty(false); 
              setIsChartOutdated(false);
            } catch (qErr) {
              console.error("Initial load query failed", qErr);
            } finally {
              setIsQuerying(false);
            }

            initialLoadDone.current = true;
          }
        } catch (err) {
          console.error("Failed to load chart", err);
        }
      })();
    }
  }, [isEditing, chartId]);

  // ── Fresh Start ──
  // Ensure that when entering "New" mode, all state is wiped clean
  useEffect(() => {
    if (!isEditing && initialLoadDone.current) {
      setXAxis(null);
      setMetrics([]);
      setFilters([]);
      setResultData([]);
      setIsDirty(false);
      initialLoadDone.current = false;
    }
  }, [isEditing]);

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

        // Auto-selection disabled as requested
        setSchemaLoaded(true);
      } catch (err) {
        console.error("Failed to fetch schema", err);
      } finally {
        setLoadingSchema(false);
      }
    })();
  }, [selectedDatasetId]);

  // ── Mark dirty when config changes ──
  useEffect(() => {
    if (resultData.length > 0) {
      setIsDirty(true);
      setIsChartOutdated(true);
    }
  }, [xAxis, xAxisSortBy, metrics, dimensionsList, contributionMode, filters, seriesLimit, sortBy, rowLimit, chartType]);

  // Visual-only changes (no query update needed)
  useEffect(() => {
    if (resultData.length > 0) {
      setIsDirty(true);
    }
  }, [chartName, showLegend, showGrid, colorScheme]);

  // ── Execute query ──
  const handleUpdateChart = useCallback(async () => {
    if (!selectedDatasetId) return;
    setIsQuerying(true);
    setError(null);
    setIsChartOutdated(false);

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
      setError(`Query failed: ${extractErrorMessage(err, "Unknown error")}`);
      console.error(err);
    } finally {
      setIsQuerying(false);
    }
  }, [selectedDatasetId, chartType, xAxis, metrics, dimensionsList, filters, sortBy, rowLimit, seriesLimit, contributionMode]);



  // ── Save chart ──
  const handleSave = useCallback(async () => {
    if (!selectedDatasetId) return;
    setIsSaving(true);
    try {
      const isScatter = chartType === "scatter";
      const isLineOrArea = chartType === "line" || chartType === "area";
      const isLineAreaRaw = isLineOrArea && metrics.some((m) => (m.aggregation || "").toUpperCase() === "RAW");
      const isXAxisNumeric = NUMERIC_TYPE_REGEX.test(
        String(columns.find((col) => col.name === xAxis)?.type || "").toLowerCase()
      );
      const payloadXAxis = isScatter ? (metrics[0]?.field || "") : (xAxis || "");
      const payloadYAxis = isScatter ? (metrics[1]?.field || "") : (metrics[0]?.label || metrics[0]?.field || "");

      const payload = {
        ...(savedChartId ? { chartId: savedChartId } : {}),
        name: chartName || "Untitled Chart",
        dataSource: { datasetId: selectedDatasetId, table: "cleaned_records" },
        query: {
          dimensions: (!isScatter && xAxis
            ? [{ field: xAxis, type: isXAxisNumeric ? "continuous" : "categorical" }]
            : []),
          measures: metrics.map((m) => ({
            field: m.field,
            aggregation: m.aggregation,
            label: m.label,
          })),
          raw: isScatter || isLineAreaRaw,
          filters: filters.filter((f) => f.field && f.operator),
          groupBy: !isScatter && xAxis ? [xAxis] : [],
          orderBy: sortBy,
        },
        visualization: {
          type: chartType,
          xAxis: payloadXAxis,
          yAxis: payloadYAxis,
          series: { stack: false, grouped: true },
        },
        style: {
          colorPalette: COLOR_SCHEMES[colorScheme] || COLOR_SCHEMES.vivid,
          colorScheme,
          showLegend,
          showGrid,
        },
      };

      const saved = await saveChartData(payload);
      setSavedChartId(saved.chartId);
      setLastSaved(new Date().toISOString());
      setIsDirty(false);
    } catch (err) {
      setError(`Save failed: ${extractErrorMessage(err, "Unknown error")}`);
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  }, [savedChartId, chartName, selectedDatasetId, chartType, xAxis, metrics, dimensionsList, filters, sortBy, showLegend, showGrid, colorScheme, columns]);

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

  // Validation disabled for now
  const exploreValidationError = null;

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
        onBack={handleBack}
        lastSaved={lastSaved}
      />

      {error ? <div className="explore-error-banner">{error}</div> : null}

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
          onSetChartType={(newType) => handleSetChartType(newType, chartType, xAxis, metrics)}
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
          colorScheme={colorScheme}
          onColorSchemeChange={setColorScheme}
          colorSchemeOptions={Object.entries(COLOR_SCHEMES).map(([id, colors]) => ({
            id,
            label: id.charAt(0).toUpperCase() + id.slice(1),
            colors,
          }))}
        />

        <ChartPanel
          chartType={chartType}
          data={resultData}
          xAxis={xAxis}
          metrics={metrics}
          dimensionsList={dimensionsList}
          showLegend={showLegend}
          showGrid={showGrid}
          colorPalette={COLOR_SCHEMES[colorScheme] || COLOR_SCHEMES.vivid}
          rowCount={rowCount}
          executionTimeMs={executionTimeMs}
          isDirty={isChartOutdated}
          onUpdateChart={handleUpdateChart}
          sampleData={sampleData}
        />
      </div>
    </div>
  );
}
