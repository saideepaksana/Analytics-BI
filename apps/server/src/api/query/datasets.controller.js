const Metadata = require("../../models/Metadata");
const CleanRecord = require("../../models/CleanRecord");
const DLQRecord = require("../../models/DLQRecord");
const RawRecord = require("../../models/RawRecord");
const { Worker } = require("worker_threads");
const path = require("path");
const os = require("os");
const logger = require("../../core/logger");
const { validateRow, cleanAndNormalizeRow, semanticValidateRow } = require("../../pipelines/dts/index");
const schemaValidator = require("../../core/SchemaValidator");
const { generateJsonSchema, validateCrossColumnConstraints } = require("../../core/schemaValidation");
const { isNumeric } = require("../../core/typeConstants");
const { serializeSchema, generateSchemaFingerprint } = require("../../core/schemaFormatter");
const { executeDatasetQuery } = require("./queryExecution");

const findQuarantineRowByIndexOrNumber = async (datasetId, rawIndex) => {
    const parsed = Number.parseInt(rawIndex, 10);
    if (!Number.isInteger(parsed) || parsed < 0) {
        return null;
    }

    const direct = await DLQRecord.findOne({ datasetId, rowNumber: parsed, status: "QUARANTINED" }).lean();
    if (direct) {
        return direct;
    }

    return DLQRecord.findOne({ datasetId, status: "QUARANTINED" })
        .sort({ rowNumber: 1 })
        .skip(parsed)
        .lean();
};

const VALIDATION_WORKER_FILE = path.join(__dirname, "../../pipelines/parser/validationWorker.js");
const DEFAULT_WORKERS = Number(process.env.PARSER_WORKERS || Math.max(1, Math.min(os.cpus().length, 2)));

const upsertCleanRecords = async (docs = []) => {
    if (!Array.isArray(docs) || docs.length === 0) {
        return;
    }

    try {
        // Fast path: bulk insert. ordered: false ensures successful records are written even if duplicates exist.
        await CleanRecord.insertMany(docs, { ordered: false });
    } catch (error) {
        // Idempotency: Ignore duplicate key errors implicitly (job retry)
        const isDuplicateError = error.code === 11000 || (error.name === "MongoBulkWriteError" && error.writeErrors?.every(e => e.code === 11000));
        if (!isDuplicateError) {
            throw error;
        }
    }
};


// ─ Helper: Build schema map from metadata schema array ─
const buildSchemaMap = (metadataSchema = []) => {
    const schemaMap = {};
    for (const col of metadataSchema) {
        const normalizedColName = String(col.name || '').toLowerCase();
        schemaMap[normalizedColName] = {
            type: (col.type || col.dataType)?.toLowerCase(),
            nullable: col.nullable === true, // ─ Respect the explicit nullable flag (default is false/required) ─
            constraints: col.constraints || {}
        };
    }
    return schemaMap;
};

// GET /api/datasets
exports.listDatasets = async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit, 10) || 100, 500);

        const datasets = await Metadata.find({})
            .sort({ createdAt: -1 })
            .limit(limit)
            .select("datasetId fileName mode rowCount quarantinedCount createdAt updatedAt")
            .lean();

        return res.json({ datasets });
    } catch (error) {
        logger.error(`listDatasets error: ${error.message}`, "Datasets");
        return res.status(500).json({ message: "Internal server error" });
    }
};

