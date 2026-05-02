import React, { useState, useMemo, useRef, useEffect } from "react";
import {
  AlertTriangle, BarChart2
} from "lucide-react";
import ReactECharts from "echarts-for-react";

/**
 * ChartPanel — Right panel with chart type toolbar, live chart, status bar, and results/samples tabs.
 */
export default function ChartPanel({
  chartType = "bar",
  data = [],
  xAxis,
  metrics = [],
  dimensionsList = [],
  showLegend = true,
  showGrid = true,
  colorPalette = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"],
  rowCount = 0,
  executionTimeMs = 0,
  isDirty = false,
  onUpdateChart,
  sampleData = [],
  binSize = 10,
  stacking = false,
  showLabels = false,
  showTitle = true,
  chartTitle = "",
  onChartReady,
}) {
  const [bottomTab, setBottomTab] = useState("results");
  const echartsRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(() => {
      try {
        echartsRef.current?.getEchartsInstance()?.resize();
      } catch (e) {
        // ignore if instance isn't ready
      }
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // Format execution time
  const formatTime = (ms) => {
    if (ms < 1000) return `0h:0(${(ms / 1000).toFixed(2)}s)`;
    const secs = (ms / 1000).toFixed(1);
    return `0h:0(${secs}s)`;
  };

  // Build ECharts option
  const chartOption = useMemo(() => {
    if (!data || data.length === 0) {
      return null;
    }

    if (metrics.length === 0) {
      return {
        title: {
          text: "Select at least one metric to render chart",
          left: "center",
          top: "center",
          textStyle: { color: "#94a3b8", fontSize: 14, fontWeight: "normal" }
        }
      };
    }

    const colors = [...colorPalette, "#ec4899", "#06b6d4"];
    const titleText = showTitle ? String(chartTitle || "").trim() : "";
    const titleOption = titleText
      ? {
          text: titleText,
          left: "center",
          top: 6,
          textStyle: { color: "#e2e8f0", fontSize: 14, fontWeight: 600 },
        }
      : null;
    const gridTop = titleText ? "16%" : "10%";
    const darkTooltip = {
      backgroundColor: "rgba(15, 23, 42, 0.95)",
      borderColor: "#1e293b",
      textStyle: { color: "#f8fafc", fontSize: 12 },
    };

    // --- BOX PLOT ---
    if (chartType === "boxplot") {
      const boxDataList = [];
      const axisData = [];

      metrics.forEach((m, idx) => {
        const field = m.field;
        if (!field) return;

        const rawValues = data
          .map((item) => Number(item[field]))
          .filter((v) => !isNaN(v))
          .sort((a, b) => a - b);

        if (rawValues.length === 0) return;

        const getQuartile = (arr, q) => {
          const pos = (arr.length - 1) * q;
          const base = Math.floor(pos);
          const rest = pos - base;
          if (arr[base + 1] !== undefined) {
            return arr[base] + rest * (arr[base + 1] - arr[base]);
          } else {
            return arr[base];
          }
        };

        const boxData = [
          rawValues[0], // min
          getQuartile(rawValues, 0.25), // Q1
          getQuartile(rawValues, 0.5), // median
          getQuartile(rawValues, 0.75), // Q3
          rawValues[rawValues.length - 1], // max
        ];

        const itemColor = colors[idx % colors.length];
        boxDataList.push({
          value: boxData,
          itemStyle: {
            color: itemColor,
            borderColor: itemColor,
            borderWidth: 2,
          },
        });
        axisData.push(m.label || field);
      });

      if (boxDataList.length === 0) return null;

      return {
        backgroundColor: "transparent",
        title: titleOption,
        tooltip: { ...darkTooltip, trigger: "item" },
        grid: { top: gridTop, left: "10%", right: "10%", bottom: "15%", containLabel: true },
        xAxis: {
          type: "category",
          data: axisData,
          axisLine: { lineStyle: { color: "#334155" } },
          axisLabel: { color: "#94a3b8", rotate: axisData.length > 5 ? 30 : 0 },
        },
        yAxis: {
          type: "value",
          splitLine: { show: showGrid, lineStyle: { color: "rgba(148,163,184,0.08)" } },
          axisLabel: { color: "#94a3b8" },
        },
        color: colors,
        legend: {
          show: false, // User requested no legend for Box Plot
        },
        series: [
          {
            name: "BoxPlot",
            type: "boxplot",
            data: boxDataList,
            label: {
              show: showLabels,
              position: "top",
              color: "#94a3b8",
            },
          },
        ],
      };
    }

    // --- HISTOGRAM ---
    if (chartType === "histogram") {
      const validMetrics = metrics.filter((m) => m.field);
      if (validMetrics.length === 0) return null;

      // Find global min/max for consistent binning
      let globalMin = Infinity;
      let globalMax = -Infinity;
      const metricsData = [];

      validMetrics.forEach((m) => {
        const vals = data.map((item) => Number(item[m.field])).filter((v) => !isNaN(v));
        if (vals.length > 0) {
          globalMin = Math.min(globalMin, ...vals);
          globalMax = Math.max(globalMax, ...vals);
          metricsData.push({ m, vals });
        }
      });

      if (metricsData.length === 0) return null;

      const actualBinSize = binSize || 10;
      const start = Math.floor(globalMin / actualBinSize) * actualBinSize;
      const end = Math.ceil(globalMax / actualBinSize) * actualBinSize;
      const binCount = Math.max(1, Math.ceil((end - start) / actualBinSize));

      const binLabels = new Array(binCount)
        .fill(0)
        .map((_, i) => `${start + i * actualBinSize} - ${start + (i + 1) * actualBinSize}`);

      const series = metricsData.map(({ m, vals }) => {
        const bins = new Array(binCount).fill(0);
        vals.forEach((v) => {
          const idx = Math.min(binCount - 1, Math.floor((v - start) / actualBinSize));
          bins[idx]++;
        });
        return {
          name: m.label || m.field,
          type: "bar",
          data: bins,
          itemStyle: { borderRadius: [4, 4, 0, 0] },
          barMaxWidth: 100,
          label: {
            show: showLabels,
            position: "top",
            color: "#94a3b8",
          },
        };
      });

      return {
        backgroundColor: "transparent",
        title: titleOption,
        tooltip: { ...darkTooltip, trigger: "axis" },
        grid: { top: gridTop, left: "10%", right: "10%", bottom: "15%", containLabel: true },
        xAxis: {
          type: "category",
          data: binLabels,
          axisLine: { lineStyle: { color: "#334155" } },
          axisLabel: { color: "#94a3b8", rotate: binLabels.length > 8 ? 35 : 0 },
        },
        yAxis: {
          type: "value",
          name: "Count",
          nameTextStyle: { color: "#94a3b8" },
          splitLine: { show: showGrid, lineStyle: { color: "rgba(148,163,184,0.08)" } },
          axisLabel: { color: "#94a3b8" },
        },
        color: colors,
        legend: {
          show: showLegend,
          textStyle: { color: "#94a3b8" },
          bottom: 0,
        },
        series,
      };
    }

    // SCATTER
    if (chartType === "scatter") {
      const xField = metrics[0]?.field;
      const yField = metrics[1]?.field;
      if (!xField || !yField) return null;

      const scatterData = data
        .map((item) => [Number(item[xField]), Number(item[yField])])
        .filter((pair) => !isNaN(pair[0]) && !isNaN(pair[1]));

      return {
        backgroundColor: "transparent",
        title: titleOption,
        tooltip: {
          ...darkTooltip,
          trigger: "item",
          formatter: (p) => `${xField}: ${p.value[0]}<br/>${yField}: ${p.value[1]}`,
        },
        grid: { top: titleText ? "16%" : "10%", left: "3%", right: "4%", bottom: "8%", containLabel: true },
        xAxis: {
          type: "value",
          name: xField,
          nameTextStyle: { color: "#94a3b8" },
          axisLine: { lineStyle: { color: "#334155" } },
          axisLabel: { color: "#94a3b8" },
          splitLine: {
            show: showGrid,
            lineStyle: { color: "rgba(148,163,184,0.08)" }
          },
        },
        yAxis: {
          type: "value",
          name: yField,
          nameTextStyle: { color: "#94a3b8" },
          axisLine: { lineStyle: { color: "#334155" } },
          axisLabel: { color: "#94a3b8" },
          splitLine: {
            show: showGrid,
            lineStyle: { color: "rgba(148,163,184,0.08)" }
          },
        },
        legend: {
          show: showLegend,
          textStyle: { color: "#94a3b8" },
          bottom: 0,
          type: "scroll",
        },
        color: colors,
        series: [
          {
            name: `${xField} vs ${yField}`,
            type: "scatter",
            data: scatterData,
            symbolSize: 10,
            itemStyle: { borderColor: "rgba(255,255,255,0.2)", borderWidth: 1 },
            emphasis: { itemStyle: { shadowBlur: 10, shadowColor: "rgba(99,102,241,0.5)" } },
            label: {
              show: showLabels,
              position: "top",
              color: "#94a3b8",
              formatter: (p) => p.value[1],
            },
          },
        ],
      };
    }

    // PIE
    if (chartType === "pie") {
      const catField = xAxis || Object.keys(data[0])[0];
      const valField = metrics[0]?.label || metrics[0]?.field || Object.keys(data[0]).find((k) => k !== catField);
      return {
        backgroundColor: "transparent",
        title: titleOption,
        tooltip: { ...darkTooltip, trigger: "item" },
        legend: {
          show: showLegend,
          textStyle: { color: "#94a3b8" },
          bottom: 0,
          type: "scroll",
        },
        color: colors,
        series: [
          {
            name: catField,
            type: "pie",
            radius: ["38%", "68%"],
            avoidLabelOverlap: false,
            itemStyle: { borderRadius: 8, borderColor: "#0f172a", borderWidth: 2 },
            label: { 
              show: showLabels,
              position: "outside",
              color: "#94a3b8",
              formatter: "{b}: {c}",
            },
            emphasis: { label: { show: true, fontSize: 16, fontWeight: "bold", color: "#fff" } },
            data: data.map((item) => ({ value: item[valField], name: item[catField] })),
          },
        ],
      };
    }

    // BAR / LINE / AREA
    const catField = xAxis || Object.keys(data[0])[0];
    const xAxisData = data.map((item) => item[catField]);
    const isLineOrArea = chartType === "line" || chartType === "area";
    const hasNumericXAxis =
      isLineOrArea &&
      xAxisData.length > 0 &&
      xAxisData.every((value) => value !== null && value !== "" && Number.isFinite(Number(value)));

    const seriesData = metrics.map((m) => {
      const fieldKey = m.label || m.field;
      const rawSeries = data.map((item) => item[fieldKey]);

      let renderedSeriesData = rawSeries;
      if (hasNumericXAxis) {
        const points = data
          .map((item) => [Number(item[catField]), Number(item[fieldKey])])
          .filter((pair) => Number.isFinite(pair[0]) && Number.isFinite(pair[1]));

        // If multiple rows share the same X, reduce to one point per X to avoid vertical strokes.
        const groupedByX = new Map();
        points.forEach(([x, y]) => {
          const bucket = groupedByX.get(x) || [];
          bucket.push(y);
          groupedByX.set(x, bucket);
        });

        const aggregation = String(m.aggregation || "AVG").toUpperCase();
        renderedSeriesData = Array.from(groupedByX.entries())
          .map(([x, ys]) => {
            if (aggregation === "SUM") return [x, ys.reduce((acc, v) => acc + v, 0)];
            if (aggregation === "MIN") return [x, Math.min(...ys)];
            if (aggregation === "MAX") return [x, Math.max(...ys)];
            if (aggregation === "COUNT") return [x, ys.length];
            return [x, ys.reduce((acc, v) => acc + v, 0) / ys.length];
          })
          .sort((a, b) => a[0] - b[0]);
      }

      return {
        name: m.label || (m.field === '*' ? 'COUNT(*)' : m.field),
        type: chartType === "area" ? "line" : chartType,
        data: renderedSeriesData,
        areaStyle: chartType === "area" ? { opacity: 0.3 } : undefined,
        smooth: chartType === "line" || chartType === "area",
        emphasis: { focus: "series" },
        barMaxWidth: 50,
        stack: (stacking && chartType === "bar") ? "total" : undefined,
        label: {
          show: showLabels,
          position: chartType === "bar" && stacking ? "inside" : "top",
          color: chartType === "bar" && stacking ? "#fff" : "#94a3b8",
        },
      };
    });

    return {
      backgroundColor: "transparent",
      title: titleOption,
      tooltip: { ...darkTooltip, trigger: "axis" },
      legend: {
        show: showLegend,
        textStyle: { color: "#94a3b8" },
        bottom: 0,
        type: "scroll",
      },
      grid: {
        top: titleText ? "16%" : "8%",
        left: "3%",
        right: "4%",
        bottom: metrics.length > 1 ? "14%" : "8%",
        containLabel: true,
        show: showGrid,
        borderColor: "rgba(148,163,184,0.06)",
      },
      xAxis: {
        type: hasNumericXAxis ? "value" : "category",
        data: hasNumericXAxis ? undefined : xAxisData,
        name: hasNumericXAxis ? catField : undefined,
        nameTextStyle: hasNumericXAxis ? { color: "#94a3b8" } : undefined,
        axisLine: { lineStyle: { color: "#334155" } },
        axisLabel: { color: "#94a3b8", rotate: xAxisData.length > 12 ? 35 : 0 },
        splitLine: {
          show: showGrid,
          lineStyle: { color: "rgba(148,163,184,0.08)" }
        },
      },
      yAxis: {
        type: "value",
        splitLine: {
          show: showGrid,
          lineStyle: { color: "rgba(148,163,184,0.08)" }
        },
        axisLabel: { color: "#94a3b8" },
      },
      color: colors,
      series: seriesData,
    };
  }, [chartType, data, xAxis, metrics, showLegend, showGrid, showLabels, colorPalette, binSize, stacking]);

  // Get table columns from data
  const tableColumns = data.length > 0 ? Object.keys(data[0]) : [];
  const sampleColumns = sampleData.length > 0 ? Object.keys(sampleData[0]) : [];

  return (
    <div className="chart-panel">
      {/* Alert banner when dirty */}
      {isDirty && (
        <div className="chart-alert-banner">
          <AlertTriangle size={18} className="chart-alert-icon" />
          <div className="chart-alert-content">
            <h4>Your chart is not up to date</h4>
            <p>
              You updated the values in the control panel, but the chart was not
              updated automatically. Run the query by clicking on the "Update
              chart" button or click here.
            </p>
          </div>
        </div>
      )}

      {/* Chart area */}
      <div className="chart-render-area">
        {chartOption ? (
          <div ref={containerRef} style={{ width: "100%", height: "100%" }}>
            <ReactECharts
              ref={echartsRef}
              option={chartOption}
              style={{ height: "100%", width: "100%" }}
              notMerge={true}
              lazyUpdate={true}
              onChartReady={onChartReady}
            />
          </div>
        ) : (
          <div className="chart-empty-state">
            <BarChart2 size={48} />
            <p>
              {data.length === 0
                ? "No data to display. Configure your query and click \"Update chart\"."
                : "Cannot render chart with current configuration."}
            </p>
          </div>
        )}
      </div>

      {/* Bottom tabs: Results | Samples */}
      <div className="chart-bottom-tabs">
        <div className="chart-bottom-tab-bar">
          <button
            className={`chart-bottom-tab ${bottomTab === "results" ? "active" : ""}`}
            onClick={() => setBottomTab("results")}
          >
            Results
          </button>
          <button
            className={`chart-bottom-tab ${bottomTab === "samples" ? "active" : ""}`}
            onClick={() => setBottomTab("samples")}
          >
            Samples
          </button>
        </div>
        <div className="chart-bottom-content">
          {bottomTab === "results" ? (
            <div className="results-table-wrap">
              {data.length > 0 ? (
                <table className="results-table">
                  <thead>
                    <tr>
                      {tableColumns.map((col) => (
                        <th key={col}>{col}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.slice(0, 100).map((row, i) => (
                      <tr key={i}>
                        {tableColumns.map((col) => (
                          <td key={col}>{row[col] != null ? String(row[col]) : ""}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="chart-empty-state" style={{ padding: 20 }}>
                  <p>Run a query to see results</p>
                </div>
              )}
            </div>
          ) : (
            <div className="results-table-wrap">
              {sampleData.length > 0 ? (
                <table className="results-table">
                  <thead>
                    <tr>
                      {sampleColumns.map((col) => (
                        <th key={col}>{col}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sampleData.slice(0, 50).map((row, i) => (
                      <tr key={i}>
                        {sampleColumns.map((col) => (
                          <td key={col}>{row[col] != null ? String(row[col]) : ""}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="chart-empty-state" style={{ padding: 20 }}>
                  <p>Select a dataset to view sample data</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
