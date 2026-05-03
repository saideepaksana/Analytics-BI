const Metadata = require("../../models/Metadata");
const CleanRecord = require("../../models/CleanRecord");
const { buildGroupAndProjectStages } = require("./groupStageBuilder");

const NUMERIC_TYPE_REGEX = /(int|float|number|decimal|double|long|short|numeric|real)/i;
const DATE_TYPE_REGEX = /(date|time|timestamp)/i;
const BOOLEAN_TYPE_REGEX = /(bool|boolean)/i;

const buildSchemaMap = (metadataSchema = []) => {
  const schemaMap = {};

  for (const column of metadataSchema) {
    const normalizedName = String(column?.name || "").toLowerCase();
    if (!normalizedName) continue;

    schemaMap[normalizedName] = {
      ...column,
      type: column.type || column.dataType,
    };
  }

  return schemaMap;
};

const normalizeDimension = (dimension) => {
  if (typeof dimension === "string") {
    const field = dimension.trim();
    return field ? { field } : null;
  }

  if (!dimension || typeof dimension !== "object") {
    return null;
  }

  const field = String(dimension.field || "").trim();
  if (!field) {
    return null;
  }

  return {
    ...dimension,
    field,
  };
};

const normalizeMeasure = (measure) => {
  if (typeof measure === "string") {
    const field = measure.trim();
    return field ? { field, aggregation: "SUM" } : null;
  }

  if (!measure || typeof measure !== "object") {
    return null;
  }

  const field = String(measure.field || "").trim();
  if (!field && measure.field !== "*") {
    return null;
  }

  return {
    ...measure,
    field: measure.field === "*" ? "*" : field,
    aggregation: String(measure.aggregation || "SUM").toUpperCase(),
  };
};

const normalizeSort = (sortItem) => {
  if (!sortItem || typeof sortItem !== "object") {
    return null;
  }

  const field = String(sortItem.field || "").trim();
  if (!field) {
    return null;
  }

  return {
    field,
    direction: String(sortItem.direction || "asc").toLowerCase() === "desc" ? "desc" : "asc",
  };
};

const normalizeFilter = (filter) => {
  if (!filter || typeof filter !== "object") {
    return null;
  }

  const field = String(filter.field || "").trim();
  const operator = String(filter.operator || "").trim();

  if (!field || !operator) {
    return null;
  }

  return {
    field,
    operator,
    value: filter.value,
  };
};

const normalizeFiltersInput = (filters) => {
  if (Array.isArray(filters)) {
    return filters.map(normalizeFilter).filter(Boolean);
  }

  if (!filters || typeof filters !== "object") {
    return [];
  }

  return Object.entries(filters).flatMap(([field, value]) => {
    if (!String(field || "").trim()) {
      return [];
    }

    if (Array.isArray(value)) {
      return [{ field, operator: "IN", value }];
    }

    if (value && typeof value === "object" && "operator" in value) {
      const resolvedField = value.field || field;
      return [normalizeFilter({ field: resolvedField, operator: value.operator, value: value.value })].filter(Boolean);
    }

    return [{ field, operator: "=", value }];
  });
};

const mergeFilters = (...filterGroups) => {
  return filterGroups.flatMap((group) => normalizeFiltersInput(group));
};

const normalizeQueryConfig = (query = {}) => {
  const normalizedDimensions = Array.isArray(query.dimensions)
    ? query.dimensions.map(normalizeDimension).filter(Boolean)
    : [];
  const normalizedMeasures = Array.isArray(query.measures)
    ? query.measures.map(normalizeMeasure).filter(Boolean)
    : [];
  const normalizedFilters = normalizeFiltersInput(query.filters);
  const normalizedOrderBy = Array.isArray(query.orderBy)
    ? query.orderBy.map(normalizeSort).filter(Boolean)
    : [];
  const normalizedSortBy = Array.isArray(query.sortBy)
    ? query.sortBy.map(normalizeSort).filter(Boolean)
    : [];

  return {
    dimensions: normalizedDimensions,
    measures: normalizedMeasures,
    filters: normalizedFilters,
    orderBy: normalizedOrderBy,
    sortBy: normalizedSortBy,
    raw: Boolean(query.raw),
    rowLimit: query.rowLimit,
    seriesLimit: query.seriesLimit,
    contributionMode: query.contributionMode || "none",
    chartType: query.chartType || query.type,
    binSize: query.binSize,
  };
};

