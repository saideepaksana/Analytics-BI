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

const runRawExport = async (job) => {
    const { datasetId, format, context, userId } = job.data;
    const jobId = job.id;
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
        
        if (meta.uploadedBy && userId !== "anonymous" && meta.uploadedBy !== userId) {
            throw new Error("Access Denied: You do not own this dataset.");
        }

        await ExportLog.create({
            datasetId,
            jobId,
            format: normalizedFormat,
            status: "processing",
            exportedBy: userId || "anonymous",
            filename
        });

        await job.updateProgress(20);

        const exportQuery = buildQueryFromContext(context);
        const { results, normalizedQuery } = await executeDatasetQuery(datasetId, exportQuery, {
            metadataDoc: meta,
        });
        const columns = getExportColumnOrder(normalizedQuery, results);
        const rows = toExportRows(results, columns);
        recordCount = rows.length;

        await job.updateProgress(60);
        
        if (normalizedFormat === "xlsx") {
            const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: writeStream });
            const sheet = workbook.addWorksheet("Data");
            sheet.columns = columns.map((field) => ({ header: field, key: field, width: 20 }));

            for (let index = 0; index < rows.length; index += 1) {
                sheet.addRow(rows[index]).commit();

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
