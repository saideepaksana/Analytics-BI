/**
 * test-dts.js  —  Standalone DTS Engine Test
 *
 * Run with:  node test-dts.js
 *
 * No MongoDB needed. Mocks out DLQRecord.create so you can test
 * all the cleaning logic right now without a running server.
 *
 * Place this file in:  apps/server/src/pipelines/dts/
 */

import { Transform } from 'node:stream';

// ─── Mock DLQRecord (no MongoDB needed) ──────────────────────────────────────
const capturedDLQ = [];
const DLQRecord = {
    create: async (doc) => { capturedDLQ.push(doc); }
};

// ─── Paste your actual cleaner.js logic here (or import it if running as ESM) ─
import _ from 'lodash';
import { addDays } from 'date-fns';

const sanitizeString = (value) => {
    if (_.isNil(value) || value === '') return null;
    const stringValue = String(value).replace(/"/g, '').trim();
    return _.capitalize(stringValue);
};

const sanitizeNumber = (value) => {
    if (_.isNil(value) || value === '') return null;
    const stripped = String(value).replace(/[^0-9.\-]/g, '');
    if (stripped === '' || stripped === '-') return null; // ← bug fix
    const num = Number(stripped);
    return isNaN(num) ? null : num;
};

const sanitizeBoolean = (value) => {
    if (_.isNil(value)) return null;
    if (typeof value === 'boolean') return value;
    const s = String(value).trim().toLowerCase();
    if (['true', '1', 'yes', 'y'].includes(s)) return true;
    if (['false', '0', 'no', 'n'].includes(s)) return false;
    return null;
};

const TYPE_CLEANER_MAP = {
    string: sanitizeString, text: sanitizeString, varchar: sanitizeString, char: sanitizeString,
    number: sanitizeNumber, integer: sanitizeNumber, int: sanitizeNumber,
    float: sanitizeNumber, decimal: sanitizeNumber, double: sanitizeNumber,
    boolean: sanitizeBoolean, bool: sanitizeBoolean,
};

const parseDate = (value) => {
    const cleanValue = sanitizeString(value);
    if (_.isNil(cleanValue)) return null;
    const numericValue = Number(cleanValue);
    if (!isNaN(numericValue)) {
        const baseDate = new Date(1899, 11, 30);
        return addDays(baseDate, numericValue).toISOString();
    }
    const date = new Date(cleanValue);
    if (!isNaN(date.getTime())) return date.toISOString();
    return null;
};

const DATE_TYPES = new Set(['date', 'datetime', 'timestamp']);

const resolveCleanerForColumn = (col) => {
    const type = col.type?.toLowerCase();
    if (DATE_TYPES.has(type)) return parseDate;
    return TYPE_CLEANER_MAP[type] || null;
};

// ─── DTSEngineStream (copy of your index.js) ──────────────────────────────────
class DTSEngineStream extends Transform {
    constructor(datasetId, inferredSchema = []) {
        super({ objectMode: true });
        this.datasetId = datasetId;
        this.schemaMap = {};
        for (const col of inferredSchema) {
            this.schemaMap[col.name] = {
                cleanerFn: resolveCleanerForColumn(col),
                nullable:  col.nullable !== false,
                type:      col.type,
            };
        }
    }

    async _transform(chunk, encoding, callback) {
        const cleanedRow = {};
        const validationErrors = [];

        for (const [key, rawValue] of Object.entries(chunk)) {
            const colMeta = this.schemaMap[key];
            if (!colMeta) { cleanedRow[key] = rawValue; continue; }

            const { cleanerFn, nullable, type } = colMeta;
            let cleanedValue = cleanerFn ? cleanerFn(rawValue) : rawValue;

            if (cleanedValue === null && !nullable) {
                validationErrors.push({ column: key, type: 'missing_required_value',
                    message: `"${key}" (${type}) is required but null after cleaning.`, raw: rawValue });
            }
            if (cleanedValue === null && rawValue !== null && rawValue !== '' && nullable) {
                validationErrors.push({ column: key, type: 'unparseable_value', severity: 'warning',
                    message: `"${key}" (${type}) could not be parsed. Raw: "${rawValue}". Stored as null.`, raw: rawValue });
            }
            cleanedRow[key] = cleanedValue;
        }

        const hardErrors = validationErrors.filter(e => e.type === 'missing_required_value');
        if (hardErrors.length > 0) {
            await DLQRecord.create({
                datasetId: this.datasetId,
                rawData:   chunk,
                error:     hardErrors.map(e => e.message).join(' | '),
                status:    'UNFIXABLE',
            });
            return callback();
        }

        if (validationErrors.length > 0) {
            console.warn(`[DTS] Warnings on row:`, validationErrors.map(e => e.message));
        }
        callback(null, cleanedRow);
    }
}

// ─── TEST RUNNER ──────────────────────────────────────────────────────────────
async function runTests() {
    // Simulated schema from Role 6
    const inferredSchema = [
        { name: 'productName', type: 'string',    nullable: false },
        { name: 'price',       type: 'decimal',   nullable: false },
        { name: 'quantity',    type: 'integer',   nullable: true  },
        { name: 'date',        type: 'timestamp', nullable: true  },
        { name: 'category',    type: 'string',    nullable: true  },
        { name: 'inStock',     type: 'boolean',   nullable: true  },
    ];

    const testRows = [
        { productName: '"laptop pro"', price: '$1,299.99', quantity: '50', date: '2024-01-15', category: 'electronics', inStock: 'yes' },
        { productName: 'monitor',      price: '399.99',    quantity: '25', date: '44562',      category: 'Electronics', inStock: 'true' },
        { productName: '',             price: '50.00',     quantity: '10', date: '2024-03-01', category: 'misc',        inStock: '1'    }, // DLQ: empty required
        { productName: 'Widget',       price: null,        quantity: '5',  date: '2024-03-01', category: 'misc',        inStock: '0'    }, // DLQ: null required
        { productName: 'Gadget',       price: 'FREE',      quantity: '3',  date: '2024-03-01', category: 'misc',        inStock: 'yes'  }, // DLQ: word where number required (after bug fix)
        { productName: 'Gizmo',        price: '9.99',      quantity: 'banana', date: '2024-03-01', category: 'misc',   inStock: 'maybe'}, // Warnings but passes
        { productName: 'Item',         price: '5.00',      quantity: '1',  date: '2024-01-01', category: 'a',          inStock: 'yes', unknownField: 'raw data' }, // Unknown col passthrough
    ];

    const cleanedRows = [];

    const stream = new DTSEngineStream('dataset-test-001', inferredSchema);

    // Collect output
    stream.on('data', (row) => cleanedRows.push(row));

    // Push all rows
    for (const row of testRows) {
        stream.write(row);
    }

    // Wait for stream to finish processing
    await new Promise(resolve => stream.end(resolve));

    // ── Print results ──────────────────────────────────────────────────────────
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('  DTS ENGINE TEST RESULTS');
    console.log('═══════════════════════════════════════════════════════\n');

    console.log(`Input rows:    ${testRows.length}`);
    console.log(`Clean output:  ${cleanedRows.length} rows`);
    console.log(`DLQ records:   ${capturedDLQ.length} rows\n`);

    console.log('── Cleaned Rows ──────────────────────────────────────');
    cleanedRows.forEach((r, i) => console.log(`Row ${i+1}:`, r));

    console.log('\n── DLQ Records ───────────────────────────────────────');
    capturedDLQ.forEach((r, i) => console.log(`DLQ ${i+1}:  ${r.error}`));

    console.log('\n═══════════════════════════════════════════════════════\n');
}

runTests().catch(console.error);