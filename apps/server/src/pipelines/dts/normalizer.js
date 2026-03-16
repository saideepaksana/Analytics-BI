import _ from "lodash";
import { addDays } from "date-fns";
import { sanitizeString } from "./cleaner.js";

// ─── Date / Timestamp Normalizer ──────────────────────────────────────────────
// Handles:
//   • Excel serial dates  (e.g. 44562  → ISO string)
//   • Standard date strings (e.g. "2024-01-15", "Jan 15 2024")
// Returns null if the value cannot be parsed — never invent a date.
export const parseDate = (value) => {
    const cleanValue = sanitizeString(value);
    if (_.isNil(cleanValue)) return null;

    const numericValue = Number(cleanValue);

    if (!isNaN(numericValue)) {
        // Excel serial date: days since 1899-12-30
        const baseDate = new Date(1899, 11, 30);
        return addDays(baseDate, numericValue).toISOString();
    }

    const date = new Date(cleanValue);
    if (!isNaN(date.getTime())) return date.toISOString();

    return null; // unparseable → DLQ candidate
};