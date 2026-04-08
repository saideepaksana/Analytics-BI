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

const findQuarantineRowByIndexOrNumber = async (datasetId, rawIndex) => {
  const parsed = Number.parseInt(rawIndex, 10);
  if (!Number.isInteger(parsed) || parsed < 0) {
    return null;
  }

  const direct = await DLQRecord.findOne({ datasetId, rowNumber: parsed }).lean();
  if (direct) {
    return direct;
  }

  return DLQRecord.findOne({ datasetId })
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
      DLQRecord.find({ datasetId })
        .sort({ rowNumber: 1 })
        .limit(previewLimit)
        .select("rowNumber rawData errorMessages status")
        .lean(),
    ]);

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
      relationships: metadata.relationships || [],
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

    const typeClassification = {
      measure: ["int", "float", "number", "decimal", "double", "numeric", "real", "long"],
      dimension: ["string", "text", "categorical", "bool", "boolean", "date", "timestamp", "time"],
    };

    const isNumeric = (type = "") => typeClassification.measure.some((t) => type.toLowerCase().includes(t));

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

    await DLQRecord.deleteOne({ _id: row._id });
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

    await DLQRecord.deleteMany({ datasetId });
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

    await DLQRecord.deleteOne({ _id: row._id });

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
        await DLQRecord.deleteMany({ _id: { $in: validIds } });
        restoredCount += validRows.length;
      }

      if (batchFailed.length > 0) {
        failedRows.push(...batchFailed);
      }
    };

    const cursor = DLQRecord.find({ datasetId }).sort({ rowNumber: 1 }).lean().cursor();

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
    const startTime = Date.now();
    const { datasetId } = req.params;
    const {
      dimensions,
      measures,
      filters,
      orderBy,
      sortBy,
      raw = false,
      rowLimit = 10000,
      seriesLimit = 0,
      contributionMode = "none"
    } = req.body || {};

    const normalizedDimensions = Array.isArray(dimensions) ? dimensions : [];
    const normalizedMeasures = Array.isArray(measures) ? measures : [];
    const normalizedFilters = Array.isArray(filters) ? filters : [];
    const normalizedOrderBy = Array.isArray(orderBy) ? orderBy : [];
    const normalizedSortBy = Array.isArray(sortBy) ? sortBy : [];

    if (!datasetId) return res.status(400).json({ message: "datasetId is required" });

    const metadataDoc = await Metadata.findOne({ datasetId }).select("schema").lean();
    const schemaMap = buildSchemaMap(metadataDoc?.schema || []);

    const effectiveRowLimit = Math.min(Math.max(parseInt(rowLimit, 10) || 10000, 1), 50000);
    const effectiveSeriesLimit = Math.max(parseInt(seriesLimit, 10) || 0, 0);

    const pipeline = [];
    const matchStage = { datasetId };
    let metricKeys = [];

    const isNumericType = (t = "") => /(int|float|number|decimal|double|long|short|numeric|real)/i.test(t);
    const isDateType = (t = "") => /(date|time|timestamp)/i.test(t);
    const isBooleanType = (t = "") => /(bool|boolean)/i.test(t);

    const coerceValue = (value, columnType = "", operator = "=") => {
      if (value === null || value === undefined) return value;

      const raw = typeof value === "string" ? value.trim() : value;

      if (isBooleanType(columnType)) {
        if (raw === true || raw === false) return raw;
        if (String(raw).toLowerCase() === "true") return true;
        if (String(raw).toLowerCase() === "false") return false;
      }

      if (isNumericType(columnType) || [">", ">=", "<", "<="].includes(operator)) {
        const num = Number(raw);
        if (!Number.isNaN(num) && Number.isFinite(num)) return num;
      }

      if (isDateType(columnType)) {
        const dt = new Date(raw);
        if (!Number.isNaN(dt.getTime())) return dt;
      }

      return raw;
    };

    normalizedFilters.forEach(f => {
      if (f.field && f.operator) {
        const key = `data.${f.field}`;
        const columnType = schemaMap[String(f.field).toLowerCase()]?.type || "";
        const typedValue = coerceValue(f.value, columnType, f.operator);

        if (f.operator === "=" || f.operator === "==") {
          if (typedValue !== f.value) {
            matchStage[key] = { $in: [typedValue, f.value] };
          } else {
            matchStage[key] = typedValue;
          }
        }
        else if (f.operator === "!=") {
          if (typedValue !== f.value) {
            matchStage[key] = { $nin: [typedValue, f.value] };
          } else {
            matchStage[key] = { $ne: typedValue };
          }
        }
        else if (f.operator === ">") matchStage[key] = { $gt: typedValue };
        else if (f.operator === ">=") matchStage[key] = { $gte: typedValue };
        else if (f.operator === "<") matchStage[key] = { $lt: typedValue };
        else if (f.operator === "<=") matchStage[key] = { $lte: typedValue };
        else if (f.operator === "IN") {
          const values = Array.isArray(f.value)
            ? f.value
            : String(f.value || "")
                .split(",")
                .map((v) => v.trim())
                .filter(Boolean);
          const typedValues = values.map((v) => coerceValue(v, columnType, "IN"));
          const merged = [...new Set([...values, ...typedValues])];
          if (merged.length > 0) matchStage[key] = { $in: merged };
        } else if (f.operator === "NOT IN") {
          const values = Array.isArray(f.value)
            ? f.value
            : String(f.value || "")
                .split(",")
                .map((v) => v.trim())
                .filter(Boolean);
          const typedValues = values.map((v) => coerceValue(v, columnType, "NOT IN"));
          const merged = [...new Set([...values, ...typedValues])];
          if (merged.length > 0) matchStage[key] = { $nin: merged };
        }
      }
    });

    pipeline.push({ $match: matchStage });

    if (raw) {
      // Raw mode: return individual records (for scatter plots)
      const projectStage = { _id: 0 };
      const allFields = [
        ...normalizedDimensions.map(d => (typeof d === "string" ? d : d.field)),
        ...normalizedMeasures.map(m => m.field).filter(f => f && f !== "*")
      ].filter(Boolean);
      allFields.forEach(f => { projectStage[f] = `$data.${f}`; });
      pipeline.push({ $project: projectStage });
      pipeline.push({ $limit: effectiveRowLimit });
    } else {
      // Aggregated mode: group and aggregate
      const { buildGroupAndProjectStages } = require("./groupStageBuilder");
      const stages = buildGroupAndProjectStages(normalizedDimensions, normalizedMeasures);
      
      metricKeys.push(...stages.metricKeys);

      pipeline.push({ $group: stages.groupStage });
      pipeline.push({ $project: stages.projectStage });

      // Sort
      const sortFields = normalizedSortBy.length > 0 ? normalizedSortBy : normalizedOrderBy;
      if (sortFields.length > 0) {
        const sortStage = {};
        sortFields.forEach(o => { if (o.field) sortStage[o.field] = o.direction === "desc" ? -1 : 1; });
        pipeline.push({ $sort: sortStage });
      }

      // Series limit (if > 0, limit number of distinct groups)
      if (effectiveSeriesLimit > 0) {
        pipeline.push({ $limit: effectiveSeriesLimit });
      } else {
        pipeline.push({ $limit: effectiveRowLimit });
      }
    }

    const results = await CleanRecord.aggregate(pipeline);

    // Contribution mode: calculate percentage of total
    let processedResults = results;
    if (contributionMode === "row" && metricKeys.length > 0) {
      const totals = {};
      metricKeys.forEach(k => {
        totals[k] = results.reduce((sum, r) => sum + (Number(r[k]) || 0), 0);
      });
      processedResults = results.map(r => {
        const row = { ...r };
        metricKeys.forEach(k => {
          if (totals[k] !== 0) {
            row[k] = Number(((Number(r[k]) || 0) / totals[k] * 100).toFixed(2));
          }
        });
        return row;
      });
    }

    const executionTimeMs = Date.now() - startTime;
    return res.json({
      results: processedResults,
      rowCount: processedResults.length,
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

    const jsonSchema = metadataDoc.toJSONSchema();
    const validatorFunc = schemaValidator.compile(jsonSchema);
    
    const validationReport = [];
    let validCount = 0;
    
    records.forEach((record, index) => {
      const result = validatorFunc(record);
      if (result.valid) {
        validCount++;
      } else {
        validationReport.push({
          row: index,
          errors: result.errors
        });
      }
    });

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