// GET /api/datasets/:datasetId/metadata?limit=N&offset=N
exports.getDatasetMetadata = async (req, res) => {
    try {
        const { datasetId } = req.params;
        const previewLimit = Math.min(parseInt(req.query.limit) || 25, 500);
        const previewOffset = Math.max(parseInt(req.query.offset) || 0, 0);

        const metadata = await Metadata.findOne({ datasetId }).lean();
        if (!metadata) {
            return res.status(404).json({ message: "Dataset not found" });
        }

        const [previewDocs, quarantinedDocs] = await Promise.all([
            CleanRecord.find({ datasetId })
                .sort({ rowNumber: 1 })
                .skip(previewOffset)
                .limit(previewLimit)
                .select("data rowNumber")
                .lean(),
            DLQRecord.find({ datasetId, status: "QUARANTINED" })
                .sort({ rowNumber: 1 })
                .limit(previewLimit)
                .select("rowNumber rawData errorMessages status")
                .lean(),
        ]);

        // Enrich relationships with human-readable dataset names (Zoho-style ER view)
        const rawRelationships = metadata.relationships || [];
        let enrichedRelationships = rawRelationships;

        if (rawRelationships.length > 0) {
            // Collect all unique related datasetIds (excluding the current one, which we already have)
            const relatedIds = [
                ...new Set(
                    rawRelationships.flatMap((r) => [r.fromCollection, r.toCollection]).filter(Boolean)
                ),
            ];

            // Single batch lookup → { datasetId: fileName }
            const relatedMeta = await Metadata.find({ datasetId: { $in: relatedIds } })
                .select("datasetId fileName")
                .lean();

            const nameMap = {};
            for (const m of relatedMeta) {
                nameMap[m.datasetId] = m.fileName || m.datasetId;
            }

            enrichedRelationships = rawRelationships.map((r) => ({
                fromCollection: r.fromCollection,
                fromDatasetName: nameMap[r.fromCollection] || r.fromCollection,
                fromColumn: r.fromColumn,
                toCollection: r.toCollection,
                toDatasetName: nameMap[r.toCollection] || r.toCollection,
                toColumn: r.toColumn,
                confidence: r.confidence,
            }));
        }

        return res.json({
            metadata: {
                datasetId: metadata.datasetId,
                fileName: metadata.fileName,
                mode: metadata.mode,
                rowCount: metadata.rowCount,
                quarantinedCount: metadata.quarantinedCount,
                createdAt: metadata.createdAt,
            },
            schema: metadata.schema || [],
            relationships: enrichedRelationships,
            quarantinedRows: quarantinedDocs.map((r) => ({
                _id: r._id,
                rowNumber: r.rowNumber,
                rawData: r.rawData,
                errors: r.errorMessages,
                status: r.status,
            })),
            preview: previewDocs.map((r) => r.data),
        });
    } catch (error) {
        logger.error(`getDatasetMetadata error: ${error.message}`, "Datasets");
        return res.status(500).json({ message: "Internal server error" });
    }
};

// GET /api/datasets/:datasetId/schema
// Task #232: Data Source Explorer BE — classification into dimension / measure
exports.getDatasetSchema = async (req, res) => {
    try {
        const { datasetId } = req.params;
        const metadata = await Metadata.findOne({ datasetId }).lean();
        if (!metadata) {
            return res.status(404).json({ message: "Dataset not found" });
        }

        const columns = (metadata.schema || []).map((col) => {
            const fieldType = col.type || col.dataType || "string";
            const classification = isNumeric(fieldType) ? "measure" : "dimension";

            return {
                name: col.name,
                type: fieldType,
                classification,
                nullable: col.nullable === true,
            };
        });

        return res.json({
            dataset: metadata.fileName,
            datasetId: metadata.datasetId,
            columns,
        });
    } catch (error) {
        logger.error(`getDatasetSchema error: ${error.message}`, "Datasets");
        return res.status(500).json({ message: "Internal server error" });
    }
};

exports.getDatasetSchemaCompact = async (req, res) => {
    try {
        const { datasetId } = req.params;
        const metadata = await Metadata.findOne({ datasetId }).lean();
        if (!metadata) {
            return res.status(404).json({ message: "Dataset not found" });
        }

        const compactSchema = serializeSchema(metadata.schema || []);
        const fingerprint = generateSchemaFingerprint(metadata.schema || []);

        return res.json({
            datasetId: metadata.datasetId,
            compactSchema,
            fingerprint,
            columnCount: (metadata.schema || []).length
        });
    } catch (error) {
        logger.error(`getDatasetSchemaCompact error: ${error.message}`, "Datasets");
        return res.status(500).json({ message: "Internal server error" });
    }
};

