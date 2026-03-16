/**
 * Stream Parser – Parses CSV and Excel files into row objects.
 *
 * - CSV  : streamed through fast-csv for memory-efficient processing
 * - Excel: loaded via ExcelJS; first sheet is iterated row-by-row
 *
 * Each row is emitted as a plain JS object keyed by the column header
 * taken from the first row of the file.
 *
 * Usage:
 *   const { parseBuffer } = require('./streamParser');
 *   const rows = await parseBuffer(buffer, 'data.csv');
 */

const { parse } = require('fast-csv');
const ExcelJS = require('exceljs');
const { Readable } = require('stream');
const { quarantineRow } = require('./quarantine');

/**
 * Parse a CSV buffer and return an array of row objects.
 *
 * @param {Buffer} buffer      Raw file buffer.
 * @param {string} datasetId   Used to quarantine corrupt rows.
 * @returns {Promise<Object[]>}
 */
function parseCSV(buffer, datasetId) {
    return new Promise((resolve, reject) => {
        const rows = [];

        const stream = Readable.from(buffer.toString());

        stream
            .pipe(
                parse({
                    headers: true,
                    ignoreEmpty: true,
                    trim: true,
                    skipLines: 0,
                })
            )
            .on('data', (row) => rows.push(row))
            .on('data-invalid', async (row, rowNumber, reason) => {
                console.warn(`[StreamParser] Invalid CSV row #${rowNumber}: ${reason}`);
                await quarantineRow(datasetId, row, reason);
            })
            .on('error', (err) => reject(new Error(`CSV parse error: ${err.message}`)))
            .on('end', () => resolve(rows));
    });
}

/**
 * Parse an Excel buffer (xlsx/xls) and return an array of row objects
 * from the first worksheet.
 *
 * @param {Buffer} buffer      Raw file buffer.
 * @param {string} datasetId   Used to quarantine corrupt rows.
 * @returns {Promise<Object[]>}
 */
async function parseExcel(buffer, datasetId) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);

    const worksheet = workbook.worksheets[0];
    if (!worksheet) {
        throw new Error('Excel file contains no worksheets');
    }

    const rows = [];
    let headers = [];

    worksheet.eachRow((row, rowNumber) => {
        const values = row.values.slice(1); // ExcelJS row.values is 1-indexed

        if (rowNumber === 1) {
            headers = values.map((h, i) => (h ? String(h).trim() : `col_${i + 1}`));
            return;
        }

        const rowObj = {};
        headers.forEach((header, i) => {
            const cell = values[i];
            // Unwrap ExcelJS rich-text or formula results
            if (cell && typeof cell === 'object' && cell.result !== undefined) {
                rowObj[header] = cell.result;
            } else if (cell && typeof cell === 'object' && cell.text !== undefined) {
                rowObj[header] = cell.text;
            } else {
                rowObj[header] = cell !== undefined ? cell : null;
            }
        });

        rows.push(rowObj);
    });

    return rows;
}

/**
 * Detect file type from extension and parse the buffer accordingly.
 *
 * @param {Buffer} buffer      Raw file buffer.
 * @param {string} fileName    Original file name (used to detect extension).
 * @param {string} datasetId   Used to quarantine corrupt rows.
 * @returns {Promise<Object[]>}
 */
async function parseBuffer(buffer, fileName, datasetId = 'unknown') {
    const ext = fileName.split('.').pop().toLowerCase();

    if (ext === 'csv') {
        return parseCSV(buffer, datasetId);
    }

    if (ext === 'xlsx' || ext === 'xls') {
        return parseExcel(buffer, datasetId);
    }

    throw new Error(`Unsupported file type: .${ext}. Supported formats: csv, xlsx, xls`);
}

module.exports = { parseBuffer, parseCSV, parseExcel };
