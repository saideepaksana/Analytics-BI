import _ from "lodash";

// ─── String Cleaner ───────────────────────────────────────────────────────────
// Trims whitespace, removes stray quotes, capitalizes.
// Returns null if the value is empty/nil (safe — nulls go to DLQ if field is required).
export const sanitizeString = (value) => {
    if (_.isNil(value) || value === '') return null;
    const stringValue = String(value).replace(/"/g, '').trim();
    return _.capitalize(stringValue);
};

// ─── Number Cleaner ───────────────────────────────────────────────────────────
// Strips currency symbols / commas, then coerces to a JS number.
// Returns null if the result is NaN — we do NOT fill unknowns with random numbers.
export const sanitizeNumber = (value) => {
    if (_.isNil(value) || value === '') return null;
    // Strip common formatting: $1,234.56 → 1234.56
    const stripped = String(value).replace(/[^0-9.\-]/g, '');
    if (stripped === '' || stripped === '-') return null; // ← add this line
    const num = Number(stripped);
    return isNaN(num) ? null : num;
};

// ─── Boolean Cleaner ─────────────────────────────────────────────────────────
// Accepts: true/false, 1/0, "yes"/"no", "true"/"false" (case-insensitive).
// Returns null for anything unrecognisable — never invent a value.
export const sanitizeBoolean = (value) => {
    if (_.isNil(value)) return null;
    if (typeof value === 'boolean') return value;
    const s = String(value).trim().toLowerCase();
    if (['true', '1', 'yes', 'y'].includes(s)) return true;
    if (['false', '0', 'no', 'n'].includes(s)) return false;
    return null; // unrecognisable → DLQ candidate
};

// ─── Type → Cleaner Map ───────────────────────────────────────────────────────
// Maps the `type` strings that Role 6 (Schema Inference) writes into the
// Metadata collection to the correct cleaning function.
// "date" / "timestamp" are intentionally left out here — normalizer.js owns those.
export const TYPE_CLEANER_MAP = {
    // string-like
    string:    sanitizeString,
    text:      sanitizeString,
    varchar:   sanitizeString,
    char:      sanitizeString,

    // number-like
    number:    sanitizeNumber,
    integer:   sanitizeNumber,
    int:       sanitizeNumber,
    float:     sanitizeNumber,
    decimal:   sanitizeNumber,
    double:    sanitizeNumber,

    // boolean
    boolean:   sanitizeBoolean,
    bool:      sanitizeBoolean,
};