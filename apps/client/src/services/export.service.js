import { API_BASE_URL } from "../core/config/env";

/**
 * Triggers a file download by opening the backend export endpoint 
 * in a new window/tab, letting the browser handle the attachment disposition.
 * 
 * @param {string} datasetId 
 * @param {'csv'|'xlsx'|'pdf'} format 
 */
export const downloadDatasetExport = (datasetId, format) => {
  if (!datasetId || !format) return;
  const url = `${API_BASE_URL}/export/${datasetId}/${format}`;
  window.open(url, "_blank");
};

export const getExportDownloadUrl = (filename) => {
  if (!filename) return "";
  return `${API_BASE_URL}/export/download/${encodeURIComponent(filename)}`;
};

export const getExportShareUrl = (filename) => getExportDownloadUrl(filename);

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
    return field ? { field, aggregation: "SUM", label: field } : null;
  }

  if (!measure || typeof measure !== "object") {
    return null;
  }

  const field = measure.field === "*" ? "*" : String(measure.field || "").trim();
  if (!field) {
    return null;
  }

  return {
    ...measure,
    field,
    aggregation: String(measure.aggregation || "SUM").toUpperCase(),
    label: measure.label || (field === "*" ? "COUNT(*)" : field),
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

export const normalizeFilterList = (filters) => {
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
      return [normalizeFilter({ field, operator: value.operator, value: value.value })].filter(Boolean);
    }

    return [{ field, operator: "=", value }];
  });
};

export const mergeNormalizedFilters = (...filterGroups) => {
  return filterGroups.flatMap((group) => normalizeFilterList(group));
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

const normalizeSortList = (items) => {
  if (!Array.isArray(items)) {
    return [];
  }

  return items.map(normalizeSort).filter(Boolean);
};

export const buildChartQueryForExport = ({ chart, query = null } = {}) => {
  const sourceQuery = query || chart?.query || {};
  const chartType = chart?.visualization?.type || chart?.type || sourceQuery.type;
  const normalizedMeasures = Array.isArray(sourceQuery.measures)
    ? sourceQuery.measures.map(normalizeMeasure).filter(Boolean)
    : [];
  const normalizedDimensions = Array.isArray(sourceQuery.dimensions)
    ? sourceQuery.dimensions.map(normalizeDimension).filter(Boolean)
    : [];
  const isScatter = chartType === "scatter";
  const isDistribution = chartType === "boxplot" || chartType === "histogram";
  const isLineOrArea = chartType === "line" || chartType === "area";
  const hasRawMeasure = normalizedMeasures.some(
    (measure) => String(measure.aggregation || "").toUpperCase() === "RAW"
  );

  return {
    dimensions: isScatter || isDistribution ? [] : normalizedDimensions,
    measures: normalizedMeasures,
    filters: normalizeFilterList(sourceQuery.filters),
    orderBy: normalizeSortList(sourceQuery.orderBy),
    sortBy: normalizeSortList(sourceQuery.sortBy),
    raw: Boolean(sourceQuery.raw || isScatter || isDistribution || (isLineOrArea && hasRawMeasure)),
    rowLimit: sourceQuery.rowLimit,
    seriesLimit: sourceQuery.seriesLimit,
    contributionMode: sourceQuery.contributionMode || "none",
  };
};

export const buildChartRawExportPayload = ({
  datasetId,
  chartId,
  chartName,
  chart = null,
  query = null,
  dashboardFilters = [],
  source = "chart",
}) => {
  const resolvedDatasetId =
    datasetId ||
    chart?.dataSource?.datasetId ||
    chart?.datasetId ||
    "";
  const resolvedQuery = buildChartQueryForExport({ chart, query });

  return {
    datasetId: resolvedDatasetId,
    context: {
      source,
      chartId: chartId || chart?.chartId || chart?._id,
      chartName: chartName || chart?.name || "Chart Export",
      query: resolvedQuery,
      dashboardFilters: normalizeFilterList(dashboardFilters),
    },
  };
};
