/**
 * Automatically infer:
 *   1. dataType  → string / number / date / boolean / mixed
 *   2. role      → dimension / measure
 *   3. aggregation hint for measures
 *
 * Used in pipeline:
 *   inferSchema.js → classifyAllColumns() → updateMetadata.js
 */

// Keyword Heuristics

const SIGNED_NUMERIC_FIELDS = new Set(["base_excess"]);
const POSITIVE_ONLY_NUMERIC_TOKENS = ["price", "amount", "cost", "quantity", "count", "total"];

const normalizeColumnNameForConstraints = (name) => String(name || "").toLowerCase().replace(/[^a-z0-9]+/g, "_");

const hasConstraintToken = (name, tokens = []) => {
  const normalized = normalizeColumnNameForConstraints(name);
  return tokens.some((token) => new RegExp(`(^|_)${String(token).toLowerCase()}(_|$)`).test(normalized));
};

const isPositiveOnlyNumericFieldForConstraints = (name) =>
  hasConstraintToken(name, POSITIVE_ONLY_NUMERIC_TOKENS);

const inferConstraints = (column) => {
  const normalized = normalizeColumnNameForConstraints(column.name);
  const constraints = {};

  if (["number", "decimal", "integer", "int", "float", "double"].includes(column.dataType)) {
    if (!SIGNED_NUMERIC_FIELDS.has(normalized) && isPositiveOnlyNumericFieldForConstraints(column.name)) {
      constraints.min = 0;
    }
  }
  return constraints;
};

// Words typically representing categorical (dimension) fields
const DIMENSION_NAME_KEYWORDS = [
    "id", "name", "category", "type", "status", "region", "country",
    "city", "state", "province", "department", "group", "class",
    "label", "description", "code", "key", "flag", "gender",
    "product", "brand", "segment", "channel", "source", "medium",
    "year", "month", "quarter", "week", "day", "date",
];

// Words typically representing numeric/measurable values
const MEASURE_NAME_KEYWORDS = [
    "revenue", "sales", "profit", "loss", "amount", "total", "sum",
    "count", "quantity", "units", "price", "cost", "rate", "ratio",
    "percent", "percentage", "score", "rating", "age", "salary",
    "income", "expense", "budget", "forecast", "target", "actual",
    "gross", "net", "margin", "value", "weight", "height", "duration",
    "clicks", "impressions", "conversions", "sessions",
];

// Strong signal: columns ending with these are almost always IDs → dimension
const DIMENSION_SUFFIXES = ["_id", "_code", "_key", "_no", "_num", "_ref"];


/* Utility Helpers */


// Treat null / undefined / "" as missing
function isMissingValue(v) {
    return v === null || v === undefined || v === "";
}

// Normalize column name → snake_case lowercase
// Example: "customerId" → "customer_id"
function normalizeColumnName(name) {
    return String(name || "")
        .trim()
        .replace(/([a-z0-9])([A-Z])/g, "$1_$2") // camelCase split
        .replace(/[^a-zA-Z0-9]+/g, "_")
        .toLowerCase()
        .replace(/^_+|_+$/g, "");
}

// Tokenize → ["customer", "id"]
function tokenizeColumnName(name) {
    return normalizeColumnName(name)
        .split("_")
        .filter(Boolean);
}

// Count how many keywords match column tokens
function countKeywordHits(tokens, keywords) {
    const tokenSet = new Set(tokens);
    let count = 0;
    for (const keyword of keywords) {
        if (tokenSet.has(keyword)) count++;
    }
    return count;
}

// Just boolean version of above
function hasKeyword(tokens, keywords) {
    return countKeywordHits(tokens, keywords) > 0;
}


/* =========================
   Type Detection Helpers
   ========================= */

// Detect numeric string like "123", "12.5"
function isNumericString(value) {
    if (typeof value !== "string") return false;
    const s = value.trim();
    if (s === "") return false;
    return /^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?$/.test(s);
}

// Detect boolean string
function isBooleanString(value) {
    if (typeof value !== "string") return false;
    const s = value.trim().toLowerCase();
    return s === "true" || s === "false" || s === "1" || s === "0";
}

// Detect date-like string safely
function isLikelyDateString(value) {
    if (typeof value !== "string") return false;
    const s = value.trim();
    if (s === "") return false;

    const parsed = Date.parse(s);
    if (Number.isNaN(parsed)) return false;

    // Avoid treating plain numbers like "2024" as date
    return /[-/:\sT]/.test(s) || /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/i.test(s);
}


/* Core: Data Type Inference */

/**
 * Infer dominant data type from sample values
 */
function inferDataType(sampleValues) {
    const values = (sampleValues || []).filter((v) => !isMissingValue(v));
    if (values.length === 0) return "empty";

    const counts = { string: 0, number: 0, date: 0, boolean: 0 };

    for (const val of values) {
        if (typeof val === "number") {
            Number.isFinite(val) ? counts.number++ : counts.string++;
        } else if (typeof val === "boolean") {
            counts.boolean++;
        } else if (val instanceof Date) {
            !Number.isNaN(val.getTime()) ? counts.date++ : counts.string++;
        } else if (typeof val === "string") {
            if (isBooleanString(val)) counts.boolean++;
            else if (isNumericString(val)) counts.number++;
            else if (isLikelyDateString(val)) counts.date++;
            else counts.string++;
        } else {
            counts.string++;
        }
    }

    // Pick dominant type
    const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const [dominantType, dominantCount] = entries[0];

    // Mixed detection
    const nonZeroTypes = entries.filter(([, c]) => c > 0).length;
    if (nonZeroTypes > 1 && dominantCount / values.length < 0.8) {
        return "mixed";
    }

    return dominantType;
}


