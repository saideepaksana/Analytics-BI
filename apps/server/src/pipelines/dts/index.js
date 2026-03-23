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
    const type = (schemaColumn.type || schemaColumn.dataType)?.toLowerCase();
    
    // Handle date types
    if (DATE_TYPES.has(type)) return parseDate;
    
    // For "mixed" type, use the role + sample values to decide
    if (type === 'mixed') {
        // If classified as a measure, treat as numeric
        const role = String(schemaColumn.role || '').toLowerCase();
        if (role === 'measure') {
            return TYPE_CLEANER_MAP.number;
        }
        
        // Otherwise, analyze sample values to pick the best cleaner
        const samples = schemaColumn.sampleValues || [];
        
        // Count types in samples
        let numericCount = 0;
        let booleanCount = 0;
        let stringCount = 0;
        
        for (const val of samples) {
            if (typeof val === 'number') numericCount++;
            else if (typeof val === 'boolean') booleanCount++;
            else if (typeof val === 'string') {
                // Check if string represents a number or boolean
                if (!isNaN(parseFloat(val)) && isFinite(val)) numericCount++;
                else if (['true', 'false', '1', '0', 'yes', 'no', 'y', 'n'].includes(val.toLowerCase())) booleanCount++;
                else stringCount++;
            }
        }
        
        // Pick cleaner based on dominant type in samples
        if (numericCount > booleanCount && numericCount > stringCount) {
            return TYPE_CLEANER_MAP.number;
        } else if (booleanCount > stringCount) {
            return TYPE_CLEANER_MAP.boolean;
        } else {
            return TYPE_CLEANER_MAP.string;
        }
    }
    
    return TYPE_CLEANER_MAP[type] || null;
};

