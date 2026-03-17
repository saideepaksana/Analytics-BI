const { Transform } = require('node:stream');
const { TYPE_CLEANER_MAP } = require('./cleaner.js');
const { parseDate } = require('./normalizer.js');
const DLQRecord = require('../../models/DLQRecord.js');

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

const DATE_TYPES = new Set(['date', 'datetime', 'timestamp']);
const POSITIVE_ONLY_NUMERIC_TOKENS = ['price', 'amount', 'cost', 'quantity', 'count', 'total'];

const hasNameToken = (key, tokens = []) => {
    const normalized = String(key || '').toLowerCase().replace(/[^a-z0-9]+/g, '_');
    return tokens.some((token) => {
        const safe = String(token).toLowerCase();
        const pattern = new RegExp(`(^|_)${safe}(_|$)`);
        return pattern.test(normalized);
    });
};

const looksNumericByName = (key) =>
    hasNameToken(key, ['price', 'amount', 'cost', 'quantity', 'count', 'id']);

const isPositiveOnlyNumericField = (key) => hasNameToken(key, POSITIVE_ONLY_NUMERIC_TOKENS);

const resolveCleanerForColumn = (schemaColumn) => {
    const type = schemaColumn.type?.toLowerCase();
    if (DATE_TYPES.has(type)) return parseDate;
    return TYPE_CLEANER_MAP[type] || null;
};

// ── Semantic Validation Layer (Production-Grade) ───────────────
const semanticValidateRow = (row, schemaMap) => {
    const errors = [];

    for (const [key, value] of Object.entries(row)) {
        const lowerKey = key.toLowerCase();
        const meta = schemaMap[key];

        if (!meta) continue;

        const { type, nullable, constraints = {} } = meta;

        // ── 1. Null/Empty Check for Required Fields ──
        if (!nullable && (value === null || value === undefined)) {
            errors.push(`${key}: Required field cannot be empty`);
            continue; // Skip further validation if required field is empty
        }

        // Skip validation for null values on nullable fields
        if (value === null || value === undefined) continue;

        // ── 2. String validation ──
        if (type === 'string' || type === 'varchar' || type === 'text') {
            if (typeof value === 'string' && value === '' && !nullable) {
                errors.push(`${key}: Cannot be empty`);
            } else if (typeof value !== 'string') {
                errors.push(`${key}: Expected text, got ${typeof value}`);
            }
        }

        // ── 3. Number/Decimal validation (prices, amounts) ──
        if (type === 'decimal' || type === 'number' || hasNameToken(lowerKey, ['price', 'amount'])) {
            if (typeof value !== 'number') {
                errors.push(`${key}: Expected number, got ${typeof value}`);
            } else if (!Number.isFinite(value)) {
                errors.push(`${key}: Invalid number value`);
            } else {
                // Apply constraints
                const enforceDefaultNonNegative =
                    constraints.min === undefined &&
                    isPositiveOnlyNumericField(lowerKey);

                const min = constraints.min !== undefined
                    ? constraints.min
                    : (enforceDefaultNonNegative ? 0 : undefined);
                const max = constraints.max;
                if (min !== undefined && value < min) {
                    errors.push(`${key}: Cannot be negative or less than ${min}`);
                }
                if (max !== undefined && value > max) {
                    errors.push(`${key}: Exceeds maximum ${max}`);
                }
            }
        }

        // ── 4. Integer validation (quantity, count, ids) ──
        if (type === 'integer' || hasNameToken(lowerKey, ['quantity', 'count'])) {
            if (!Number.isInteger(value)) {
                errors.push(`${key}: Must be whole number, got ${value}`);
            } else {
                const enforceDefaultNonNegative =
                    constraints.min === undefined &&
                    isPositiveOnlyNumericField(lowerKey);

                const min = constraints.min !== undefined
                    ? constraints.min
                    : (enforceDefaultNonNegative ? 0 : undefined);

                if (min !== undefined && value < min) {
                    errors.push(`${key}: Cannot be negative or less than ${min}`);
                }
                if (constraints.max !== undefined && value > constraints.max) {
                    errors.push(`${key}: Exceeds maximum ${constraints.max}`);
                }
            }
        }

        // ── 5. Boolean validation ──
        if (type === 'boolean') {
            if (typeof value !== 'boolean') {
                errors.push(`${key}: Expected true/false (yes, no, true, false, 1, 0, y, n), got "${value}"`);
            }
        }

        // ── 6. Date validation ──
        if (DATE_TYPES.has(type)) {
            if (typeof value === 'string') {
                const parsed = new Date(value);
                if (isNaN(parsed.getTime())) {
                    errors.push(`${key}: Invalid date format "${value}"`);
                }
            } else if (!(value instanceof Date) && typeof value !== 'string') {
                errors.push(`${key}: Expected date format, got ${typeof value}`);
            }
        }

        // ── 7. Enum validation (category, status) ──
        if (constraints.enum && !constraints.enum.includes(value)) {
            errors.push(`${key}: "${value}" is not valid. Allowed: ${constraints.enum.join(', ')}`);
        }
    }

    return errors;
};

