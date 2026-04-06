import React, { useState, useMemo } from "react";
import {
  Table2, AlertTriangle, BarChart2
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
  rowCount = 0,
  executionTimeMs = 0,
  isDirty = false,
  onUpdateChart,
  sampleData = [],
}) {
  const [bottomTab, setBottomTab] = useState("results");

  // Format execution time
  const formatTime = (ms) => {
    if (ms < 1000) return `0h:0(${(ms / 1000).toFixed(2)}s)`;
    const secs = (ms / 1000).toFixed(1);
    return `0h:0(${secs}s)`;
  };

  // Build ECharts option
  const chartOption = useMemo(() => {
    if (!data || data.length === 0 || chartType === "table") {
      return null;
    }

    const colors = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4"];
    const darkTooltip = {
      backgroundColor: "rgba(15, 23, 42, 0.95)",
      borderColor: "#1e293b",
      textStyle: { color: "#f8fafc", fontSize: 12 },
    };

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
        tooltip: {
          ...darkTooltip,
          trigger: "item",
          formatter: (p) => `${xField}: ${p.value[0]}<br/>${yField}: ${p.value[1]}`,
        },
        grid: { top: "10%", left: "3%", right: "4%", bottom: "8%", containLabel: true },
        xAxis: {
          type: "value",
          name: xField,
          nameTextStyle: { color: "#94a3b8" },
          axisLine: { lineStyle: { color: "#334155" } },
          axisLabel: { color: "#94a3b8" },
          splitLine: { lineStyle: { color: "rgba(148,163,184,0.08)" } },
        },
        yAxis: {
          type: "value",
          name: yField,
          nameTextStyle: { color: "#94a3b8" },
          axisLine: { lineStyle: { color: "#334155" } },
          axisLabel: { color: "#94a3b8" },
          splitLine: { lineStyle: { color: "rgba(148,163,184,0.08)" } },
        },
        color: colors,
        series: [
          {
            type: "scatter",
            data: scatterData,
            symbolSize: 10,
            itemStyle: { borderColor: "rgba(255,255,255,0.2)", borderWidth: 1 },
            emphasis: { itemStyle: { shadowBlur: 10, shadowColor: "rgba(99,102,241,0.5)" } },
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
            label: { show: false },
            emphasis: { label: { show: true, fontSize: 16, fontWeight: "bold", color: "#fff" } },
            data: data.map((item) => ({ value: item[valField], name: item[catField] })),
          },
        ],
      };
    }

    // BAR / LINE / AREA
    const catField = xAxis || Object.keys(data[0])[0];
    const xAxisData = data.map((item) => item[catField]);

    const seriesData = metrics.map((m) => {
      const fieldKey = m.label || m.field;
      return {
        name: fieldKey,
        type: chartType === "area" ? "line" : chartType,
        data: data.map((item) => item[fieldKey]),
        areaStyle: chartType === "area" ? { opacity: 0.3 } : undefined,
        smooth: chartType === "line" || chartType === "area",
        emphasis: { focus: "series" },
        barMaxWidth: 50,
      };
    });

    return {
      backgroundColor: "transparent",
      tooltip: { ...darkTooltip, trigger: "axis" },
      legend: {
        show: showLegend && metrics.length > 1,
        textStyle: { color: "#94a3b8" },
        bottom: 0,
        type: "scroll",
      },
      grid: {
        top: "8%",
        left: "3%",
        right: "4%",
        bottom: metrics.length > 1 ? "14%" : "8%",
        containLabel: true,
        show: showGrid,
        borderColor: "rgba(148,163,184,0.06)",
      },
      xAxis: {
        type: "category",
        data: xAxisData,
        axisLine: { lineStyle: { color: "#334155" } },
        axisLabel: { color: "#94a3b8", rotate: xAxisData.length > 12 ? 35 : 0 },
      },
      yAxis: {
        type: "value",
        splitLine: { lineStyle: { color: "rgba(148,163,184,0.08)" } },
        axisLabel: { color: "#94a3b8" },
      },
      color: colors,
      series: seriesData,
    };
  }, [chartType, data, xAxis, metrics, showLegend, showGrid]);

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
        {chartType === "table" ? (
          <div className="results-table-wrap" style={{ width: "100%", height: "100%" }}>
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
                  {data.map((row, i) => (
                    <tr key={i}>
                      {tableColumns.map((col) => (
                        <td key={col}>{row[col] != null ? String(row[col]) : ""}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="chart-empty-state">
                <Table2 size={48} />
                <p>No data to display. Configure your query and click "Update chart".</p>
              </div>
            )}
          </div>
        ) : chartOption ? (
          <ReactECharts
            option={chartOption}
            style={{ height: "100%", width: "100%" }}
            notMerge={true}
            lazyUpdate={true}
          />
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
