/**
 * typeConstants.js
 *
 * Centralized type classification tokens for the system.
 * Used by Data Source Explorer and Rule Engine to determine
 * dimension vs measure semantics.
 */

const MEASURE_TOKENS = [
  "int",
  "float",
  "number",
  "decimal",
  "double",
  "numeric",
  "real",
  "long",
  "short",
  "integer",
  "bigint",
];

const DIMENSION_TOKENS = [
  "string",
  "text",
  "varchar",
  "categorical",
  "bool",
  "boolean",
  "date",
  "timestamp",
  "time",
  "datetime",
];

/**
 * Checks if a technical type string represents a numeric measure.
 * @param {string} type 
 * @returns {boolean}
 */
const isNumeric = (type = "") => {
  const t = String(type).toLowerCase();
  return MEASURE_TOKENS.some((token) => t.includes(token));
};

/**
 * Classifies a type into "measure" or "dimension".
 * @param {string} type 
 * @returns {"measure" | "dimension" | "unknown"}
 */
const classifyType = (type = "") => {
  if (isNumeric(type)) return "measure";
  
  const t = String(type).toLowerCase();
  if (DIMENSION_TOKENS.some((token) => t.includes(token))) return "dimension";
  
  return "dimension"; // Default to dimension (categorical) if unknown
};

module.exports = {
  MEASURE_TOKENS,
  DIMENSION_TOKENS,
  isNumeric,
  classifyType,
};
