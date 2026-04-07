/**
 * Date Truncation Utilities
 * Leverages MongoDB's $dateTrunc operator for time-series grouping.
 */

const VALID_BUCKETS = ["hour", "day", "week", "month", "quarter", "year"];

/**
 * Builds a $dateTrunc expression for MongoDB aggregation pipelines.
 * @param {string} field - The path to the date field (e.g., "$data.timestamp")
 * @param {string} bucket - The truncation unit (e.g., "month")
 * @param {string} timezone - Target timezone (default: "UTC")
 * @returns {Object} MongoDB $dateTrunc expression
 */
const buildDateTruncExpr = (field, bucket, timezone = "UTC") => {
    if (!VALID_BUCKETS.includes(bucket)) {
        throw new Error(`Invalid timeBucket: ${bucket}. Valid options are ${VALID_BUCKETS.join(', ')}`);
    }

    return {
        $dateTrunc: {
            date: { $toDate: field },
            unit: bucket,
            timezone: timezone
        }
    };
};

module.exports = {
    VALID_BUCKETS,
    buildDateTruncExpr
};
