import React, { useMemo } from "react";
import ReactECharts from "echarts-for-react";

const ChartPreview = ({ type, data = [], dimensions = [], measures = [], style = {}, annotations = [] }) => {
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

      const baseScatter = {
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

      if (annotations && annotations.length > 0) {
        baseScatter.graphic = annotations.map(a => ({
          type: 'circle',
          left: `${a.x}%`,
          top: `${a.y}%`,
          shape: { r: 5 },
          style: { fill: '#f59e0b', stroke: '#fff', lineWidth: 1.5 },
          tooltip: { content: a.text }
        }));
      }
      return baseScatter;
    }

    // --- PIE CHART ---
    if (type === "pie") {
      const xAxisField = dimensions[0] || Object.keys(data[0])[0];
      const yAxisField = getMeasureKey(measures[0]) || Object.keys(data[0]).find(k => k !== xAxisField);
      const basePie = {
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

      if (annotations && annotations.length > 0) {
        basePie.graphic = annotations.map(a => ({
          type: 'circle',
          left: `${a.x}%`,
          top: `${a.y}%`,
          shape: { r: 5 },
          style: { fill: '#f59e0b', stroke: '#fff', lineWidth: 1.5 },
          tooltip: { content: a.text }
        }));
      }
      return basePie;
    }

    // --- BAR / LINE / AREA ---
    const xAxisField = dimensions[0] || Object.keys(data[0])[0];
    const xAxisData = data.map(item => item[xAxisField]);
    const isLineOrArea = type === "line" || type === "area";
    const hasNumericXAxis =
      isLineOrArea &&
      xAxisData.length > 0 &&
      xAxisData.every((value) => value !== null && value !== "" && Number.isFinite(Number(value)));

    const seriesData = measures.map((m) => {
      let renderedSeriesData = data.map(item => item[getMeasureKey(m)]);

      if (hasNumericXAxis) {
        const points = data
          .map((item) => [Number(item[xAxisField]), Number(item[getMeasureKey(m)])])
          .filter((pair) => Number.isFinite(pair[0]) && Number.isFinite(pair[1]));

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
        name: m.label || m.field,
        type: type === "area" ? "line" : type,
        data: renderedSeriesData,
        areaStyle: type === "area" ? {} : undefined,
        smooth: true,
        emphasis: { focus: "series" }
      };
    });

    const baseOption = {
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
        type: hasNumericXAxis ? "value" : "category",
        data: hasNumericXAxis ? undefined : xAxisData,
        name: hasNumericXAxis ? xAxisField : undefined,
        nameTextStyle: hasNumericXAxis ? { color: "#94a3b8" } : undefined,
        axisLine: { lineStyle: { color: "#334155" } },
        axisLabel: { color: "#94a3b8" },
        splitLine: { show: false }
      },
      yAxis: {
        type: "value",
        splitLine: { lineStyle: { color: "rgba(148, 163, 184, 0.1)" } },
        axisLabel: { color: "#94a3b8" }
      },
      color: colors,
      series: seriesData
    };

    if (annotations && annotations.length > 0) {
      baseOption.graphic = annotations.map(a => ({
        type: 'circle',
        left: `${a.x}%`,
        top: `${a.y}%`,
        shape: { r: 5 },
        style: { fill: '#f59e0b', stroke: '#fff', lineWidth: 1.5 },
        tooltip: { content: a.text }
      }));
    }
    return baseOption;
  }, [type, data, dimensions, measures, style, annotations]);

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
