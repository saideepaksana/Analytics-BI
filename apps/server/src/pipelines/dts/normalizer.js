const _ = require("lodash");
const { addDays } = require("date-fns");
const { sanitizeString } = require("./cleaner");

const parseDate = (value) => {
    const cleanValue = sanitizeString(value);

    if (_.isNil(cleanValue)) {
        return null;
    }

    const numericValue = Number(cleanValue);

    // Convert Excel serial dates
    if (!isNaN(numericValue)) {
        const baseDate = new Date(1899, 11, 30);
        return addDays(baseDate, numericValue).toISOString();
    } else {
        // Standard date parsing
        const date = new Date(cleanValue);
        if (!isNaN(date.getTime())) {
            return date.toISOString();
        } else {
            return null;
        }
    }
};

module.exports = { parseDate };