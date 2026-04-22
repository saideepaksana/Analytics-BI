/**
 * rawExportWorker.js
 */

const path = require("path");
const fs = require("fs");
const CleanRecord = require("../../../models/CleanRecord");
const Metadata = require("../../../models/Metadata");
const { ExportLog } = require("../../../models/exportLog");
const ExcelJS = require("exceljs");
const { format: formatCsv } = require("fast-csv");
const { flattenObject } = require("../utils/exportUtils");
const logger = require("../../../core/logger");

// Namespacing: /tmp/exports/raw
const EXPORT_DIR = path.join(__dirname, "../../../../tmp/exports/raw");

const runRawExport = async (job) => {
    const { datasetId, format, context, userId } = job.data;
    const jobId = job.id;
    
    if (!fs.existsSync(EXPORT_DIR)) {
        fs.mkdirSync(EXPORT_DIR, { recursive: true });
    }

    const filename = `export_${datasetId}_${Date.now()}.${format === "excel" ? "xlsx" : "csv"}`;
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
            format,
            status: "processing",
            exportedBy: userId || "anonymous",
            filename
        });

        const query = { datasetId };
        if (context.filters && Object.keys(context.filters).length > 0) {
            Object.entries(context.filters).forEach(([key, val]) => {
                query[`data.${key}`] = val;
            });
        }

        const cursor = CleanRecord.find(query).batchSize(100).cursor();
        
        if (format === "excel") {
            const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: writeStream });
            const sheet = workbook.addWorksheet("Data");
            const fields = context.selectedDimensions.concat(context.selectedMeasures);
            sheet.columns = fields.map(f => ({ header: f, key: f, width: 20 }));

            for await (const record of cursor) {
                const flat = flattenObject(record.data || {});
                sheet.addRow(flat).commit();
                recordCount++;
                if (recordCount % 500 === 0) await job.updateProgress(Math.min(90, 10 + (recordCount / 10000) * 10));
            }
            await workbook.commit();
        } else {
            const csvStream = formatCsv({ headers: true });
            csvStream.pipe(writeStream);
            const fields = context.selectedDimensions.concat(context.selectedMeasures);

            for await (const record of cursor) {
                const flat = flattenObject(record.data || {});
                const filtered = {};
                if (fields.length > 0) {
                    fields.forEach(f => filtered[f] = flat[f] ?? "");
                } else {
                    Object.assign(filtered, flat);
                }
                csvStream.write(filtered);
                recordCount++;
                if (recordCount % 1000 === 0) await job.updateProgress(Math.min(90, 10 + (recordCount / 10000) * 10));
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
