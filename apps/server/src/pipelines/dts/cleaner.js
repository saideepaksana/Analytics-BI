// ─── String Cleaner ───────────────────────────────────────────────────────────
// Code 1's quote-stripping + capitalize, but Code 2's stricter null-on-empty-trim
const sanitizeString = (value) => {
    if (value == null || value === '') return null;
    const trimmed = String(value).replace(/"/g, '').trim();
    return trimmed === '' ? null : trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
};

// ─── Number Cleaner ───────────────────────────────────────────────────────────
// Code 1's currency stripping + Code 2's Number.isFinite guard for already-numeric values
const sanitizeNumber = (value) => {
    if (value == null || value === '') return null;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null; // ← from Code 2
    const stripped = String(value).replace(/[^0-9.\-]/g, '');
    if (stripped === '' || stripped === '-') return null;
    const num = Number(stripped);
    return isNaN(num) ? null : num;
};

// ─── Boolean Cleaner ─────────────────────────────────────────────────────────
// Code 1 only — Code 2 has no boolean handling at all
const sanitizeBoolean = (value) => {
    if (value == null) return null;
    if (typeof value === 'boolean') return value;
    const s = String(value).trim().toLowerCase();
    if (['true', '1', 'yes', 'y'].includes(s)) return true;
    if (['false', '0', 'no', 'n'].includes(s)) return false;
    return null;
};

// ─── Generic Cleaner (new — inspired by Code 2's cleanValue) ─────────────────
// Use this ONLY when schema type is unknown. Prefers explicit type over coercion.
// Unlike Code 2, it does NOT silently coerce "123" → 123 without a type hint.
const sanitizeUnknown = (value) => {
    if (value == null || value === '') return null;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    return sanitizeString(value); // fall back to string — don't guess numeric
};



// ─── Type → Cleaner Map ───────────────────────────────────────────────────────
const TYPE_CLEANER_MAP = {
    string:    sanitizeString,
    text:      sanitizeString,
    varchar:   sanitizeString,
    char:      sanitizeString,

    number:    sanitizeNumber,
    integer:   sanitizeNumber,
    int:       sanitizeNumber,
    float:     sanitizeNumber,
    decimal:   sanitizeNumber,
    double:   sanitizeNumber,

    boolean:   sanitizeBoolean,
    bool:      sanitizeBoolean,

    unknown:   sanitizeUnknown // ← for fields Schema Inference couldn't type
};

module.exports = {
    sanitizeString,
    sanitizeNumber,
    sanitizeBoolean,
    sanitizeUnknown,
    TYPE_CLEANER_MAP
};