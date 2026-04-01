/**
 * Converts wizard state into a valid ECharts option object.
 * Supports: bar, line, pie, scatter, area, radar, gauge, bar3d
 */

const COLOR_PALETTES = {
  vibrant: ['#06b6d4', '#8b5cf6', '#ec4899', '#f59e0b', '#22c55e', '#ef4444', '#3b82f6', '#f97316'],
  ocean: ['#0ea5e9', '#06b6d4', '#14b8a6', '#10b981', '#34d399', '#6ee7b7', '#2dd4bf', '#67e8f9'],
  sunset: ['#f43f5e', '#f97316', '#f59e0b', '#eab308', '#ec4899', '#d946ef', '#a855f7', '#8b5cf6'],
  forest: ['#22c55e', '#16a34a', '#15803d', '#14b8a6', '#0d9488', '#059669', '#10b981', '#34d399'],
  neon: ['#a855f7', '#ec4899', '#06b6d4', '#22c55e', '#f59e0b', '#ef4444', '#3b82f6', '#8b5cf6'],
  monochrome: ['#fafafa', '#d4d4d8', '#a1a1aa', '#71717a', '#52525b', '#3f3f46', '#27272a', '#18181b'],
};

export { COLOR_PALETTES };

/**
 * Extract unique category values from data rows for a given column
 */
function extractCategories(data, dimensionKey) {
  const seen = new Set();
  return data
    .map(row => row[dimensionKey])
    .filter(v => {
      if (v == null || seen.has(String(v))) return false;
      seen.add(String(v));
      return true;
    })
    .map(String);
}

/**
 * Aggregate measure values by dimension categories
 */
function aggregateData(data, dimensionKey, measureKeys) {
  const catMap = new Map();
  for (const row of data) {
    const cat = String(row[dimensionKey] ?? 'Unknown');
    if (!catMap.has(cat)) {
      catMap.set(cat, {});
      for (const mk of measureKeys) catMap.get(cat)[mk] = 0;
    }
    const bucket = catMap.get(cat);
    for (const mk of measureKeys) {
      const val = parseFloat(row[mk]);
      if (!isNaN(val)) bucket[mk] += val;
    }
  }
  return catMap;
}

/**
 * Build ECharts option from wizard state
 */
