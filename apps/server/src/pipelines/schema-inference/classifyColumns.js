/**
 * classifyColumns.js
 * 
 * REQ-2.2: The system shall function as a "relationship maker" by automatically
 * classifying every data field as either a Dimension or a Measure.
 * 
 * HOW THE HEURISTIC WORKS:
 * Rule 1 (Name-based)  — Column names like "id", "name", "category" → Dimension
 *                        Column names like "revenue", "count", "amount" → Measure
 * Rule 2 (Type-based)  — If data type is string/date/boolean → Dimension
 *                        If data type is number → candidate for Measure
 * Rule 3 (Cardinality) — If a number column has very few unique values (e.g. 1-5),
 *                        it's likely a Dimension (e.g. "Rating: 1,2,3,4,5")
 *                        High unique count → Measure
 * Rule 4 (Name suffix) — Columns ending in "_id", "_code", "_key" → force Dimension
 *                        even if they contain numbers
 */

// Keywords that strongly suggest a column is a DIMENSION (category/label)
const DIMENSION_NAME_KEYWORDS = [
  "id", "name", "category", "type", "status", "region", "country",
  "city", "state", "province", "department", "group", "class",
  "label", "description", "code", "key", "flag", "gender",
  "product", "brand", "segment", "channel", "source", "medium",
  "year", "month", "quarter", "week", "day", "date",
];

// Keywords that strongly suggest a column is a MEASURE (numeric/quantifiable)
const MEASURE_NAME_KEYWORDS = [
  "revenue", "sales", "profit", "loss", "amount", "total", "sum",
  "count", "quantity", "units", "price", "cost", "rate", "ratio",
  "percent", "percentage", "score", "rating", "age", "salary",
  "income", "expense", "budget", "forecast", "target", "actual",
  "gross", "net", "margin", "value", "weight", "height", "duration",
  "clicks", "impressions", "conversions", "sessions",
];

// Suffixes that force a column to be a Dimension (even if numeric)
const DIMENSION_SUFFIX = ["_id", "_code", "_key", "_no", "_num", "_ref"];

/**
 * Infer the JavaScript data type of a column by sampling its values.
 * Returns: "string" | "number" | "date" | "boolean" | "mixed" | "empty"
 */

function inferDataType(sampleValues) {
  const nonNull = sampleValues.filter((v) => v !== null && v !== undefined && v !== "");

  if (nonNull.length === 0) return "empty";

  const typeCounts = { string: 0, number: 0, date: 0, boolean: 0 };

  for (const val of nonNull) {
    if (typeof val === "boolean") {
      typeCounts.boolean++;
    } else if (typeof val === "number") {
      typeCounts.number++;
    } else if (val instanceof Date) {
      typeCounts.date++;
    } else if (typeof val === "string") {
      // Try to detect dates stored as strings
      const dateAttempt = new Date(val);
      if (!isNaN(dateAttempt.getTime()) && /\d{4}/.test(val)) {
        typeCounts.date++;
      }
      // Try to detect numbers stored as strings
      else if (!isNaN(parseFloat(val)) && isFinite(val)) {
        typeCounts.number++;
      } else {
        typeCounts.string++;
      }
    }
  }

  // Return the dominant type
  const dominant = Object.entries(typeCounts).sort((a, b) => b[1] - a[1])[0];
  if (dominant[1] === 0) return "string"; // fallback
  return dominant[0];
}

/**
 * Classify a single column as "dimension" or "measure".
 * 
 * @param {string} columnName - The column header
 * @param {Array}  sampleValues - Up to 50 sample values from the collection
 * @param {number} totalRows - Total row count (used for cardinality check)
 * @returns {Object} { role, dataType, suggestedAggregation, confidence }
 */