// ─────────────────────────────────────────────────────────────
// DTS Engine (Hybrid)
// ─────────────────────────────────────────────────────────────

class DTSEngineStream extends Transform {
    constructor(datasetId, inferredSchema = []) {
        super({ objectMode: true });

        this.datasetId = datasetId;
        this.dlqBuffer = [];

        this.schemaMap = {};

        for (const col of inferredSchema) {
            this.schemaMap[col.name] = {
                cleanerFn: resolveCleanerForColumn(col),
                nullable: col.nullable !== false,
                type: col.type,
                role: col.role,
                constraints: col.constraints || {} //  extensible
            };
        }
    }

    async _transform(chunk, encoding, callback) {
        const cleanedRow = {};
        const structuralErrors = [];
        const warnings = [];

        // ── 1. Cleaning + Structural Validation ───────────────
        for (const [key, rawValue] of Object.entries(chunk)) {
            const colMeta = this.schemaMap[key];

            if (!colMeta) {
                cleanedRow[key] = rawValue;
                continue;
            }

            const { cleanerFn, nullable, type } = colMeta;

            let cleanedValue = cleanerFn ? cleanerFn(rawValue) : rawValue;

            // Required field check - catches empty strings, nulls, etc.
            if (cleanedValue === null && !nullable) {
                structuralErrors.push({
                    column: key,
                    type: 'missing_required_value',
                    message: `Column "${key}" is empty/missing (required)`,
                    raw: rawValue,
                    cleaned: cleanedValue
                });
            }

            // Parsing failure warning - for nullable fields
            if (cleanedValue === null && rawValue !== null && rawValue !== '' && rawValue !== undefined && nullable) {
                warnings.push({
                    column: key,
                    type: 'unparseable_value',
                    message: `Could not parse "${rawValue}" (cleaned to null)`,
                    raw: rawValue
                });
            }

            cleanedRow[key] = cleanedValue;
        }

        // ── 2. Semantic Validation ────────────────────────────
        const semanticErrors = semanticValidateRow(cleanedRow, this.schemaMap);

        // ── 3. DLQ Decision ───────────────────────────────────
        if (structuralErrors.length > 0 || semanticErrors.length > 0) {
            this.dlqBuffer.push({
                datasetId: this.datasetId,
                rowNumber: this.dlqBuffer.length + 1, // Add row number
                rawData: chunk,
                cleanedData: cleanedRow,
                errorMessages: [  // Array of error messages
                    ...structuralErrors.map(e => e.message),
                    ...semanticErrors
                ],
                status: 'UNFIXABLE'
            });

            console.log(`[DTS] Sent to DLQ`);
            return callback();
        }

        // ── 4. Emit Row (Warnings allowed) ────────────────────
        if (warnings.length > 0) {
            console.warn(`[DTS] Warnings:`, warnings);
        }

        callback(null, cleanedRow);
    }
}

const transformRows = (rows, datasetId, inferredSchema = []) => {
    const validRows = [];
    const invalidRows = [];

    const engine = new DTSEngineStream(datasetId, inferredSchema);

    // Process rows synchronously
    for (const row of rows) {
        // Simulate the transform process
        const cleanedRow = {};
        const structuralErrors = [];
        const warnings = [];

        // 1. Cleaning + Structural Validation
        for (const [key, rawValue] of Object.entries(row)) {
            const colMeta = engine.schemaMap[key];

            if (!colMeta) {
                cleanedRow[key] = rawValue;
                continue;
            }

            const { cleanerFn, nullable, type } = colMeta;

            let cleanedValue = cleanerFn ? cleanerFn(rawValue) : rawValue;

            // Required field check - catches empty strings, nulls, etc.
            if (cleanedValue === null && !nullable) {
                structuralErrors.push({
                    column: key,
                    type: 'missing_required_value',
                    message: `Column "${key}" is empty/missing (required)`,
                    raw: rawValue,
                    cleaned: cleanedValue
                });
            }

            // Parsing failure warning - for nullable fields
            if (cleanedValue === null && rawValue !== null && rawValue !== '' && rawValue !== undefined && nullable) {
                warnings.push({
                    column: key,
                    type: 'unparseable_value',
                    message: `Could not parse "${rawValue}" (cleaned to null)`,
                    raw: rawValue
                });
            }

            cleanedRow[key] = cleanedValue;
        }

        // 2. Semantic Validation
        const semanticErrors = semanticValidateRow(cleanedRow, engine.schemaMap);

        // 3. DLQ Decision
        if (structuralErrors.length > 0 || semanticErrors.length > 0) {
            invalidRows.push({
                rawData: row,
                cleanedData: cleanedRow,
                errors: [
                    ...structuralErrors.map(e => e.message),
                    ...semanticErrors
                ]
            });
        } else {
            validRows.push(cleanedRow);
        }
    }

    return { validRows, invalidRows };
};

