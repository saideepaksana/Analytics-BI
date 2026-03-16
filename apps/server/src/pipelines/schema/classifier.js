/**
 * Schema Classifier – Heuristic-based column role and type inference.
 *
 * For each column it determines:
 *   - type   : string | integer | decimal | boolean | timestamp | unknown
 *   - role   : dimension | measure | attribute
 *
 * Rules:
 *   - Columns whose values are all numeric          → measure
 *   - Columns whose values look like dates/times    → dimension (temporal)
 *   - Columns with low cardinality string values    → dimension (categorical)
 *   - High-cardinality string columns (names, etc.) → attribute
 *   - Boolean columns                               → attribute
 */

const DATE_PATTERNS = [
    /^\d{4}-\d{2}-\d{2}$/,           // 2024-01-15
    /^\d{2}\/\d{2}\/\d{4}$/,         // 01/15/2024
    /^\d{4}-\d{2}-\d{2}T\d{2}:/,     // ISO 8601
    /^\d{2}-[A-Za-z]{3}-\d{4}$/,     // 15-Jan-2024
];

const DIMENSION_KEYWORDS = ['date', 'time', 'year', 'month', 'day', 'quarter', 'period',
    'region', 'country', 'city', 'state', 'category', 'type', 'status', 'id', 'code', 'key'];

const MEASURE_KEYWORDS = ['price', 'amount', 'total', 'count', 'quantity', 'qty', 'revenue',
    'cost', 'sales', 'profit', 'margin', 'weight', 'height', 'width', 'length',
    'score', 'rate', 'ratio', 'avg', 'sum', 'max', 'min'];

/**
 * Detect the data type from a sample of values.
 * @param {Array} samples  Up to N non-null values from the column.
 * @returns {'integer'|'decimal'|'boolean'|'timestamp'|'string'|'unknown'}
 */
function detectType(samples) {
    if (!samples.length) return 'unknown';

    let integers = 0, decimals = 0, booleans = 0, timestamps = 0, strings = 0;

    for (const raw of samples) {
        const v = String(raw).trim();

        if (v === '') continue;

        if (v === 'true' || v === 'false' || v === '1' || v === '0') {
            booleans++;
            continue;
        }

        if (DATE_PATTERNS.some((p) => p.test(v)) || !isNaN(Date.parse(v)) && v.length >= 8) {
            timestamps++;
            continue;
        }

        const n = Number(v);
        if (!isNaN(n)) {
            if (Number.isInteger(n)) integers++;
            else decimals++;
            continue;
        }

        strings++;
    }

    const total = samples.length;
    const numericCount = integers + decimals;

    if (booleans / total > 0.8) return 'boolean';
    if (timestamps / total > 0.7) return 'timestamp';
    if (numericCount / total > 0.8) return decimals > 0 ? 'decimal' : 'integer';
    if (strings / total > 0.5) return 'string';

    return 'unknown';
}

/**
 * Determine the column role based on type, name, and cardinality.
 * @param {string} columnName
 * @param {string} type
 * @param {Array}  allValues     Full column value list (for cardinality).
 * @returns {'dimension'|'measure'|'attribute'}
 */
function inferRole(columnName, type, allValues) {
    const nameLower = columnName.toLowerCase();

    // Numeric types are generally measures
    if (type === 'integer' || type === 'decimal') {
        // But IDs, codes, zip codes etc. are dimensions
        if (DIMENSION_KEYWORDS.some((kw) => nameLower.includes(kw))) return 'dimension';
        if (MEASURE_KEYWORDS.some((kw) => nameLower.includes(kw))) return 'measure';
        return 'measure';
    }

    // Temporal types are dimensions
    if (type === 'timestamp') return 'dimension';

    // Boolean types are attributes
    if (type === 'boolean') return 'attribute';

    // String types – check name hints first
    if (DIMENSION_KEYWORDS.some((kw) => nameLower.includes(kw))) return 'dimension';
    if (MEASURE_KEYWORDS.some((kw) => nameLower.includes(kw))) return 'measure';

    // Cardinality heuristic: low cardinality → dimension, high → attribute
    const uniqueCount = new Set(allValues.map((v) => String(v).trim().toLowerCase())).size;
    const ratio = uniqueCount / (allValues.length || 1);

    if (ratio < 0.3) return 'dimension';

    return 'attribute';
}

/**
 * Classify every column of a dataset.
 *
 * @param {Object[]} rows   Array of row objects (parsed from CSV/Excel).
 * @returns {Object[]}      Array of column descriptors compatible with ColumnSchema.
 */
function classifySchema(rows) {
    if (!rows || rows.length === 0) return [];

    const columnNames = Object.keys(rows[0]);
    const SAMPLE_SIZE = Math.min(rows.length, 200);
    const sampleRows = rows.slice(0, SAMPLE_SIZE);

    return columnNames.map((name) => {
        const allValues = rows.map((r) => r[name]).filter((v) => v !== null && v !== undefined && v !== '');
        const sampleValues = sampleRows.map((r) => r[name]).filter((v) => v !== null && v !== undefined && v !== '');

        const type = detectType(sampleValues);
        const role = inferRole(name, type, allValues);
        const nullable = rows.some((r) => r[name] === null || r[name] === undefined || r[name] === '');

        return { name, type, role, nullable, primaryKey: false, foreignKey: false };
    });
}

module.exports = { classifySchema, detectType, inferRole };