function classifyColumn(columnName, sampleValues, totalRows) {
  const nameLower = columnName.toLowerCase().trim();
  const dataType = inferDataType(sampleValues);

  // --- RULE 4: Suffix override (highest priority) ---
  const hasDimensionSuffix = DIMENSION_SUFFIX.some((suffix) =>
    nameLower.endsWith(suffix)
  );
  if (hasDimensionSuffix) {
    return {
      role: "dimension",
      dataType,
      suggestedAggregation: null,
      confidence: 0.95,
    };
  }

  // --- RULE 1: Name-based keyword check ---
  const isDimensionByName = DIMENSION_NAME_KEYWORDS.some((kw) =>
    nameLower.includes(kw)
  );
  const isMeasureByName = MEASURE_NAME_KEYWORDS.some((kw) =>
    nameLower.includes(kw)
  );

  // --- RULE 2: Type-based check ---
  const isNumericType = dataType === "number";
  const isCategoricalType = ["string", "date", "boolean", "empty"].includes(dataType);

  // --- RULE 3: Cardinality check (only for numbers) ---
  const nonNullSamples = sampleValues.filter((v) => v !== null && v !== undefined && v !== "");
  const uniqueValues = [...new Set(nonNullSamples)];
  const uniqueCount = uniqueValues.length;
  const cardinalityRatio = totalRows > 0 ? uniqueCount / totalRows : 0;

  // Low cardinality numeric: only treat as dimension when no measure keyword matches
  // This prevents small test samples (4-8 rows) from misclassifying real measures
  const isLowCardinalityNumeric =
    isNumericType && uniqueCount <= 10 && !isMeasureByName;

  // --- Decision logic (priority order matters) ---
  let role;
  let confidence;
  let suggestedAggregation = null;

  if (isCategoricalType) {
    // Strings, dates, booleans are always dimensions
    role = "dimension";
    confidence = 0.9;
  } else if (isMeasureByName && isNumericType) {
    // Strong keyword match wins — even over cardinality
    role = "measure";
    confidence = 0.9;
  } else if (isLowCardinalityNumeric) {
    // Small distinct set of numbers with no measure keyword → likely a category (e.g. 1-5 rating)
    role = "dimension";
    confidence = 0.75;
  } else if (isDimensionByName) {
    role = "dimension";
    confidence = 0.85;
  } else if (isNumericType) {
    // Default: numeric columns without a clear name → assume measure
    role = "measure";
    confidence = 0.65;
  } else {
    // Fallback for anything else
    role = "dimension";
    confidence = 0.5;
  }

  // Suggest an aggregation function for measures
  if (role === "measure") {
    if (nameLower.includes("count") || nameLower.includes("quantity")) {
      suggestedAggregation = "sum";
    } else if (nameLower.includes("rate") || nameLower.includes("percent") || nameLower.includes("ratio")) {
      suggestedAggregation = "avg";
    } else if (nameLower.includes("price") || nameLower.includes("revenue") || nameLower.includes("sales")) {
      suggestedAggregation = "sum";
    } else {
      suggestedAggregation = "sum"; // default
    }
  }

  return { role, dataType, suggestedAggregation, confidence };
}

/**
 * Classify ALL columns in a collection.
 * 
 * @param {Array<Object>} documents - Sample documents from the MongoDB collection
 * @returns {Array<Object>} Array of classified column descriptors
 */


function classifyAllColumns(documents, totalRows = documents.length) {
  if (!documents || documents.length === 0) return [];

//   const totalRows = documents.length;

  // Get all unique column names from the sample (excluding MongoDB's _id)
  const columnNames = [
    ...new Set(documents.flatMap((doc) => Object.keys(doc))),
  ].filter((key) => key !== "_id" && key !== "__v");

  const results = [];

  for (const colName of columnNames) {
    // Extract up to 50 sample values for this column
    const sampleValues = documents
      .slice(0, 50)
      .map((doc) => doc[colName] ?? null);

    const { role, dataType, suggestedAggregation, confidence } =
      classifyColumn(colName, sampleValues, totalRows);

    // Compute null count and unique count from the sample
    const nonNull = sampleValues.filter((v) => v !== null && v !== undefined && v !== "");
    const nullCount = sampleValues.length - nonNull.length;
    const uniqueCount = new Set(nonNull.map(String)).size;

    results.push({
      name: colName,
      dataType,
      role,
      suggestedAggregation,
      sampleValues: [...new Set(sampleValues.filter(Boolean))].slice(0, 5), // store 5 examples
      nullCount,
      uniqueCount,
      confidence, // not stored in DB, used internally for logging
    });
  }

  return results;
}

module.exports = { classifyAllColumns, classifyColumn, inferDataType };