// PATCH /api/datasets/:datasetId/schema/:columnName
exports.updateSchemaColumn = async (req, res) => {
    try {
        const { datasetId, columnName } = req.params;
        const updates = req.body;

        const setObj = {};
        if (updates.type !== undefined) setObj["schema.$.type"] = updates.type;
        if (updates.role !== undefined) setObj["schema.$.role"] = updates.role;

        if (Object.keys(setObj).length === 0) {
            return res.status(400).json({ message: "No valid fields to update (type, role)" });
        }

        const result = await Metadata.findOneAndUpdate(
            { datasetId, "schema.name": columnName },
            { $set: setObj },
            { returnDocument: "after" }
        );

        if (!result) {
            return res.status(404).json({ message: "Dataset or column not found" });
        }

        return res.json({ message: "Schema updated", schema: result.schema });
    } catch (error) {
        logger.error(`updateSchemaColumn error: ${error.message}`, "Datasets");
        return res.status(500).json({ message: "Internal server error" });
    }
};

// DELETE /api/datasets/:datasetId/quarantine/:rowIndex
exports.deleteQuarantinedRow = async (req, res) => {
    try {
        const { datasetId } = req.params;
        const idx = parseInt(req.params.rowIndex);

        if (isNaN(idx) || idx < 0) {
            return res.status(404).json({ message: "Row not found" });
        }
        const row = await findQuarantineRowByIndexOrNumber(datasetId, idx);
        if (!row) {
            return res.status(404).json({ message: "Row not found" });
        }

        await DLQRecord.updateOne(
            { _id: row._id },
            {
                $set: { status: "DELETED" },
                $push: {
                    resolutionHistory: { action: "DELETED_MANUALLY", timestamp: new Date(), user: req.user?.id || "system" }
                }
            }
        );
        const meta = await Metadata.findOneAndUpdate(
            { datasetId },
            { $inc: { quarantinedCount: -1 } },
            { returnDocument: "after" }
        );

        return res.json({
            message: "Row deleted",
            quarantinedCount: Math.max(0, meta?.quarantinedCount ?? 0),
            rowCount: meta?.rowCount ?? 0,
        });
    } catch (error) {
        logger.error(`deleteQuarantinedRow error: ${error.message}`, "Datasets");
        return res.status(500).json({ message: "Internal server error" });
    }
};

// DELETE /api/datasets/:datasetId/quarantine
exports.deleteAllQuarantinedRows = async (req, res) => {
    try {
        const { datasetId } = req.params;

        await DLQRecord.updateMany(
            { datasetId, status: "QUARANTINED" },
            {
                $set: { status: "DELETED" },
                $push: { resolutionHistory: { action: "DELETED_ALL", timestamp: new Date(), user: req.user?.id || "system" } }
            }
        );
        const meta = await Metadata.findOneAndUpdate(
            { datasetId },
            { $set: { quarantinedCount: 0 } },
            { returnDocument: "after" }
        );

        return res.json({
            message: "All quarantined rows deleted",
            quarantinedCount: 0,
            rowCount: meta?.rowCount ?? 0,
        });
    } catch (error) {
        logger.error(`deleteAllQuarantinedRows error: ${error.message}`, "Datasets");
        return res.status(500).json({ message: "Internal server error" });
    }
};

// POST /api/datasets/:datasetId/quarantine/:rowIndex/validate
exports.validateQuarantinedRow = async (req, res) => {
    try {
        const { datasetId } = req.params;
        const idx = parseInt(req.params.rowIndex);
        const { updatedData } = req.body;

        if (isNaN(idx) || idx < 0) {
            return res.status(404).json({ message: "Row not found" });
        }

        const [row, metaDoc] = await Promise.all([
            findQuarantineRowByIndexOrNumber(datasetId, idx),
            Metadata.findOne({ datasetId }).lean(),
        ]);

        if (!row) {
            return res.status(404).json({ message: "Row not found" });
        }

        const dataToRestore = updatedData || row.rawData;

        // ─ Build schemaMap from metadata ─
        const schemaMap = buildSchemaMap(metaDoc?.schema || []);

        // ─ FIRST: Clean/convert the data to proper types ─
        const cleanedData = cleanAndNormalizeRow(dataToRestore, schemaMap);

        // ─ THEN: Validate against full schema (all fields) ─
        const semanticErrors = semanticValidateRow(cleanedData, schemaMap);

        if (semanticErrors.length > 0) {
            return res.status(422).json({ message: "Validation failed", errors: semanticErrors });
        }

        return res.json({ message: "Validation passed", errors: [], cleanedData });
    } catch (error) {
        logger.error(`validateQuarantinedRow error: ${error.message}`, "Datasets");
        return res.status(500).json({ message: "Internal server error" });
    }
};