// ── Semantic Validation Layer ───────────────
const semanticValidateRow = (row, schemaMap) => {
    const errors = [];

    for (const [key, value] of Object.entries(row)) {
        const lowerKey = key.toLowerCase();
        const meta = schemaMap[lowerKey];

        if (!meta) continue;

        const { type, nullable, constraints = {} } = meta;

        // ── 1. Null/Empty Check for Required Fields ──
        if (!nullable && (value === null || value === undefined || value === '')) {
            errors.push(`${key}: Required field cannot be empty`);
            continue; // Skip further validation if required field is empty
        }

        // Skip validation for null values on nullable fields
        if (value === null || value === undefined) continue;

        // Additionally reject empty strings for nullable fields (they should be null instead)
        if (value === '' && nullable) {
            errors.push(`${key}: Empty string should be null for nullable fields`);
            continue;
        }

        // ── 2. String validation ──
        if (type === 'string' || type === 'varchar' || type === 'text' || type === 'char') {
            if (typeof value !== 'string') {
                errors.push(`${key}: Expected text, got ${typeof value}`);
            } else if (value === '' && !nullable) {
                // Strictly reject empty strings for required fields
                errors.push(`${key}: Cannot be empty string`);
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

        // ── 5. Boolean validation — only accept predetermined values ──
        if (type === 'boolean' || type === 'bool') {
            if (typeof value === 'boolean') {
                // Boolean primitives are accepted
                continue;
            }
            if (typeof value === 'string') {
                const s = value.toLowerCase().trim();
                const validTrue = ['true', '1', 'yes', 'y'];
                const validFalse = ['false', '0', 'no', 'n'];
                if (!validTrue.includes(s) && !validFalse.includes(s)) {
                    errors.push(`${key}: Must be true/false. Allowed values: true, false, yes, no, 1, 0, y, n. Got "${value}"`);
                }
            } else {
                errors.push(`${key}: Boolean field must be true/false or string, got ${typeof value}`);
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

        // ── 8. Heuristic Boolean Validation (even if column inferred as string) ──
        // Detect boolean columns by name patterns like "active", "enabled", "is_*", "*_flag"
        const booleanNamePatterns = ['active', 'enabled', 'disabled', 'flag', 'is_', '_flag', 'bool', 'true', 'false', 'yes', 'no'];
        const isBooleanByName = booleanNamePatterns.some(pattern => {
            if (pattern.startsWith('_') || pattern.endsWith('_')) {
                return lowerKey.includes(pattern);
            }
            const nameRegex = new RegExp(`(^|_)${pattern}(_|$)`);
            return nameRegex.test(lowerKey);
        });

        if (isBooleanByName && type !== 'boolean' && type !== 'bool') {
            // Field looks like a boolean but was inferred as something else
            if (typeof value === 'string') {
                const s = value.toLowerCase().trim();
                const validTrue = ['true', '1', 'yes', 'y'];
                const validFalse = ['false', '0', 'no', 'n'];
                if (!validTrue.includes(s) && !validFalse.includes(s)) {
                    errors.push(`${key}: Looks like a boolean field. Must be true/false. Allowed: true, false, yes, no, 1, 0, y, n. Got "${value}"`);
                }
            } else if (typeof value !== 'boolean' && typeof value !== 'number') {
                errors.push(`${key}: Looks like a boolean field. Expected boolean/string, got ${typeof value}`);
            }
        }
    }

    return [...new Set(errors)];
};

// ─────────────────────────────────────────────────────────────
// DTS Engine
// ─────────────────────────────────────────────────────────────

class DTSEngineStream extends Transform {
    constructor(datasetId, inferredSchema = []) {
        super({ objectMode: true });

        this.datasetId = datasetId;
        this.dlqBuffer = [];

        this.schemaMap = {};

        for (const col of inferredSchema) {
            const normalizedColName = String(col.name || '').toLowerCase();
            this.schemaMap[normalizedColName] = {
                cleanerFn: resolveCleanerForColumn(col),
                nullable: col.nullable === true, // ─ Default to required (non-nullable) ─
                type: col.type || col.dataType,
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
            const lowerKey = key.toLowerCase();
            const colMeta = this.schemaMap[lowerKey];

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

        // ─ Condition Check: Row has usable values before semantic validation ─
        if (hasNoUsableValue(cleanedRow)) {
            this.dlqBuffer.push({
                datasetId: this.datasetId,
                rowNumber: this.dlqBuffer.length + 1,
                rawData: chunk,
                cleanedData: cleanedRow,
                errorMessages: ['Row contains no usable values'],
                status: 'UNFIXABLE'
            });
            console.log(`[DTS] Row rejected: no usable values`);
            return callback();
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
            const lowerKey = key.toLowerCase();
            const colMeta = engine.schemaMap[lowerKey];

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

        // 2. Check if row has any usable values (condition check before semantic validation)
        if (hasNoUsableValue(cleanedRow)) {
            invalidRows.push({
                rawData: row,
                cleanedData: cleanedRow,
                errors: ['Row contains no usable values']
            });
            continue;
        }

        // 3. Semantic Validation
        const semanticErrors = semanticValidateRow(cleanedRow, engine.schemaMap);

        // 4. DLQ Decision
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

    // ─ Condition 1: Check row is not empty ─
    const entries = Object.entries(candidateData);
    if (entries.length === 0) {
        return ['Row is empty'];
    }

    // ─ Condition 2: Check for at least one non-null/non-empty value ─
    const hasUsableValue = entries.some(([_, value]) =>
        value !== null && value !== undefined && value !== ''
    );
    if (!hasUsableValue) {
        return ['Row has no usable values'];
    }

    // ─ Condition 3: Type and format validation ─
    for (const [key, value] of entries) {
        // Skip null/empty for now - they may be allowed
        if (value === null || value === undefined || value === '') {
            continue;
        }

        const lowerKey = key.toLowerCase();

        // Check numeric fields
        if (typeof value === 'string') {
            if (looksNumericByName(lowerKey)) {
                const numValue = parseFloat(value);
                if (isNaN(numValue)) {
                    errors.push(`${key}: Expected numeric value, got "${value}"`);
                }
            }
        }

        // Check boolean fields - only accept predetermined values
        if (lowerKey.includes('bool') || lowerKey.includes('active') || lowerKey.includes('enabled') || lowerKey.includes('flag')) {
            if (typeof value !== 'boolean' && typeof value !== 'string') {
                errors.push(`${key}: Boolean fields must be boolean or string, got ${typeof value}`);
            }
            if (typeof value === 'string') {
                const s = value.toLowerCase().trim();
                const validValues = ['true', 'false', '1', '0', 'yes', 'no', 'y', 'n'];
                if (!validValues.includes(s)) {
                    errors.push(`${key}: Invalid boolean value. Allowed: ${validValues.join(', ')}`);
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
        const lowerKey = key.toLowerCase();
        const colMeta = schemaMap[lowerKey];
        const type = colMeta?.type?.toLowerCase();

        // Handle null/undefined
        if (value === null || value === undefined) {
            cleanedValue = null;
        }
        // Handle strings
        else if (typeof value === 'string') {
            const trimmed = value.trim();
            if (trimmed === '') {
                // ── Convert empty strings to null for proper validation ──
                cleanedValue = null;
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
                    // String type - but check if it looks numeric or boolean by field name
                    const lowerKey = key.toLowerCase();
                    
                    if (looksNumericByName(lowerKey)) {
                        // Looks numeric - try to convert
                        const numValue = parseFloat(trimmed);
                        cleanedValue = isNaN(numValue) ? trimmed : numValue;
                    } else {
                        // Regular string - just trim
                        cleanedValue = trimmed;
                    }
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