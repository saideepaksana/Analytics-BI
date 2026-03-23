const sanitizeString = (value) => {
    if (value == null || value === '') return null;
    const trimmed = String(value).replace(/"/g, '').trim();
    return trimmed === '' ? null : trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
};

const sanitizeNumber = (value) => {
    if (value == null || value === '') return null;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null; // ← from Code 2
    const stripped = String(value).replace(/[^0-9.\-]/g, '');
    if (stripped === '' || stripped === '-') return null;
    const num = Number(stripped);
    return isNaN(num) ? null : num;
};


const sanitizeBoolean = (value) => {
    if (value == null) return null;
    if (typeof value === 'boolean') return value;
    const s = String(value).trim().toLowerCase();
    if (['true', '1', 'yes', 'y'].includes(s)) return true;
    if (['false', '0', 'no', 'n'].includes(s)) return false;
    return null;
};

const sanitizeUnknown = (value) => {
    if (value == null || value === '') return null;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    return sanitizeString(value); // fall back to string — don't guess numeric
};



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

    unknown:   sanitizeUnknown 
};

module.exports = {
    sanitizeString,
    sanitizeNumber,
    sanitizeBoolean,
    sanitizeUnknown,
    TYPE_CLEANER_MAP
};