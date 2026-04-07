/**
 * MongoDB Aggregation Group Stage Builder
 * Translates dimensions, measures, and timeBuckets into an optimized $group structure.
 */
const { buildDateTruncExpr } = require("../../pipelines/query/dateTruncation");

/**
 * Builds a MongoDB $group and $project stage based on query configuration.
 * @param {Array} dimensions - Array of grouping categories (e.g., [{ field: "category" }, { field: "createdAt", timeBucket: "month" }])
 * @param {Array} measures - Array of metrics (e.g., [{ field: "price", aggregation: "SUM" }])
 * @returns {Object} { groupStage, projectStage, metricKeys }
 */
const buildGroupAndProjectStages = (dimensions = [], measures = []) => {
    const groupStage = { _id: {} };
    const metricKeys = [];

    // 1. Process Dimensions
    dimensions.forEach(dim => {
        const fieldMap = typeof dim === "string" ? { field: dim } : dim;
        const f = fieldMap.field;
        
        if (f) {
            if (fieldMap.timeBucket) {
                // Time-Series $dateTrunc support
                groupStage._id[f] = buildDateTruncExpr(`$data.${f}`, fieldMap.timeBucket, fieldMap.timezone || "UTC");
            } else {
                // Standard dimension
                groupStage._id[f] = `$data.${f}`;
            }
        }
    });

    // 2. Process Measures
    measures.forEach(m => {
        const agg = (m.aggregation || "SUM").toUpperCase();
        
        if (m.field === "*" || agg === "COUNT") {
            const outputKey = m.label || "COUNT(*)"; 
            groupStage[outputKey] = { $sum: 1 };
            metricKeys.push(outputKey);
        } else if (m.field) {
            const outputKey = m.label || m.field;
            if (agg === "SUM") groupStage[outputKey] = { $sum: `$data.${m.field}` };
            else if (agg === "AVG") groupStage[outputKey] = { $avg: `$data.${m.field}` };
            else if (agg === "MIN") groupStage[outputKey] = { $min: `$data.${m.field}` };
            else if (agg === "MAX") groupStage[outputKey] = { $max: `$data.${m.field}` };
            else groupStage[outputKey] = { $sum: `$data.${m.field}` };
            
            metricKeys.push(outputKey);
        }
    });

    // Handle completely empty groups (just do a global count)
    if (Object.keys(groupStage._id).length === 0 && metricKeys.length === 0) {
        groupStage["count"] = { $sum: 1 };
        metricKeys.push("count");
    }

    // 3. Build $project stage cleanly
    const projectStage = { _id: 0 };
    Object.keys(groupStage._id).forEach(k => { projectStage[k] = `$_id.${k}`; });
    metricKeys.forEach(k => { projectStage[k] = 1; });

    return { groupStage, projectStage, metricKeys };
};

module.exports = {
    buildGroupAndProjectStages
};
