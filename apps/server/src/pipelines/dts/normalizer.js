const { addDays } = require("date-fns");
const { sanitizeString } = require("./cleaner.js");

// ─────────────────────────────────────────────────────────────
// Date / Timestamp Parser
// ─────────────────────────────────────────────────────────────
// Handles:
//   • Excel serial dates (e.g. 44562 → ISO string)
//   • Standard date strings
//   • Sanitization before parsing
// Returns null if unparseable (never invents values)

const EXCEL_EPOCH = new Date(1899, 11, 30);

// Parse dates in multiple formats and return ISO string
const parseDateWithMultipleFormats = (dateString) => {
    if (!dateString || typeof dateString !== 'string') return null;

    const trimmed = dateString.trim();
    if (!trimmed) return null;

    // Try multiple date formats: YYYY-MM-DD, YYYY/MM/DD, DD-MM-YYYY, DD/MM/YYYY, MM/DD/YYYY, MM-DD-YYYY
    const formats = [
        // ISO formats (YYYY-MM-DD, YYYY/MM/DD)
        { regex: /^(\d{4})[-/](\d{2})[-/](\d{2})$/, parts: ['year', 'month', 'day'] },
        // EU formats (DD-MM-YYYY, DD/MM/YYYY)
        { regex: /^(\d{2})[-/](\d{2})[-/](\d{4})$/, parts: ['day', 'month', 'year'] },
        // US formats (MM-DD-YYYY, MM/DD/YYYY)
        { regex: /^(\d{2})[-/](\d{2})[-/](\d{4})$/, parts: ['month', 'day', 'year'], isUS: true }
    ];

    for (const format of formats) {
        const match = trimmed.match(format.regex);
        if (match) {
            const [, first, second, third] = match;
            let year, month, day;

            if (format.parts[0] === 'year') {
                year = parseInt(first);
                month = parseInt(second);
                day = parseInt(third);
            } else if (format.isUS) {
                month = parseInt(first);
                day = parseInt(second);
                year = parseInt(third);
            } else {
                day = parseInt(first);
                month = parseInt(second);
                year = parseInt(third);
            }

            // Validate month and day ranges
            if (month < 1 || month > 12 || day < 1 || day > 31) continue;

            // Create date (month is 0-indexed in JS Date)
            const date = new Date(year, month - 1, day);

            // Verify the date was valid (catches invalid dates like Feb 30)
            if (date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day) {
                return date.toISOString();
            }
        }
    }

    // Fallback to native Date parsing
    const date = new Date(trimmed);
    if (!Number.isNaN(date.getTime())) {
        return date.toISOString();
    }

    return null;
};

const parseDate = (value) => {
    const cleanValue = sanitizeString(value);

    // Null / undefined / empty → null
    if (cleanValue == null) return null;

    // ── Excel serial number handling ──
    const numericValue = Number(cleanValue);

    if (!Number.isNaN(numericValue) && cleanValue !== "") {
        return addDays(EXCEL_EPOCH, numericValue).toISOString();
    }

    // ── Multiple date format parsing ──
    return parseDateWithMultipleFormats(cleanValue);
};

// ─────────────────────────────────────────────────────────────
// Schema-Driven Row Normalizer (Optional Utility)
// ─────────────────────────────────────────────────────────────
// Only applies transformations based on schema (NO string matching)

const DATE_TYPES = new Set(["date", "datetime", "timestamp"]);

const normalizeRowWithSchema = (row = {}, schemaMap = {}) => {
    const normalized = { ...row };

    for (const key of Object.keys(normalized)) {
        const colMeta = schemaMap[key];
        if (!colMeta) continue;

        const type = colMeta.type?.toLowerCase();

        if (DATE_TYPES.has(type)) {
            normalized[key] = parseDate(normalized[key]);
        }
    }

    return normalized;
};

module.exports = {
    parseDate,
    normalizeRowWithSchema
};