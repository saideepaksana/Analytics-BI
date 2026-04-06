import React, { useMemo } from "react";
import ReactECharts from "echarts-for-react";

const ChartPreview = ({ type, data = [], dimensions = [], measures = [], style = {} }) => {
  const option = useMemo(() => {
    if (!data || data.length === 0) {
      return {
        title: {
          text: "No data available for the current selection",
          left: "center",
          top: "center",
          textStyle: { color: "#94a3b8" }
        }
      };
    }

    const colors = style.colorPalette || ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"];
    const getMeasureKey = (m = {}) => m.label || (m.field === "*" ? "COUNT(*)" : m.field);
    const darkTooltip = {
      backgroundColor: "rgba(15, 23, 42, 0.9)",
      borderColor: "#1e293b",
      textStyle: { color: "#f8fafc" }
    };

    // --- SCATTER PLOT ---
    if (type === "scatter") {
      const xField = measures[0]?.field;
      const yField = measures[1]?.field;
      if (!xField || !yField) {
        return {
          title: { text: "Scatter requires 2 measures", left: "center", top: "center", textStyle: { color: "#94a3b8" } }
        };
      }
      const scatterData = data
        .map(item => [Number(item[xField]), Number(item[yField])])
        .filter(pair => !isNaN(pair[0]) && !isNaN(pair[1]));

      return {
        backgroundColor: "transparent",
        tooltip: {
          ...darkTooltip,
          trigger: "item",
          formatter: (p) => `${xField}: ${p.value[0]}<br/>${yField}: ${p.value[1]}`
        },
        grid: { top: "12%", left: "3%", right: "4%", bottom: "12%", containLabel: true },
        xAxis: {
          type: "value",
          name: xField,
          nameTextStyle: { color: "#94a3b8" },
          axisLine: { lineStyle: { color: "#334155" } },
          axisLabel: { color: "#94a3b8" },
          splitLine: { lineStyle: { color: "rgba(148, 163, 184, 0.1)" } }
        },
        yAxis: {
          type: "value",
          name: yField,
          nameTextStyle: { color: "#94a3b8" },
          axisLine: { lineStyle: { color: "#334155" } },
          axisLabel: { color: "#94a3b8" },
          splitLine: { lineStyle: { color: "rgba(148, 163, 184, 0.1)" } }
        },
        color: colors,
        series: [{
          type: "scatter",
          data: scatterData,
          symbolSize: 10,
          itemStyle: { borderColor: "rgba(255,255,255,0.2)", borderWidth: 1 },
          emphasis: { itemStyle: { shadowBlur: 10, shadowColor: "rgba(99, 102, 241, 0.5)" } }
        }]
      };
    }

    // --- PIE CHART ---
    if (type === "pie") {
      const xAxisField = dimensions[0] || Object.keys(data[0])[0];
      const yAxisField = getMeasureKey(measures[0]) || Object.keys(data[0]).find(k => k !== xAxisField);
      return {
        backgroundColor: "transparent",
        tooltip: { ...darkTooltip, trigger: "item" },
        legend: { show: style.showLegend !== false, textStyle: { color: "#94a3b8" }, bottom: 0 },
        color: colors,
        series: [{
          name: xAxisField,
          type: "pie",
          radius: ["40%", "70%"],
          avoidLabelOverlap: false,
          itemStyle: { borderRadius: 10, borderColor: "#0f172a", borderWidth: 2 },
          label: { show: false, position: "center" },
          emphasis: { label: { show: true, fontSize: 20, fontWeight: "bold", color: "#fff" } },
          data: data.map(item => ({ value: item[yAxisField], name: item[xAxisField] }))
        }]
      };
    }

    // --- BAR / LINE / AREA ---
    const xAxisField = dimensions[0] || Object.keys(data[0])[0];
    const xAxisData = data.map(item => item[xAxisField]);
    const seriesData = measures.map(m => ({
      name: m.label || m.field,
      type: type === "area" ? "line" : type,
      data: data.map(item => item[getMeasureKey(m)]),
      areaStyle: type === "area" ? {} : undefined,
      smooth: true,
      emphasis: { focus: "series" }
    }));

    return {
      backgroundColor: "transparent",
      tooltip: { ...darkTooltip, trigger: "axis" },
      legend: { show: style.showLegend !== false, textStyle: { color: "#94a3b8" }, bottom: 0 },
      grid: {
        top: "10%", left: "3%", right: "4%", bottom: "15%",
        containLabel: true,
        show: style.showGrid !== false,
        borderColor: "rgba(148, 163, 184, 0.1)"
      },
      xAxis: {
        type: "category",
        data: xAxisData,
        axisLine: { lineStyle: { color: "#334155" } },
        axisLabel: { color: "#94a3b8" }
      },
      yAxis: {
        type: "value",
        splitLine: { lineStyle: { color: "rgba(148, 163, 184, 0.1)" } },
        axisLabel: { color: "#94a3b8" }
      },
      color: colors,
      series: seriesData
    };
  }, [type, data, dimensions, measures, style]);

  return (
    <div className="chart-preview-wrapper" style={{ height: "400px", width: "100%" }}>
      <ReactECharts
        option={option}
        style={{ height: "100%", width: "100%" }}
        notMerge={true}
        lazyUpdate={true}
      />
    </div>
  );
};

export default ChartPreview;