const isNumericType = (type = "") => NUMERIC_TYPE_REGEX.test(type);
const isDateType = (type = "") => DATE_TYPE_REGEX.test(type);
const isBooleanType = (type = "") => BOOLEAN_TYPE_REGEX.test(type);

const coerceValue = (value, columnType = "", operator = "=") => {
  if (value === null || value === undefined) return value;

  const raw = typeof value === "string" ? value.trim() : value;

  if (isBooleanType(columnType)) {
    if (raw === true || raw === false) return raw;
    if (String(raw).toLowerCase() === "true") return true;
    if (String(raw).toLowerCase() === "false") return false;
  }

  if (isNumericType(columnType) || [">", ">=", "<", "<="].includes(operator)) {
    const num = Number(raw);
    if (!Number.isNaN(num) && Number.isFinite(num)) return num;
  }

  if (isDateType(columnType)) {
    const dt = new Date(raw);
    if (!Number.isNaN(dt.getTime())) return dt;
  }

  return raw;
};

const buildMatchStage = (datasetId, filters, schemaMap) => {
  const matchClauses = [{ datasetId }];

  for (const filter of filters) {
    if (!filter?.field || !filter?.operator) {
      continue;
    }

    const key = `data.${filter.field}`;
    const columnType = schemaMap[String(filter.field).toLowerCase()]?.type || "";
    const typedValue = coerceValue(filter.value, columnType, filter.operator);
    let condition = null;

    if (filter.operator === "=" || filter.operator === "==") {
      if (typedValue !== filter.value) {
        condition = { [key]: { $in: [typedValue, filter.value] } };
      } else {
        condition = { [key]: typedValue };
      }
    } else if (filter.operator === "!=") {
      if (typedValue !== filter.value) {
        condition = { [key]: { $nin: [typedValue, filter.value] } };
      } else {
        condition = { [key]: { $ne: typedValue } };
      }
    } else if (filter.operator === ">") {
      condition = { [key]: { $gt: typedValue } };
    } else if (filter.operator === ">=") {
      condition = { [key]: { $gte: typedValue } };
    } else if (filter.operator === "<") {
      condition = { [key]: { $lt: typedValue } };
    } else if (filter.operator === "<=") {
      condition = { [key]: { $lte: typedValue } };
    } else if (filter.operator === "IN" || filter.operator === "NOT IN") {
      const values = Array.isArray(filter.value)
        ? filter.value
        : String(filter.value || "")
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean);

      const typedValues = values.map((item) => coerceValue(item, columnType, filter.operator));
      const merged = [...new Set([...values, ...typedValues])];

      if (merged.length > 0) {
        condition = { [key]: filter.operator === "IN" ? { $in: merged } : { $nin: merged } };
      }
    }

    if (condition) {
      matchClauses.push(condition);
    }
  }

  return matchClauses.length === 1 ? matchClauses[0] : { $and: matchClauses };
};