// POST /api/datasets/:datasetId/quarantine/:rowIndex/restore
exports.restoreQuarantinedRow = async (req, res) => {
    try {
        const { datasetId } = req.params;
        const idx = parseInt(req.params.rowIndex);
        const { updatedData } = req.body;

        if (isNaN(idx) || idx < 0) {
            return res.status(404).json({ message: "Row not found" });
        }

        const [row, metaDoc] = await Promise.all([
            findQuarantineRowByIndexOrNumber(datasetId, idx),
            Metadata.findOne({ datasetId }).lean(),
        ]);

        if (!row) {
            return res.status(404).json({ message: "Row not found" });
        }

        const dataToRestore = updatedData || row.rawData;

        // ─ Build schemaMap from metadata ─
        const schemaMap = buildSchemaMap(metaDoc?.schema || []);

        // ─ FIRST: Clean and normalize with schema context ─
        const cleanedData = cleanAndNormalizeRow(dataToRestore, schemaMap);

        // ─ THEN: Validate against full schema (ALL fields, not just original issue) ─
        const semanticErrors = semanticValidateRow(cleanedData, schemaMap);
        if (semanticErrors.length > 0) {
            return res.status(422).json({ message: "Validation failed", errors: semanticErrors });
        }

        await CleanRecord.create({
            datasetId,
            rowNumber: row.rowNumber,
            data: cleanedData,
            sourceFileName: metaDoc?.fileName || "",
            status: "VALID",
        });

        await DLQRecord.updateOne(
            { _id: row._id },
            {
                $set: { status: "RESTORED" },
                $push: {
                    resolutionHistory: { action: "RESTORED", timestamp: new Date(), user: req.user?.id || "system" }
                }
            }
        );

        const meta = await Metadata.findOneAndUpdate(
            { datasetId },
            { $inc: { rowCount: 1, quarantinedCount: -1 } },
            { returnDocument: "after" }
        );

        return res.json({
            message: "Row restored",
            restoredData: cleanedData,
            rowCount: meta?.rowCount ?? 0,
            quarantinedCount: Math.max(0, meta?.quarantinedCount ?? 0),
        });
    } catch (error) {
        logger.error(`restoreQuarantinedRow error: ${error.message}`, "Datasets");
        return res.status(500).json({ message: "Internal server error" });
    }
};

// DELETE /api/datasets/:datasetId
exports.deleteDataset = async (req, res) => {
    try {
        const { datasetId } = req.params;

        // Verify dataset exists
        const metadata = await Metadata.findOne({ datasetId }).lean();
        if (!metadata) {
            return res.status(404).json({ message: "Dataset not found" });
        }

        // Delete all related records
        await Promise.all([
            Metadata.deleteOne({ datasetId }),
            CleanRecord.deleteMany({ datasetId }),
            DLQRecord.deleteMany({ datasetId }),
            RawRecord.deleteMany({ datasetId }),
        ]);

        return res.json({ message: "Dataset deleted successfully", datasetId });
    } catch (error) {
        logger.error(`deleteDataset error: ${error.message}`, "Datasets");
        return res.status(500).json({ message: "Internal server error" });
    }
};

// POST /api/datasets/bulk-delete
exports.bulkDeleteDatasets = async (req, res) => {
    try {
        const { datasetIds } = req.body;
        if (!Array.isArray(datasetIds) || datasetIds.length === 0) {
            return res.status(400).json({ message: "datasetIds array is required" });
        }

        logger.info(`Bulk deleting ${datasetIds.length} datasets: ${datasetIds.join(", ")}`, "Datasets");

        // Delete children first to minimize orphans if parent delete fails
        // We use deleteMany for efficiency
        const results = await Promise.allSettled([
            CleanRecord.deleteMany({ datasetId: { $in: datasetIds } }),
            DLQRecord.deleteMany({ datasetId: { $in: datasetIds } }),
            RawRecord.deleteMany({ datasetId: { $in: datasetIds } }),
        ]);

        // Check if any child deletions failed
        const failures = results.filter(r => r.status === "rejected");
        if (failures.length > 0) {
            failures.forEach(f => logger.error(`Bulk delete partial failure (children): ${f.reason}`, "Datasets"));
        }

        // Finally delete the parent metadata
        const metaResult = await Metadata.deleteMany({ datasetId: { $in: datasetIds } });

        return res.json({ 
            message: `Successfully deleted ${metaResult.deletedCount} datasets`,
            requestedCount: datasetIds.length,
            deletedCount: metaResult.deletedCount
        });
    } catch (error) {
        logger.error(`bulkDeleteDatasets error: ${error.message}`, "Datasets");
        return res.status(500).json({ message: "Internal server error" });
    }
};

