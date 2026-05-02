/**
 * rawExportWorker.js
 */

const path = require("path");
const fs = require("fs");
const os = require("os");
const Metadata = require("../../../models/Metadata");
const { ExportLog } = require("../../../models/exportLog");
const ExcelJS = require("exceljs");
const { format: formatCsv } = require("fast-csv");
const { flattenObject } = require("../utils/exportUtils");
const {
    executeDatasetQuery,
    mergeFilters,
    getExportColumnOrder,
} = require("../../../api/query/queryExecution");
const logger = require("../../../core/logger");

// Namespacing: /tmp/exports/raw
const EXPORT_DIR = path.join(os.tmpdir(), "analytics-bi", "exports", "raw");

const normalizeFormat = (format) => {
    const value = String(format || "").toLowerCase();
    return value === "excel" ? "xlsx" : value;
};

const buildQueryFromContext = (context = {}) => {
    if (context.query && typeof context.query === "object") {
        return {
            ...context.query,
            filters: mergeFilters(context.query.filters, context.dashboardFilters),
        };
    }

    const selectedDimensions = Array.isArray(context.selectedDimensions)
        ? context.selectedDimensions
        : [];
    const selectedMeasures = Array.isArray(context.selectedMeasures)
        ? context.selectedMeasures
        : [];

    return {
        dimensions: selectedDimensions.map((field) => ({ field })),
        measures: selectedMeasures.map((field) => ({
            field,
            aggregation: "SUM",
            label: field,
        })),
        filters: mergeFilters(context.filters, context.dashboardFilters),
        orderBy: Array.isArray(context.sort)
            ? context.sort
            : Array.isArray(context.orderBy)
                ? context.orderBy
                : [],
        raw: Boolean(context.raw),
        rowLimit: context.rowLimit,
        seriesLimit: context.seriesLimit,
        contributionMode: context.contributionMode || "none",
    };
};

const toExportRows = (results = [], columns = []) => {
    return results.map((row) => {
        const flatRow = flattenObject(row || {});

        if (!Array.isArray(columns) || columns.length === 0) {
            return flatRow;
        }

        const orderedRow = {};
        columns.forEach((column) => {
            orderedRow[column] = flatRow[column] ?? "";
        });
        return orderedRow;
    });
};

const buildHistogramExport = (results = [], query = {}) => {
    if (String(query.chartType || "").toLowerCase() !== "histogram") {
        return null;
    }

    const measures = Array.isArray(query.measures)
        ? query.measures.filter((measure) => measure?.field && measure.field !== "*")
        : [];

    if (measures.length === 0) {
        return null;
    }

    const binSize = Math.max(Number(query.binSize) || 10, 1);
    let globalMin = Infinity;
    let globalMax = -Infinity;
    const metricValues = [];

    measures.forEach((measure) => {
        const values = results
            .map((row) => Number(row?.[measure.field]))
            .filter((value) => Number.isFinite(value));

        if (values.length > 0) {
            globalMin = Math.min(globalMin, ...values);
            globalMax = Math.max(globalMax, ...values);
            metricValues.push({ measure, values });
        }
    });

    if (metricValues.length === 0) {
        return null;
    }

    const start = Math.floor(globalMin / binSize) * binSize;
    const end = Math.ceil(globalMax / binSize) * binSize;
    const binCount = Math.max(1, Math.ceil((end - start) / binSize));
    const countColumns = metricValues.map(({ measure }) => `${measure.label || measure.field} Count`);
    const rows = Array.from({ length: binCount }, (_, index) => {
        const binStart = start + index * binSize;
        const binEnd = start + (index + 1) * binSize;
        return {
            Bin: `${binStart} - ${binEnd}`,
            Start: binStart,
            End: binEnd,
            ...Object.fromEntries(countColumns.map((column) => [column, 0])),
        };
    });

    metricValues.forEach(({ measure, values }, metricIndex) => {
        const column = countColumns[metricIndex];

        values.forEach((value) => {
            const index = Math.min(binCount - 1, Math.floor((value - start) / binSize));
            rows[index][column] += 1;
        });
    });

    return {
        rows,
        columns: ["Bin", "Start", "End", ...countColumns],
    };
};