// ─────────────────────────────────────────────────────────────
// Standalone Validation & Cleaning Utilities
// ─────────────────────────────────────────────────────────────
// Used by the REST API endpoints for quarantine row restoration

const validateRow = (candidateData) => {
    if (!candidateData || typeof candidateData !== 'object') {
        return ['Invalid row data provided'];
    }

    const errors = [];

    // Check for required fields (non-empty values)
    const entries = Object.entries(candidateData);
    if (entries.length === 0) {
        return ['Row is empty'];
    }

    // Basic type and format validation
    for (const [key, value] of entries) {
        if (value === null || value === undefined || value === '') {
            // Empty values might be allowed, but flag for reference
            continue;
        }

        // Check if field looks like it should be a number
        if (typeof value === 'string') {
            const lowerKey = key.toLowerCase();
            if (looksNumericByName(lowerKey)) {
                const numValue = parseFloat(value);
                if (isNaN(numValue)) {
                    errors.push(`${key}: Expected numeric value, got "${value}"`);
                }
            }
        }
    }

    return errors;
};

const cleanAndNormalizeRow = (candidateData, schemaMap = {}) => {
    if (!candidateData || typeof candidateData !== 'object') {
        return {};
    }

    const cleaned = {};

    for (const [key, value] of Object.entries(candidateData)) {
        let cleanedValue = value;

        // Get schema info for this field if available
        const colMeta = schemaMap[key];
        const type = colMeta?.type?.toLowerCase();

        // Handle null/undefined
        if (value === null || value === undefined) {
            cleanedValue = null;
        }
        // Handle strings
        else if (typeof value === 'string') {
            const trimmed = value.trim();
            if (trimmed === '') {
                // Keep empty string for validation to catch (don't convert to null)
                cleanedValue = '';
            } else {
                // Use schema type if available, otherwise guess based on field name
                if (type === 'number' || type === 'integer' || type === 'decimal' || type === 'float' || type === 'double') {
                    // Parse as number - keep non-numeric strings for validation to reject
                    const numValue = parseFloat(trimmed);
                    cleanedValue = isNaN(numValue) ? trimmed : numValue;
                } else if (type === 'boolean' || type === 'bool') {
                    // Parse as boolean - keep invalid strings for validation to reject
                    const s = trimmed.toLowerCase();
                    if (['true', '1', 'yes', 'y'].includes(s)) {
                        cleanedValue = true;
                    } else if (['false', '0', 'no', 'n'].includes(s)) {
                        cleanedValue = false;
                    } else {
                        // Keep the invalid string so validation can catch it
                        cleanedValue = s;
                    }
                } else if (type === 'date' || type === 'datetime' || type === 'timestamp') {
                    // Try to parse as date using flexible parser
                    cleanedValue = parseDate(trimmed);
                } else if (!type) {
                    // No schema - use field name heuristics as fallback
                    const lowerKey = key.toLowerCase();
                    
                    if (looksNumericByName(lowerKey)) {
                        // Try to parse as number
                        const numValue = parseFloat(trimmed);
                        cleanedValue = isNaN(numValue) ? trimmed : numValue;
                    } else if (lowerKey.includes('date') || lowerKey.includes('time')) {
                        // Try to parse as date using flexible parser
                        const parsed = parseDate(trimmed);
                        cleanedValue = parsed || trimmed;
                    } else {
                        // String - capitalize first letter
                        cleanedValue = trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
                    }
                } else {
                    // String type - just trim, don't capitalize for user-provided data
                    cleanedValue = trimmed;
                }
            }
        }
        // Handle numbers - only accept valid numbers for number fields
        else if (typeof value === 'number') {
            if (Number.isFinite(value)) {
                // If schema expects string/boolean, keep the number so validation rejects it
                if (type === 'string' || type === 'varchar' || type === 'text' || type === 'char') {
                    cleanedValue = value;
                } else if (type === 'boolean' || type === 'bool') {
                    cleanedValue = value;
                } else {
                    // Number field - keep the number
                    cleanedValue = value;
                }
            } else {
                cleanedValue = null;
            }
        }
        // Handle booleans - only accept for boolean fields
        else if (typeof value === 'boolean') {
            // If schema expects string/number, keep the boolean so validation rejects it
            cleanedValue = value;
        }

        cleaned[key] = cleanedValue;
    }

    return cleaned;
};

const hasNoUsableValue = (normalizedData) => {
    if (!normalizedData || typeof normalizedData !== 'object') {
        return true;
    }

    // Check if there's at least one non-null, non-empty value
    for (const value of Object.values(normalizedData)) {
        if (value !== null && value !== undefined && value !== '') {
            return false;
        }
    }

    return true;
};

module.exports = { DTSEngineStream, transformRows, validateRow, cleanAndNormalizeRow, hasNoUsableValue, semanticValidateRow };