// POST /api/datasets/:datasetId/quarantine/restore-all
exports.restoreAllValidQuarantinedRows = async (req, res) => {
    let workerPool = null;
    try {
        const { datasetId } = req.params;

        const metaDoc = await Metadata.findOne({ datasetId }).lean();
        const schemaMap = buildSchemaMap(metaDoc?.schema || []);

        let restoredCount = 0;
        const failedRows = [];

        const BATCH_SIZE = 500;
        const workerCount = DEFAULT_WORKERS;

        // Helper: Initialize Worker Pool
        const createPool = () => {
            const workers = [];
            const queue = [];
            const callbacks = new Map();
            let taskSeq = 0;

            const assignTask = (workerState) => {
                if (workerState.busy || queue.length === 0) return;
                const task = queue.shift();
                workerState.busy = true;
                callbacks.set(task.taskId, { resolve: task.resolve, reject: task.reject, workerState });
                workerState.worker.postMessage({
                    type: "process-batch",
                    taskId: task.taskId,
                    batchId: task.batchId,
                    rows: task.rows,
                    schemaMap
                });
            };

            for (let i = 0; i < workerCount; i++) {
                const worker = new Worker(VALIDATION_WORKER_FILE);
                const workerState = { worker, busy: false };

                worker.on("message", (msg) => {
                    const cb = callbacks.get(msg.taskId);
                    if (!cb) return;
                    callbacks.delete(msg.taskId);
                    cb.workerState.busy = false;
                    if (msg.error) cb.reject(new Error(msg.error));
                    else cb.resolve(msg);
                    assignTask(cb.workerState);
                });

                worker.on("error", (err) => {
                    const cb = Array.from(callbacks.values()).find(c => c.workerState === workerState);
                    if (cb) cb.reject(err);
                });

                workers.push(workerState);
            }

            return {
                executeBatch: (batchId, rows) => new Promise((resolve, reject) => {
                    const taskId = ++taskSeq;
                    queue.push({ taskId, batchId, rows, resolve, reject });
                    workers.forEach(assignTask);
                }),
                close: () => Promise.all(workers.map(w => w.worker.terminate()))
            };
        };

        workerPool = createPool();

        const flushBatch = async (batchResult) => {
            const { validRows = [], failedRows: batchFailed = [] } = batchResult;

            if (validRows.length > 0) {
                const cleanDocs = validRows.map((r) => ({
                    datasetId,
                    rowNumber: r.rowNumber,
                    data: r.data,
                    sourceFileName: metaDoc?.fileName || "",
                    status: "VALID",
                }));

                await upsertCleanRecords(cleanDocs);

                const validIds = validRows.map((r) => r._id);
                await DLQRecord.updateMany(
                    { _id: { $in: validIds } },
                    {
                        $set: { status: "RESTORED" },
                        $push: { resolutionHistory: { action: "BATCH_RESTORED", timestamp: new Date(), user: "system" } }
                    }
                );
                restoredCount += validRows.length;
            }

            if (batchFailed.length > 0) {
                failedRows.push(...batchFailed);
            }
        };

        const cursor = DLQRecord.find({ datasetId, status: "QUARANTINED" }).sort({ rowNumber: 1 }).lean().cursor();

        let currentBatch = [];
        let batchSeq = 0;
        const inFlight = [];

        for await (const row of cursor) {
            currentBatch.push(row);
            if (currentBatch.length >= BATCH_SIZE) {
                batchSeq++;
                const promise = workerPool.executeBatch(batchSeq, currentBatch).then(flushBatch);
                inFlight.push(promise);
                currentBatch = [];
            }

            if (inFlight.length >= workerCount * 2) {
                await Promise.race(inFlight);
            }
        }

        if (currentBatch.length > 0) {
            batchSeq++;
            inFlight.push(workerPool.executeBatch(batchSeq, currentBatch).then(flushBatch));
        }

        await Promise.all(inFlight);

        const newRowCount = (metaDoc?.rowCount ?? 0) + restoredCount;
        const newQuarantinedCount = Math.max(0, (metaDoc?.quarantinedCount ?? 0) - restoredCount);

        await Metadata.updateOne(
            { datasetId },
            { $set: { rowCount: newRowCount, quarantinedCount: newQuarantinedCount } }
        );

        return res.json({
            message: `Restored ${restoredCount} rows`,
            restoredCount,
            failedCount: failedRows.length,
            rowCount: newRowCount,
            quarantinedCount: newQuarantinedCount,
        });
    } catch (error) {
        logger.error(`restoreAllValidQuarantinedRows error: ${error.message}`, "Datasets");
        return res.status(500).json({ message: "Internal server error" });
    } finally {
        if (workerPool) await workerPool.close();
    }
};