const runRawExport = async (job) => {
    const { datasetId, format, context, userId, userRole } = job.data;
    const jobId = job.id;
    const isAdmin = userRole === "admin";
    const normalizedFormat = normalizeFormat(format);
    
    if (!fs.existsSync(EXPORT_DIR)) {
        fs.mkdirSync(EXPORT_DIR, { recursive: true });
    }

    const filename = `export_${datasetId}_${Date.now()}.${normalizedFormat === "xlsx" ? "xlsx" : "csv"}`;
    const filePath = path.join(EXPORT_DIR, filename);
    const writeStream = fs.createWriteStream(filePath);

    let recordCount = 0;

    try {
        await job.updateProgress(5);
        
        const meta = await Metadata.findOne({ datasetId }).lean();
        if (!meta) throw new Error("Dataset not found.");
        
        const isOwner = meta.uploadedBy === userId || userId === "anonymous";
        if (meta.uploadedBy && !isOwner && !isAdmin) {
            throw new Error("Access Denied: You do not own this dataset.");
        }

        await ExportLog.findOneAndUpdate(
            { jobId },
            {
                $set: {
                    datasetId,
                    format: normalizedFormat,
                    status: "processing",
                    exportedBy: userId || "anonymous",
                    filename,
                    recordCount: 0,
                    exportedAt: Date.now(),
                },
                $unset: { failureReason: "" },
            },
            { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
        );

        await job.updateProgress(20);

        const exportQuery = buildQueryFromContext(context);
        // Memory Guard: Enforce a reasonable limit for standard exports to prevent OOM
        if (!exportQuery.limit || exportQuery.limit > 50000) {
            exportQuery.limit = 50000;
        }

        const { results, normalizedQuery } = await executeDatasetQuery(datasetId, exportQuery, {
            metadataDoc: meta,
        });
        const histogramExport = buildHistogramExport(results, normalizedQuery);
        const columns = histogramExport?.columns || getExportColumnOrder(normalizedQuery, results);
        const rows = histogramExport?.rows || toExportRows(results, columns);
        recordCount = rows.length;

        await job.updateProgress(60);
        
        if (normalizedFormat === "xlsx") {
            const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: writeStream });
            const sheet = workbook.addWorksheet("Data");
            sheet.columns = columns.map((field) => ({ header: field, key: field, width: 20 }));

            for (let index = 0; index < rows.length; index += 1) {
                sheet.addRow(rows[index]).commit();

                if ((index + 1) % 500 === 0) {
                    // Yield to event loop to allow lock renewal
                    await new Promise(resolve => setImmediate(resolve));
                }

                if ((index + 1) % 250 === 0 || index === rows.length - 1) {
                    const progress = rows.length === 0
                        ? 95
                        : 60 + Math.round(((index + 1) / rows.length) * 35);
                    await job.updateProgress(Math.min(progress, 95));
                }
            }

            await workbook.commit();
        } else {
            const csvStream = formatCsv({ headers: columns, alwaysWriteHeaders: true });
            csvStream.pipe(writeStream);

            for (let index = 0; index < rows.length; index += 1) {
                csvStream.write(rows[index]);

                if ((index + 1) % 500 === 0) {
                    // Yield to event loop to allow lock renewal
                    await new Promise(resolve => setImmediate(resolve));
                }

                if ((index + 1) % 500 === 0 || index === rows.length - 1) {
                    const progress = rows.length === 0
                        ? 95
                        : 60 + Math.round(((index + 1) / rows.length) * 35);
                    await job.updateProgress(Math.min(progress, 95));
                }
            }

            csvStream.end();
        }

        await new Promise((resolve, reject) => {
            writeStream.on("finish", resolve);
            writeStream.on("error", reject);
        });

        await ExportLog.findOneAndUpdate({ jobId }, {
            status: "completed",
            recordCount,
            exportedAt: Date.now()
        });

        await job.updateProgress(100);
        return { status: "completed", filename, recordCount };

    } catch (err) {
        logger.error(`Raw export failed: ${err.message}`, "RawExportWorker");
        await ExportLog.findOneAndUpdate({ jobId }, { 
            status: "failed",
            failureReason: err.message,
            filename: null 
        }).catch(() => {});

        if (fs.existsSync(filePath)) {
            try { fs.unlinkSync(filePath); } catch (e) {}
        }
        throw err;
    }
};

module.exports = { runRawExport };