export function buildChartOption({
  chartType,
  dimensions = [],
  measures = [],
  data = [],
  customization = {},
}) {
  const {
    title = '',
    palette = 'vibrant',
    showLegend = true,
    legendPosition = 'top',
    showAxisLabels = true,
    showGridLines = true,
  } = customization;

  const colors = COLOR_PALETTES[palette] || COLOR_PALETTES.vibrant;
  const dimKey = dimensions[0];
  const measureKeys = measures;

  if (!dimKey || measureKeys.length === 0 || data.length === 0) {
    return { title: { text: title || 'No Data', left: 'center' }, series: [] };
  }

  const catMap = aggregateData(data, dimKey, measureKeys);
  const categories = [...catMap.keys()];

  const baseOption = {
    color: colors,
    backgroundColor: 'transparent',
    title: title
      ? {
          text: title,
          left: 'center',
          top: 8,
          textStyle: {
            fontSize: 16,
            fontWeight: 700,
            fontFamily: 'Inter, sans-serif',
            color: '#fafafa',
          },
        }
      : undefined,
    tooltip: { trigger: 'axis', backgroundColor: 'rgba(24,24,27,0.95)', borderColor: 'rgba(255,255,255,0.08)', textStyle: { color: '#fafafa', fontSize: 12 } },
    legend: showLegend
      ? {
          show: true,
          [legendPosition === 'top' || legendPosition === 'bottom' ? 'top' : 'left']:
            legendPosition === 'bottom' ? 'bottom' : legendPosition === 'right' ? 'right' : legendPosition === 'left' ? 'left' : 6,
          ...(legendPosition === 'top' ? { top: title ? 36 : 6 } : {}),
          ...(legendPosition === 'bottom' ? { bottom: 6 } : {}),
          textStyle: { color: '#a1a1aa', fontSize: 12 },
        }
      : { show: false },
    grid: {
      left: 60,
      right: 30,
      top: (title ? 56 : 20) + (showLegend && legendPosition === 'top' ? 30 : 0),
      bottom: 40 + (showLegend && legendPosition === 'bottom' ? 30 : 0),
      containLabel: false,
    },
    animationDuration: 800,
    animationEasing: 'cubicOut',
  };

  // ── BAR / LINE / AREA ──
  if (['bar', 'line', 'area'].includes(chartType)) {
    const xAxis = {
      type: 'category',
      data: categories,
      axisLabel: { show: showAxisLabels, color: '#71717a', fontSize: 11, rotate: categories.length > 10 ? 30 : 0 },
      axisLine: { lineStyle: { color: 'rgba(255,255,255,0.08)' } },
      splitLine: { show: false },
    };
    const yAxis = {
      type: 'value',
      axisLabel: { show: showAxisLabels, color: '#71717a', fontSize: 11 },
      axisLine: { lineStyle: { color: 'rgba(255,255,255,0.08)' } },
      splitLine: { show: showGridLines, lineStyle: { color: 'rgba(255,255,255,0.04)' } },
    };

    const series = measureKeys.map((mk, i) => ({
      name: mk,
      type: chartType === 'area' ? 'line' : chartType,
      data: categories.map(cat => catMap.get(cat)?.[mk] ?? 0),
      ...(chartType === 'area' ? { areaStyle: { opacity: 0.15 } } : {}),
      ...(chartType === 'bar' ? { barMaxWidth: 40, itemStyle: { borderRadius: [4, 4, 0, 0] } } : {}),
      smooth: chartType === 'line' || chartType === 'area',
      emphasis: { focus: 'series' },
    }));

    return { ...baseOption, xAxis, yAxis, series };
  }

  // ── PIE ──
  if (chartType === 'pie') {
    const mk = measureKeys[0];
    const pieData = categories.map(cat => ({ name: cat, value: catMap.get(cat)?.[mk] ?? 0 }));
    return {
      ...baseOption,
      tooltip: { trigger: 'item', backgroundColor: 'rgba(24,24,27,0.95)', borderColor: 'rgba(255,255,255,0.08)', textStyle: { color: '#fafafa' } },
      series: [
        {
          type: 'pie',
          radius: ['35%', '65%'],
          center: ['50%', '55%'],
          data: pieData,
          label: { color: '#a1a1aa', fontSize: 12 },
          emphasis: {
            itemStyle: { shadowBlur: 20, shadowOffsetX: 0, shadowColor: 'rgba(0,0,0,0.3)' },
          },
          itemStyle: { borderRadius: 6, borderColor: 'rgba(24,24,27,1)', borderWidth: 2 },
        },
      ],
    };
  }

  // ── SCATTER ──
  if (chartType === 'scatter') {
    const mk = measureKeys[0];
    const mk2 = measureKeys[1] || mk;
    const scatterData = data.map(row => [parseFloat(row[mk]) || 0, parseFloat(row[mk2]) || 0]);
    return {
      ...baseOption,
      xAxis: {
        type: 'value',
        name: mk,
        axisLabel: { show: showAxisLabels, color: '#71717a', fontSize: 11 },
        axisLine: { lineStyle: { color: 'rgba(255,255,255,0.08)' } },
        splitLine: { show: showGridLines, lineStyle: { color: 'rgba(255,255,255,0.04)' } },
      },
      yAxis: {
        type: 'value',
        name: mk2,
        axisLabel: { show: showAxisLabels, color: '#71717a', fontSize: 11 },
        axisLine: { lineStyle: { color: 'rgba(255,255,255,0.08)' } },
        splitLine: { show: showGridLines, lineStyle: { color: 'rgba(255,255,255,0.04)' } },
      },
      series: [
        {
          type: 'scatter',
          data: scatterData,
          symbolSize: 10,
          emphasis: { focus: 'self', itemStyle: { shadowBlur: 10, shadowColor: 'rgba(6,182,212,0.5)' } },
        },
      ],
    };
  }

  // ── RADAR ──
  if (chartType === 'radar') {
    const indicators = measureKeys.map(mk => {
      const max = Math.max(...categories.map(cat => catMap.get(cat)?.[mk] ?? 0), 1);
      return { name: mk, max: max * 1.2 };
    });
    const radarSeries = categories.slice(0, 6).map(cat => ({
      name: cat,
      value: measureKeys.map(mk => catMap.get(cat)?.[mk] ?? 0),
    }));

    return {
      ...baseOption,
      tooltip: { trigger: 'item' },
      radar: {
        indicator: indicators,
        shape: 'polygon',
        axisName: { color: '#a1a1aa', fontSize: 11 },
        splitArea: { areaStyle: { color: ['rgba(255,255,255,0.02)', 'rgba(255,255,255,0.04)'] } },
        splitLine: { lineStyle: { color: 'rgba(255,255,255,0.06)' } },
        axisLine: { lineStyle: { color: 'rgba(255,255,255,0.08)' } },
      },
      series: [
        {
          type: 'radar',
          data: radarSeries,
          areaStyle: { opacity: 0.1 },
          lineStyle: { width: 2 },
          emphasis: { lineStyle: { width: 3 } },
        },
      ],
    };
  }

  // ── GAUGE ──
  if (chartType === 'gauge') {
    const mk = measureKeys[0];
    const total = categories.reduce((s, cat) => s + (catMap.get(cat)?.[mk] ?? 0), 0);
    const avg = categories.length > 0 ? total / categories.length : 0;
    return {
      ...baseOption,
      series: [
        {
          type: 'gauge',
          startAngle: 200,
          endAngle: -20,
          min: 0,
          max: Math.max(total, 100),
          progress: { show: true, width: 14, itemStyle: { color: colors[0] } },
          pointer: { show: true, length: '60%', width: 4, itemStyle: { color: colors[0] } },
          axisLine: { lineStyle: { width: 14, color: [[1, 'rgba(255,255,255,0.06)']] } },
          axisTick: { show: false },
          splitLine: { show: false },
          axisLabel: { color: '#71717a', fontSize: 11, distance: 20 },
          detail: {
            valueAnimation: true,
            fontSize: 28,
            fontWeight: 700,
            color: '#fafafa',
            offsetCenter: [0, '40%'],
            formatter: v => Math.round(v).toLocaleString(),
          },
          title: { offsetCenter: [0, '65%'], color: '#71717a', fontSize: 13 },
          data: [{ value: Math.round(avg), name: mk }],
        },
      ],
    };
  }

  // ── 3D BAR (fallback to standard bar with 3D-like styling) ──
  if (chartType === 'bar3d') {
    const xAxis = {
      type: 'category',
      data: categories,
      axisLabel: { show: showAxisLabels, color: '#71717a', fontSize: 11, rotate: categories.length > 10 ? 30 : 0 },
      axisLine: { lineStyle: { color: 'rgba(255,255,255,0.08)' } },
    };
    const yAxis = {
      type: 'value',
      axisLabel: { show: showAxisLabels, color: '#71717a', fontSize: 11 },
      axisLine: { lineStyle: { color: 'rgba(255,255,255,0.08)' } },
      splitLine: { show: showGridLines, lineStyle: { color: 'rgba(255,255,255,0.04)' } },
    };

    const series = measureKeys.map((mk, i) => ({
      name: mk,
      type: 'bar',
      data: categories.map(cat => catMap.get(cat)?.[mk] ?? 0),
      barMaxWidth: 36,
      itemStyle: {
        borderRadius: [6, 6, 0, 0],
        color: {
          type: 'linear',
          x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [
            { offset: 0, color: colors[i % colors.length] },
            { offset: 1, color: colors[(i + 1) % colors.length] + '88' },
          ],
        },
        shadowBlur: 12,
        shadowColor: colors[i % colors.length] + '40',
        shadowOffsetY: 4,
      },
      emphasis: { focus: 'series' },
    }));

    return { ...baseOption, xAxis, yAxis, series };
  }

  // Fallback
  return baseOption;
}

/**
 * Filter data rows based on global filters
 */
export function applyGlobalFilters(data, filters, columns) {
  if (!filters || Object.keys(filters).length === 0) return data;

  return data.filter(row => {
    // Date range filter
    if (filters.dateColumn && filters.startDate && filters.endDate) {
      const val = row[filters.dateColumn];
      if (val) {
        const d = new Date(val);
        if (!isNaN(d.getTime())) {
          const start = new Date(filters.startDate);
          const end = new Date(filters.endDate);
          end.setHours(23, 59, 59, 999);
          if (d < start || d > end) return false;
        }
      }
    }

    // Category filter
    if (filters.categoryColumn && filters.categoryValue) {
      const val = String(row[filters.categoryColumn] ?? '').toLowerCase();
      if (!val.includes(filters.categoryValue.toLowerCase())) return false;
    }

    return true;
  });
}