/**
 * POST /api/datasets/:datasetId/query
 * Enhanced to support COUNT(*), configurable limits, execution timing, and contribution mode.
 */
exports.queryDatasetData = async (req, res) => {
    try {
        const { datasetId } = req.params;
        const { results, rowCount, executionTimeMs } = await executeDatasetQuery(datasetId, req.body || {});
        return res.json({
            results,
            rowCount,
            executionTimeMs
        });
    } catch (error) {
        logger.error(`queryDatasetData error: ${error.message}`, "Datasets");
        return res.status(500).json({ message: "Internal server error" });
    }
};

// POST /api/datasets/:datasetId/query/preview-stage
exports.previewGroupStage = async (req, res) => {
    try {
        const { dimensions = [], measures = [] } = req.body;
        const { buildGroupAndProjectStages } = require("./groupStageBuilder");

        // Normalize body structure if needed (similar to full query)
        const normalizedDimensions = Array.isArray(dimensions) ? dimensions : [];
        const normalizedMeasures = Array.isArray(measures) ? measures : [];

        const stages = buildGroupAndProjectStages(normalizedDimensions, normalizedMeasures);
        return res.json({
            message: "Aggregation preview generated successfully.",
            pipeline: [
                { $group: stages.groupStage },
                { $project: stages.projectStage }
            ]
        });
    } catch (err) {
        return res.status(400).json({ message: "Could not build pipeline preview", error: err.message });
    }
};

// POST /api/datasets/:datasetId/validate-payload
exports.validatePayload = async (req, res) => {
    try {
        const { datasetId } = req.params;
        const records = req.body;

        if (!Array.isArray(records)) {
            return res.status(400).json({ message: "Payload must be an array of records" });
        }

        const metadataDoc = await Metadata.findOne({ datasetId });
        if (!metadataDoc) {
            return res.status(404).json({ message: "Dataset not found" });
        }

        const jsonSchema = generateJsonSchema(metadataDoc);
        const validatorFunc = schemaValidator.compile(jsonSchema);

        const validationReport = [];
        let validCount = 0;

        for (let index = 0; index < records.length; index++) {
            const record = records[index];
            const schemaResult = validatorFunc(record);

            let crossColumnErrors = [];
            if (schemaResult.valid) {
                // Only check cross-column if schema is valid
                crossColumnErrors = await validateCrossColumnConstraints(record, metadataDoc, req.app.get('mongoose'));
            }

            if (schemaResult.valid && crossColumnErrors.length === 0) {
                validCount++;
            } else {
                validationReport.push({
                    row: index,
                    schemaErrors: schemaResult.errors,
                    crossColumnErrors
                });
            }
        }

        return res.json({
            message: "Validation complete",
            totalProcessed: records.length,
            validCount,
            errorCount: validationReport.length,
            isValid: validationReport.length === 0,
            report: validationReport.slice(0, 100)
        });
    } catch (error) {
        logger.error(`validatePayload error: ${error.message}`, "Datasets");
        return res.status(500).json({ message: "Internal server error" });
    }
};

