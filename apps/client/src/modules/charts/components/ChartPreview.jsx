import React, { useMemo } from "react";
import ReactECharts from "echarts-for-react";

const ChartPreview = ({ type, data = [], dimensions = [], measures = [], style = {}, annotations = [], isPreview = false, binSize = 10, stacking = false, onRenderComplete }) => {
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

    // --- BOX PLOT ---
    if (type === "boxplot") {
      const boxDataList = [];
      const axisData = [];

      measures.forEach((m, idx) => {
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
          return arr[base + 1] !== undefined ? arr[base] + rest * (arr[base + 1] - arr[base]) : arr[base];
        };

        const boxData = [
          rawValues[0],
          getQuartile(rawValues, 0.25),
          getQuartile(rawValues, 0.5),
          getQuartile(rawValues, 0.75),
          rawValues[rawValues.length - 1]
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
        tooltip: isPreview ? { show: false } : { ...darkTooltip, trigger: "item" },
        grid: isPreview ? { top: '5%', left: '5%', right: '5%', bottom: '5%' } : { top: "10%", left: "10%", right: "10%", bottom: "15%", containLabel: true },
        xAxis: {
          show: !isPreview,
          type: "category",
          data: axisData,
          axisLine: { lineStyle: { color: "#334155" } },
          axisLabel: { color: "#94a3b8", rotate: axisData.length > 5 ? 30 : 0 }
        },
        yAxis: {
          show: !isPreview,
          type: "value",
          splitLine: { lineStyle: { color: "rgba(148, 163, 184, 0.1)" } },
          axisLabel: { color: "#94a3b8" }
        },
        color: colors,
        legend: { show: false }, // Hide legend for box plot as per design
        series: [{
          name: "BoxPlot",
          type: "boxplot",
          data: boxDataList,
          label: {
            show: style.showLabels === true,
            position: "top",
            color: "#94a3b8",
          },
        }]
      };
    }

    // --- HISTOGRAM ---
    if (type === "histogram") {
      const validMetrics = measures.filter((m) => m.field);
      if (validMetrics.length === 0) return null;

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

      const binLabels = new Array(binCount).fill(0).map((_, i) =>
        isPreview ? "" : `${start + i * actualBinSize} - ${start + (i + 1) * actualBinSize}`
      );

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
            show: style.showLabels === true,
            position: "top",
            color: "#94a3b8",
          },
        };
      });

      return {
        backgroundColor: "transparent",
        tooltip: isPreview ? { show: false } : { ...darkTooltip, trigger: "axis" },
        grid: isPreview ? { top: '5%', left: '5%', right: '5%', bottom: '15%' } : { top: "10%", left: "10%", right: "10%", bottom: "15%", containLabel: true },
        xAxis: {
          show: !isPreview,
          type: "category",
          data: binLabels,
          axisLine: { lineStyle: { color: "#334155" } },
          axisLabel: { color: "#94a3b8", rotate: binLabels.length > 8 ? 35 : 0 }
        },
        yAxis: {
          show: !isPreview,
          type: "value",
          splitLine: { lineStyle: { color: "rgba(148, 163, 184, 0.1)" } },
          axisLabel: { color: "#94a3b8" }
        },
        color: colors,
        legend: { show: isPreview ? false : (style.showLegend !== false), textStyle: { color: "#94a3b8" }, bottom: 0 },
        series
      };
    }

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
        tooltip: isPreview ? { show: false } : {
          ...darkTooltip,
          trigger: "item",
          formatter: (p) => `${xField}: ${p.value[0]}<br/>${yField}: ${p.value[1]}`
        },
        grid: isPreview ? { top: 0, left: 0, right: 0, bottom: 0 } : { top: "12%", left: "3%", right: "4%", bottom: "12%", containLabel: true },
        xAxis: {
          show: !isPreview,
          type: "value",
          name: xField,
          nameTextStyle: { color: "#94a3b8" },
          axisLine: { lineStyle: { color: "#334155" } },
          axisLabel: { color: "#94a3b8" },
          splitLine: { lineStyle: { color: "rgba(148, 163, 184, 0.1)" } }
        },
        yAxis: {
          show: !isPreview,
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
          emphasis: { itemStyle: { shadowBlur: 10, shadowColor: "rgba(99, 102, 241, 0.5)" } },
          label: {
            show: style.showLabels === true,
            position: "top",
            color: "#94a3b8",
            formatter: (p) => p.value[1],
          },
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
        tooltip: isPreview ? { show: false } : { ...darkTooltip, trigger: "item" },
        legend: { show: isPreview ? false : style.showLegend !== false, textStyle: { color: "#94a3b8" }, bottom: 0 },
        color: colors,
        series: [{
          name: xAxisField,
          type: "pie",
          radius: ["40%", "70%"],
          avoidLabelOverlap: false,
          itemStyle: { borderRadius: 10, borderColor: "#0f172a", borderWidth: 2 },
          label: { 
            show: style.showLabels === true,
            position: "outside",
            color: "#94a3b8",
            formatter: "{b}: {c}",
          },
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
        emphasis: { focus: "series" },
        stack: (stacking && type === "bar") ? "total" : undefined,
        label: {
          show: style.showLabels === true,
          position: type === "bar" && stacking ? "inside" : "top",
          color: type === "bar" && stacking ? "#fff" : "#94a3b8",
        },
      };
    });

    const baseOption = {
      backgroundColor: "transparent",
      tooltip: isPreview ? { show: false } : { ...darkTooltip, trigger: "axis" },
      legend: { show: isPreview ? false : style.showLegend !== false, textStyle: { color: "#94a3b8" }, bottom: 0 },
      grid: isPreview ? { top: '5%', left: '5%', right: '5%', bottom: '5%' } : {
        top: "10%", left: "3%", right: "4%", bottom: "15%",
        containLabel: true,
        show: style.showGrid !== false,
        borderColor: "rgba(148, 163, 184, 0.1)"
      },
      xAxis: {
        show: !isPreview,
        type: hasNumericXAxis ? "value" : "category",
        data: hasNumericXAxis ? undefined : xAxisData,
        name: hasNumericXAxis ? xAxisField : undefined,
        nameTextStyle: hasNumericXAxis ? { color: "#94a3b8" } : undefined,
        axisLine: { lineStyle: { color: "#334155" } },
        axisLabel: { color: "#94a3b8" },
        splitLine: { show: false }
      },
      yAxis: {
        show: !isPreview,
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
  }, [type, data, dimensions, measures, style, annotations, stacking]);

  return (
    <div className="chart-preview-wrapper" style={{ height: "100%", width: "100%", minHeight: isPreview ? "0px" : (style?.minHeight !== undefined ? style.minHeight : "400px") }}>
      <ReactECharts
        option={option}
        style={{ height: "100%", width: "100%" }}
        notMerge={true}
        lazyUpdate={true}
        onEvents={{
          'finished': () => {
            if (onRenderComplete) onRenderComplete();
          }
        }}
      />
    </div>
  );
};

export default ChartPreview;