const getExportColumnOrder = (query = {}, results = []) => {
  const normalizedQuery = normalizeQueryConfig(query);
  const columns = [
    ...normalizedQuery.dimensions.map((dimension) => dimension.field),
  ];

  if (normalizedQuery.raw) {
    normalizedQuery.measures.forEach((measure) => {
      if (measure.field && measure.field !== "*" && !columns.includes(measure.field)) {
        columns.push(measure.field);
      }
    });
  } else {
    normalizedQuery.measures.forEach((measure) => {
      const key = measure.label || (measure.field === "*" ? "COUNT(*)" : measure.field);
      if (key && !columns.includes(key)) {
        columns.push(key);
      }
    });
  }

  if (columns.length > 0) {
    return columns;
  }

  const keySet = new Set();
  results.forEach((row) => {
    Object.keys(row || {}).forEach((key) => keySet.add(key));
  });

  return Array.from(keySet);
};

const executeDatasetQuery = async (datasetId, query = {}, options = {}) => {
  if (!datasetId) {
    throw new Error("datasetId is required");
  }

  const startTime = Date.now();
  const normalizedQuery = normalizeQueryConfig(query);
  const metadataDoc = options.metadataDoc || await Metadata.findOne({ datasetId }).select("schema").lean();
  const schemaMap = buildSchemaMap(metadataDoc?.schema || []);

  const effectiveRowLimit = Math.min(Math.max(parseInt(normalizedQuery.rowLimit, 10) || 10000, 1), 50000);
  const effectiveSeriesLimit = Math.max(parseInt(normalizedQuery.seriesLimit, 10) || 0, 0);

  const pipeline = [];
  const matchStage = buildMatchStage(datasetId, normalizedQuery.filters, schemaMap);
  let metricKeys = [];

  pipeline.push({ $match: matchStage });

  if (normalizedQuery.raw) {
    const projectStage = { _id: 0 };
    const allFields = [
      ...normalizedQuery.dimensions.map((dimension) => dimension.field),
      ...normalizedQuery.measures.map((measure) => measure.field).filter((field) => field && field !== "*"),
    ].filter(Boolean);

    allFields.forEach((field) => {
      projectStage[field] = `$data.${field}`;
    });

    pipeline.push({ $project: projectStage });
    pipeline.push({ $limit: effectiveRowLimit });
  } else {
    const stages = buildGroupAndProjectStages(normalizedQuery.dimensions, normalizedQuery.measures);

    metricKeys.push(...stages.metricKeys);

    pipeline.push({ $group: stages.groupStage });
    pipeline.push({ $project: stages.projectStage });

    const sortFields = normalizedQuery.sortBy.length > 0 ? normalizedQuery.sortBy : normalizedQuery.orderBy;
    if (sortFields.length > 0) {
      const sortStage = {};
      sortFields.forEach((sortItem) => {
        if (sortItem.field) {
          sortStage[sortItem.field] = sortItem.direction === "desc" ? -1 : 1;
        }
      });

      if (Object.keys(sortStage).length > 0) {
        pipeline.push({ $sort: sortStage });
      }
    }

    if (effectiveSeriesLimit > 0) {
      pipeline.push({ $limit: effectiveSeriesLimit });
    } else {
      pipeline.push({ $limit: effectiveRowLimit });
    }
  }

  const results = await CleanRecord.aggregate(pipeline);

  let processedResults = results;
  if (normalizedQuery.contributionMode === "row" && metricKeys.length > 0) {
    const totals = {};
    metricKeys.forEach((key) => {
      totals[key] = results.reduce((sum, row) => sum + (Number(row[key]) || 0), 0);
    });

    processedResults = results.map((row) => {
      const nextRow = { ...row };
      metricKeys.forEach((key) => {
        if (totals[key] !== 0) {
          nextRow[key] = Number((((Number(row[key]) || 0) / totals[key]) * 100).toFixed(2));
        }
      });
      return nextRow;
    });
  }

  return {
    results: processedResults,
    rowCount: processedResults.length,
    executionTimeMs: Date.now() - startTime,
    metadataDoc,
    normalizedQuery,
  };
};

module.exports = {
  buildSchemaMap,
  normalizeQueryConfig,
  normalizeFiltersInput,
  mergeFilters,
  getExportColumnOrder,
  executeDatasetQuery,
};