function typesCompatible(typeA, typeB) {
    const a = String(typeA || "").toLowerCase();
    const b = String(typeB || "").toLowerCase();
    if (!a || !b || a === b) return true;
    const numeric = new Set(["number", "int", "integer", "float", "double", "decimal"]);
    const textual = new Set(["string", "text", "varchar", "char"]);
    if (numeric.has(a) && textual.has(b)) return true;
    if (textual.has(a) && numeric.has(b)) return true;
    return false;
}

// POST /api/datasets/:datasetId/relationships
exports.addRelationship = async (req, res) => {
    try {
        const { datasetId } = req.params;
        const { fromColumn, toCollection, toColumn } = req.body;

        if (!fromColumn || !toCollection || !toColumn) {
            return res.status(400).json({ message: "fromColumn, toCollection, and toColumn are required" });
        }

        const [sourceMeta, targetMeta] = await Promise.all([
            Metadata.findOne({ datasetId }).lean(),
            Metadata.findOne({ datasetId: toCollection }).lean()
        ]);

        if (!sourceMeta) return res.status(404).json({ message: `Source dataset "${datasetId}" not found` });
        if (!targetMeta) return res.status(404).json({ message: `Target dataset "${toCollection}" not found` });

        // 1. Type Compatibility Validation
        const sourceSchema = sourceMeta.schema || sourceMeta.columns || [];
        const targetSchema = targetMeta.schema || targetMeta.columns || [];
        const sourceCol = sourceSchema.find(c => c.name === fromColumn);
        const targetCol = targetSchema.find(c => c.name === toColumn);

        if (!sourceCol) return res.status(400).json({ message: `Column "${fromColumn}" not found in source dataset` });
        if (!targetCol) return res.status(400).json({ message: `Column "${toColumn}" not found in target dataset` });

        if (!typesCompatible(sourceCol.dataType || sourceCol.type, targetCol.dataType || targetCol.type)) {
            return res.status(400).json({
                message: `Incompatible types: Cannot link "${sourceCol.dataType || sourceCol.type}" to "${targetCol.dataType || targetCol.type}"`
            });
        }

        // 2. Uniqueness/Idempotency Check
        const exists = sourceMeta.relationships?.some(r =>
            (r.fromCollection === datasetId && r.toCollection === toCollection && r.fromColumn === fromColumn && r.toColumn === toColumn) ||
            (r.fromCollection === toCollection && r.toCollection === datasetId && r.fromColumn === toColumn && r.toColumn === fromColumn)
        );

        if (exists) return res.status(409).json({ message: "Relationship already exists between these columns" });

        const newRel = {
            fromCollection: datasetId,
            fromColumn,
            toCollection,
            toColumn,
            confidence: 1.0,
            source: "manual"
        };

        await Promise.all([
            Metadata.updateOne({ datasetId }, { $push: { relationships: newRel } }),
            Metadata.updateOne({ datasetId: toCollection }, { $push: { relationships: newRel } })
        ]);

        return res.json({ message: "Relationship added successfully", relationship: newRel });
    } catch (error) {
        logger.error(`addRelationship error: ${error.message}`, "Datasets");
        return res.status(500).json({ message: "Internal server error" });
    }
};

// DELETE /api/datasets/:datasetId/relationships
exports.removeRelationship = async (req, res) => {
    try {
        const { datasetId } = req.params;
        const { fromColumn, toCollection, toColumn } = req.body;

        // Symmetrical pull: Remove any edge that matches this pair in either orientation
        const pullQuery = {
            $or: [
                { fromCollection: datasetId, fromColumn, toCollection, toColumn },
                { fromCollection: toCollection, fromColumn: toColumn, toCollection: datasetId, toColumn: fromColumn }
            ]
        };

        await Promise.all([
            Metadata.updateOne({ datasetId }, { $pull: { relationships: pullQuery } }),
            Metadata.updateOne({ datasetId: toCollection }, { $pull: { relationships: pullQuery } })
        ]);

        return res.json({ message: "Relationship removed successfully" });
    } catch (error) {
        logger.error(`removeRelationship error: ${error.message}`, "Datasets");
        return res.status(500).json({ message: "Internal server error" });
    }
};
