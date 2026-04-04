const { TYPE_CLEANER_MAP } = require('./cleaner.js');
const { parseDate } = require('./normalizer.js');

const DATE_TYPES = new Set(['date', 'datetime', 'timestamp']);
const POSITIVE_ONLY_NUMERIC_TOKENS = ['price', 'amount', 'cost', 'quantity', 'count', 'total', 'id'];

const hasNameToken = (key, tokens = []) => {
    const normalized = String(key || '').toLowerCase().replace(/[^a-z0-9]+/g, '_');
    return tokens.some((token) => {
        const safe = String(token).toLowerCase();
        const pattern = new RegExp(`(^|_)${safe}(_|$)`);
        return pattern.test(normalized);
    });
};

const isPositiveOnlyNumericField = (key) => hasNameToken(key, POSITIVE_ONLY_NUMERIC_TOKENS);

const resolveCleanerForColumn = (schemaColumn) => {
    const type = (schemaColumn.type || schemaColumn.dataType)?.toLowerCase();
    
    if (DATE_TYPES.has(type)) return parseDate;
    
    if (type === 'mixed') {
        const role = String(schemaColumn.role || '').toLowerCase();
        if (role === 'measure') return TYPE_CLEANER_MAP.number;
        
        const samples = schemaColumn.sampleValues || [];
        let numericCount = 0;
        let booleanCount = 0;
        let stringCount = 0;
        
        for (const val of samples) {
            if (typeof val === 'number') numericCount++;
            else if (typeof val === 'boolean') booleanCount++;
            else if (typeof val === 'string') {
                if (!isNaN(parseFloat(val)) && isFinite(val)) numericCount++;
                else if (['true', 'false', '1', '0', 'yes', 'no', 'y', 'n'].includes(val.toLowerCase())) booleanCount++;
                else stringCount++;
            }
        }
        
        if (numericCount > booleanCount && numericCount > stringCount) return TYPE_CLEANER_MAP.number;
        else if (booleanCount > stringCount) return TYPE_CLEANER_MAP.boolean;
        else return TYPE_CLEANER_MAP.string;
    }
    
    return TYPE_CLEANER_MAP[type] || null;
};

const semanticValidateRow = (row, schemaMap) => {
    const errors = [];

    for (const [key, value] of Object.entries(row)) {
        const lowerKey = key.toLowerCase();
        const meta = schemaMap[lowerKey];

        if (!meta) continue;

        const { type, nullable, constraints = {} } = meta;

        if (!nullable && (value === null || value === undefined || value === '')) {
            errors.push(`${key}: Required field cannot be empty`);
            continue;
        }

        if (value === null || value === undefined) continue;

        if (value === '' && nullable) {
            errors.push(`${key}: Empty string should be null for nullable fields`);
            continue;
        }

        if (type === 'string' || type === 'varchar' || type === 'text' || type === 'char') {
            if (typeof value !== 'string') {
                errors.push(`${key}: Expected text, got ${typeof value}`);
            } else if (value === '' && !nullable) {
                errors.push(`${key}: Cannot be empty string`);
            }
        }

        if (type === 'decimal' || type === 'number' || hasNameToken(lowerKey, ['price', 'amount'])) {
            if (typeof value !== 'number') {
                errors.push(`${key}: Expected number, got ${typeof value}`);
            } else if (!Number.isFinite(value)) {
                errors.push(`${key}: Invalid number value`);
            } else {
                const enforceDefaultNonNegative = constraints.min === undefined && isPositiveOnlyNumericField(lowerKey);
                const min = constraints.min !== undefined ? constraints.min : (enforceDefaultNonNegative ? 0 : undefined);
                const max = constraints.max;
                if (min !== undefined && value < min) {
                    errors.push(`${key}: Cannot be negative or less than ${min}`);
                }
                if (max !== undefined && value > max) {
                    errors.push(`${key}: Exceeds maximum ${max}`);
                }
            }
        }

        if (type === 'integer' || hasNameToken(lowerKey, ['quantity', 'count'])) {
            if (!Number.isInteger(value)) {
                errors.push(`${key}: Must be whole number, got ${value}`);
            } else {
                const enforceDefaultNonNegative = constraints.min === undefined && isPositiveOnlyNumericField(lowerKey);
                const min = constraints.min !== undefined ? constraints.min : (enforceDefaultNonNegative ? 0 : undefined);

                if (min !== undefined && value < min) {
                    errors.push(`${key}: Cannot be negative or less than ${min}`);
                }
                if (constraints.max !== undefined && value > constraints.max) {
                    errors.push(`${key}: Exceeds maximum ${constraints.max}`);
                }
            }
        }

        if (type === 'boolean' || type === 'bool') {
            if (typeof value === 'boolean') continue;
            if (typeof value === 'string') {
                const s = value.toLowerCase().trim();
                const validTrue = ['true', '1', 'yes', 'y'];
                const validFalse = ['false', '0', 'no', 'n'];
                if (!validTrue.includes(s) && !validFalse.includes(s)) {
                    errors.push(`${key}: Must be true/false. Got "${value}"`);
                }
            } else {
                errors.push(`${key}: Boolean field must be true/false or string, got ${typeof value}`);
            }
        }

        if (DATE_TYPES.has(type)) {
            if (!(value instanceof Date) && typeof value !== 'string') {
                errors.push(`${key}: Expected date format, got ${typeof value}`);
            } else if (typeof value === 'string') {
                const parsed = new Date(value);
                if (isNaN(parsed.getTime())) {
                    errors.push(`${key}: Invalid date format "${value}"`);
                }
            }
        }

        if (constraints.enum && !constraints.enum.includes(value)) {
            errors.push(`${key}: "${value}" is not valid. Allowed: ${constraints.enum.join(', ')}`);
        }
    }

    return [...new Set(errors)];
};

const hasNoUsableValue = (normalizedData) => {
    if (!normalizedData || typeof normalizedData !== 'object') return true;
    for (const value of Object.values(normalizedData)) {
        if (value !== null && value !== undefined && value !== '') return false;
    }
    return true;
};

const transformRow = (row, schemaMap) => {
    const cleanedRow = {};
    const structuralErrors = [];
    const warnings = [];

    for (const [key, rawValue] of Object.entries(row)) {
        const lowerKey = key.toLowerCase();
        const colMeta = schemaMap[lowerKey];

        if (!colMeta) {
            cleanedRow[key] = rawValue;
            continue;
        }

        const { cleanerFn, nullable } = colMeta;
        let cleanedValue = cleanerFn ? cleanerFn(rawValue) : rawValue;

        if (cleanedValue === null && !nullable) {
            structuralErrors.push(`${key}: Required field cannot be empty`);
        } else if (cleanedValue === null && rawValue !== null && rawValue !== '' && rawValue !== undefined && nullable) {
            warnings.push(`${key}: Could not parse "${rawValue}"`);
        }

        cleanedRow[key] = cleanedValue;
    }

    if (hasNoUsableValue(cleanedRow)) {
        return { 
            isValid: false, 
            errors: ['Row contains no usable values'], 
            cleanedRow 
        };
    }

    const semanticErrors = semanticValidateRow(cleanedRow, schemaMap);
    const allErrors = [...structuralErrors, ...semanticErrors];

    return {
        isValid: allErrors.length === 0,
        errors: allErrors,
        warnings,
        cleanedRow
    };
};

module.exports = {
    resolveCleanerForColumn,
    semanticValidateRow,
    transformRow,
    hasNoUsableValue
};
