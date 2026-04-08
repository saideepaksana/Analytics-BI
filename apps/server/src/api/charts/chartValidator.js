const Metadata = require("../../models/Metadata");

class ChartValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "ChartValidationError";
  }
}

/**
 * Validates the chart semantics before saving.
 * Ensures rules like "bar requires categorical X, numeric Y" hold true.
 */
exports.validateChart = async (frontendConfig) => {
  const type = frontendConfig.type || frontendConfig.visualization?.type;
  if (!type) {
    throw new ChartValidationError("Chart type is required.");
  }

  const datasetId = frontendConfig.datasetId || frontendConfig.dataSource?.datasetId;
  if (!datasetId) {
    throw new ChartValidationError("Dataset ID is required to validate chart.");
  }

  const xField = frontendConfig.x?.field || frontendConfig.x || frontendConfig.visualization?.xAxis;
  const yField = frontendConfig.y?.field || frontendConfig.y || frontendConfig.visualization?.yAxis;

  if (!xField || !yField) {
    throw new ChartValidationError(`Chart of type "${type}" requires both X and Y fields.`);
  }

  // Fetch schema to determine types
  const metadata = await Metadata.findOne({ datasetId }).lean();
  if (!metadata) {
    throw new ChartValidationError(`Dataset "${datasetId}" not found for validation.`);
  }

  const typeClassification = {
    measure: ["int", "float", "number", "decimal", "double", "numeric", "real", "long"],
    dimension: ["string", "text", "categorical", "bool", "boolean", "date", "timestamp", "time"],
  };

  const getColType = (fieldName) => {
    const col = metadata.schema?.find(c => c.name === fieldName);
    if (!col) return null;
    const t = (col.type || col.dataType || "string").toLowerCase();
    if (typeClassification.measure.some(mt => t.includes(mt))) return "numeric";
    return "categorical";
  };

  const xType = getColType(xField);
  const yType = getColType(yField);

  if (!xType) throw new ChartValidationError(`Field "${xField}" does not exist in dataset schema.`);
  if (!yType) throw new ChartValidationError(`Field "${yField}" does not exist in dataset schema.`);

  // Validation Rules
  const RULES = {
    bar: {
      x: ["categorical"],
      y: ["numeric"],
      error: "Bar charts require a categorical dimension on the X axis and a numeric measure on the Y axis."
    },
    line: {
      x: ["categorical"], // Line charts often use dates/categories
      y: ["numeric"],
      error: "Line charts require a categorical dimension on the X axis and a numeric measure on the Y axis."
    },
    scatter: {
      x: ["numeric"],
      y: ["numeric"],
      error: "Scatter plots require both axes to be numeric."
    },
    pie: {
      x: ["categorical"],
      y: ["numeric"],
      error: "Pie charts require a categorical dimension for grouping and a numeric measure for slicing."
    }
  };

  const rule = RULES[type];
  if (rule) {
    if (!rule.x.includes(xType)) {
      throw new ChartValidationError(`Invalid X axis type for ${type} chart: expected ${rule.x.join(" or ")}, got ${xType}. ${rule.error}`);
    }
    if (!rule.y.includes(yType)) {
      throw new ChartValidationError(`Invalid Y axis type for ${type} chart: expected ${rule.y.join(" or ")}, got ${yType}. ${rule.error}`);
    }
  }

  return true;
};

exports.ChartValidationError = ChartValidationError;