/* =========================
   Core: Column Classification
   ========================= */

function classifyColumn(columnName, sampleValues, totalRows = 0) {
    const normalizedName = normalizeColumnName(columnName);
    const tokens = tokenizeColumnName(columnName);

    const dataType = inferDataType(sampleValues);

    // Compute stats
    const nonNull = sampleValues.filter((v) => !isMissingValue(v));
    const uniqueCount = new Set(nonNull.map((v) => String(v))).size;

    const rowBase = Math.max(nonNull.length, 1);
    // Note: cardinalityRatio is relative to the sample size (nonNull.length), not totalRows.
    // This prevents false dimensions on large datasets where a small sample might appear low-cardinality.
    // If sampling size changes from 50, thresholds like 0.02/0.80 may need recalibration.
    const cardinalityRatio = uniqueCount / rowBase;

    // Heuristics
    const hasDimensionSuffix = DIMENSION_SUFFIXES.some(s => normalizedName.endsWith(s));

    const dimHits = countKeywordHits(tokens, DIMENSION_NAME_KEYWORDS);
    const measHits = countKeywordHits(tokens, MEASURE_NAME_KEYWORDS);

    let role = "dimension";
    let confidence = 0.5;
    let suggestedAggregation = null;

    /* ========= RULE ENGINE ========= */

    // Strong rule: ID-like columns
    if (hasDimensionSuffix) {
        role = "dimension";
        confidence = 0.97;
    }

    // Non-numeric → dimension
    else if (["string", "boolean", "date"].includes(dataType)) {
        role = "dimension";
        confidence = 0.9;
    }

    // Numeric → depends on cardinality + name
    else if (dataType === "number") {
        /**
         * Numeric Classification Priority:
         * 1. Absolute low cardinality (e.g. 1-15 unique values) → Dimension
         * 2. Relative low cardinality (e.g. < 2% unique) → Dimension
         * 3. High cardinality/continuous (e.g. > 80% unique) → Measure
         * 4. Name semantics (tie-breaker for medium cardinality)
         * 5. Default fallback → Measure
         */
        if (uniqueCount <= 15) {
            role = "dimension";
            confidence = 0.85;
        } else if (cardinalityRatio < 0.02) {
            role = "dimension";
            confidence = 0.80;
        } else if (cardinalityRatio > 0.80) {
            role = "measure";
            confidence = 0.85;
        } else if (dimHits > 0 && measHits === 0) {
            role = "dimension";
            confidence = 0.78;
        } else if (measHits > dimHits) {
            role = "measure";
            confidence = 0.82;
        } else if (dimHits > measHits) {
            role = "dimension";
            confidence = 0.75;
        } else {
            role = "measure";
            confidence = 0.60;
        }
    }

    // Mixed → safer as dimension
    else if (dataType === "mixed") {
        role = measHits > dimHits ? "measure" : "dimension";
        confidence = 0.7;
    }

    /*  AGGREGATION HINT  */

    if (role === "measure") {
        if (normalizedName.includes("rate") || normalizedName.includes("percent")) {
            suggestedAggregation = "avg";
        } else {
            suggestedAggregation = "sum";
        }
    }

    return {
        role,
        dataType,
        suggestedAggregation,
        confidence: Number(confidence.toFixed(2)),
    };
}


/* Main Driver Function */

/**
 * Runs classification on full dataset
 */
function classifyAllColumns(documents, totalRows = documents.length) {
    if (!Array.isArray(documents) || documents.length === 0) return [];

    // Collect all column names across documents (optimized for large batches)
    const columnNameSet = new Set();
    // Usually the first and last row are enough for standard CSVs, but we'll check first few for safety
    const probeCount = Math.min(documents.length, 100);
    for (let i = 0; i < probeCount; i++) {
        const keys = Object.keys(documents[i] || {});
        for (const k of keys) {
            if (k !== "_id" && k !== "__v") {
                columnNameSet.add(k);
            }
        }
    }
    const columnNames = Array.from(columnNameSet);

    const results = [];

    for (const colName of columnNames) {

        // Sample first 50 rows for performance
        const sampleValues = documents.slice(0, 50)
            .map(doc => doc?.[colName] ?? null);

        const { role, dataType, suggestedAggregation, confidence } =
            classifyColumn(colName, sampleValues, totalRows);

        // Compute stats
        const nonNull = sampleValues.filter(v => !isMissingValue(v));
        const nullCount = sampleValues.length - nonNull.length;
        const uniqueCount = new Set(nonNull.map(v => String(v))).size;

        // Collect up to 5 unique example values (for UI preview)
        const exampleValues = [];
        const seen = new Set();

        for (const v of sampleValues) {
            if (isMissingValue(v)) continue;

            const key = typeof v === "object" ? JSON.stringify(v) : String(v);
            if (seen.has(key)) continue;

            seen.add(key);
            exampleValues.push(v);

            if (exampleValues.length === 5) break;
        }

        results.push({
            name: colName,
            dataType,
            role,
            suggestedAggregation,
            sampleValues: exampleValues,
            nullCount,
            uniqueCount,
            confidence,
        });
    }

    return results;
}

module.exports = { classifyAllColumns, classifyColumn, inferDataType, inferConstraints };
