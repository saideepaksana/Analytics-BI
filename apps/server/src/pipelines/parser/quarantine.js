/**
 * Quarantine helper – routes corrupt / unparseable rows into the Dead-Letter Queue.
 *
 * A row is quarantined when:
 *   - A required field is missing or null
 *   - A value cannot be cast to its expected type
 *   - An unexpected parsing error occurs for that row
 *
 * Each quarantined row is persisted as a DLQRecord document so it can
 * be reviewed, fixed, or exported from the Data Review UI.
 */

const DLQRecord = require('../../models/DLQRecord');

/**
 * Send a single row to the Dead-Letter Queue.
 *
 * @param {string} datasetId  ID that links the DLQ record to its dataset.
 * @param {Object} rawRow     The original, unparsed row object.
 * @param {string} reason     Human-readable explanation of why it was quarantined.
 * @returns {Promise<void>}
 */
async function quarantineRow(datasetId, rawRow, reason) {
    try {
        await DLQRecord.create({
            datasetId,
            rawData: rawRow,
            error: reason,
            status: 'UNFIXABLE'
        });
        console.warn(`[Quarantine] Row quarantined for dataset "${datasetId}": ${reason}`);
    } catch (err) {
        console.error(`[Quarantine] Failed to persist DLQ record: ${err.message}`);
    }
}

/**
 * Validate a parsed row against a set of column descriptors and quarantine
 * it if any violations are found.
 *
 * @param {string}   datasetId  Dataset identifier.
 * @param {Object}   row        Parsed row object.
 * @param {Object[]} columns    Array of column descriptors (name, type, nullable).
 * @returns {Promise<boolean>}  true if the row is clean, false if quarantined.
 */
async function validateAndQuarantine(datasetId, row, columns) {
    const errors = [];

    for (const col of columns) {
        const value = row[col.name];
        const isEmpty = value === null || value === undefined || value === '';

        if (!col.nullable && isEmpty) {
            errors.push(`Column "${col.name}" is required but missing`);
            continue;
        }

        if (!isEmpty) {
            if ((col.type === 'integer' || col.type === 'decimal') && isNaN(Number(value))) {
                errors.push(`Column "${col.name}" expects numeric value, got "${value}"`);
            }
        }
    }

    if (errors.length > 0) {
        await quarantineRow(datasetId, row, errors.join('; '));
        return false;
    }

    return true;
}

module.exports = { quarantineRow, validateAndQuarantine };
