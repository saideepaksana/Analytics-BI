const crypto = require("crypto");

/**
 * Maps frontend chart configuration to DB Chart schema
 */
exports.toDB = (frontendConfig) => {
  const chartId = frontendConfig.chartId || crypto.randomUUID();
  const name = frontendConfig.name || frontendConfig.title || "Untitled Chart";
  
  const datasetId = frontendConfig.datasetId || frontendConfig.dataSource?.datasetId || "";

  // Handle flat x and y mapping into dimensions and measures, and visualization axes
  const dimensions = [];
  const measures = [];
  
  let xAxis = "";
  let yAxis = "";

  if (frontendConfig.x) {
    const xObj = typeof frontendConfig.x === "object" ? frontendConfig.x : null;
    xAxis = xObj?.field || frontendConfig.x;
    dimensions.push({
      field: xAxis,
      type: xObj?.type || "categorical",
      ...(xObj?.label !== undefined ? { label: xObj.label } : {}),
      ...(xObj?.format !== undefined ? { format: xObj.format } : {}),
      ...(xObj?.meta !== undefined ? { meta: xObj.meta } : {}),
    });
  }

  if (frontendConfig.y) {
    const yObj = typeof frontendConfig.y === "object" ? frontendConfig.y : null;
    yAxis = yObj?.field || frontendConfig.y;
    measures.push({
      field: yAxis,
      aggregation: yObj?.aggregation || "sum",
      ...(yObj?.label !== undefined ? { label: yObj.label } : {}),
      ...(yObj?.format !== undefined ? { format: yObj.format } : {}),
      ...(yObj?.meta !== undefined ? { meta: yObj.meta } : {}),
    });
  }

  // Allow fallback to already-nested structures if frontend is using native DB schema
  const query = frontendConfig.query || {};
  const viz = frontendConfig.visualization || {};
  const style = frontendConfig.style || {};

  return {
    chartId,
    name,
    dataSource: {
      datasetId,
      table: frontendConfig.table || frontendConfig.dataSource?.table || ""
    },
    query: {
      dimensions: dimensions.length > 0 ? dimensions : (query.dimensions || []),
      measures: measures.length > 0 ? measures : (query.measures || []),
      filters: frontendConfig.filters || query.filters || [],
      groupBy: frontendConfig.groupBy || query.groupBy || [],
      orderBy: frontendConfig.orderBy || query.orderBy || []
    },
    visualization: {
      type: frontendConfig.type || viz.type || "bar",
      xAxis: xAxis || viz.xAxis || "",
      yAxis: yAxis || viz.yAxis || "",
      series: { ...(frontendConfig.series || viz.series), _rawFrontendState: frontendConfig }
    },
    style: {
      colorPalette: frontendConfig.colorPalette || style.colorPalette || ["#5470C6"],
      showLegend: frontendConfig.showLegend !== undefined ? frontendConfig.showLegend : (style.showLegend !== false),
      showGrid: frontendConfig.showGrid !== undefined ? frontendConfig.showGrid : (style.showGrid !== false)
    },
    state: {
      validation: frontendConfig.state?.validation || "valid"
    }
  };
};

/**
 * Maps DB Chart schema back to frontend configuration
 */
exports.fromDB = (dbConfig) => {
  if (!dbConfig) return null;

  const rawState = dbConfig.visualization?.series?._rawFrontendState;

  if (rawState) {
    // Fully lossless restoral, preserving everything (labels, aggregations, custom UI config)
    return {
      ...rawState,
      _id: dbConfig._id ? dbConfig._id.toString() : undefined,
      chartId: dbConfig.chartId,
      updatedAt: dbConfig.updatedAt,
      createdAt: dbConfig.createdAt,
    };
  }

  // Fallback mapping for older charts lacking `_rawFrontendState`
  const type = dbConfig.visualization?.type || "bar";
  const xAxisField = dbConfig.visualization?.xAxis || "";
  const yAxisField = dbConfig.visualization?.yAxis || "";

  // Attempt to find dimension/measure details for x/y
  const xDim = dbConfig.query?.dimensions?.find(d => d.field === xAxisField) || { field: xAxisField, type: "categorical" };
  const yMeas = dbConfig.query?.measures?.find(m => m.field === yAxisField) || { field: yAxisField, aggregation: "sum" };

  return {
    _id: dbConfig._id ? dbConfig._id.toString() : undefined,
    chartId: dbConfig.chartId,
    name: dbConfig.name,
    title: dbConfig.name,
    datasetId: dbConfig.dataSource?.datasetId || "",
    table: dbConfig.dataSource?.table || "",
    type,
    x: {
      field: xDim.field,
      type: xDim.type,
      ...(xDim.label !== undefined ? { label: xDim.label } : {}),
      ...(xDim.format !== undefined ? { format: xDim.format } : {}),
      ...(xDim.meta !== undefined ? { meta: xDim.meta } : {}),
    },
    y: {
      field: yMeas.field,
      aggregation: yMeas.aggregation,
      ...(yMeas.label !== undefined ? { label: yMeas.label } : {}),
      ...(yMeas.format !== undefined ? { format: yMeas.format } : {}),
      ...(yMeas.meta !== undefined ? { meta: yMeas.meta } : {}),
    },
    filters: dbConfig.query?.filters || [],
    groupBy: dbConfig.query?.groupBy || [],
    orderBy: dbConfig.query?.orderBy || [],
    colorPalette: dbConfig.style?.colorPalette || [],
    showLegend: dbConfig.style?.showLegend,
    showGrid: dbConfig.style?.showGrid,
    series: dbConfig.visualization?.series || {},
    query: dbConfig.query || {},
    visualization: dbConfig.visualization || {},
    style: dbConfig.style || {},
    state: dbConfig.state || {},
    createdAt: dbConfig.createdAt,
    updatedAt: dbConfig.updatedAt,
  };
};
