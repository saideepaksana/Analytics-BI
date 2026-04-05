const Metadata = require("../../models/Metadata");
const CleanRecord = require("../../models/CleanRecord");
const DLQRecord = require("../../models/DLQRecord");
const RawRecord = require("../../models/RawRecord");
const logger = require("../../core/logger");
const { validateRow, cleanAndNormalizeRow, semanticValidateRow } = require("../../pipelines/dts/index");

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
  try {
    const { datasetId } = req.params;

    const metaDoc = await Metadata.findOne({ datasetId }).lean();
    const schemaMap = buildSchemaMap(metaDoc?.schema || []);

    let restoredCount = 0;
    const failedRows = [];

    const BATCH_SIZE = 500;
    let batchRestored = [];
    let batchIds = [];

    const flushBatch = async () => {
      if (batchRestored.length === 0) return;
      await CleanRecord.insertMany(
        batchRestored.map((r) => ({
          datasetId,
          rowNumber: r.rowNumber,
          data: r.data,
          sourceFileName: metaDoc?.fileName || "",
          status: "VALID",
        }))
      );
      await DLQRecord.deleteMany({ _id: { $in: batchIds } });
      restoredCount += batchRestored.length;
      batchRestored = [];
      batchIds = [];
    };

    const cursor = DLQRecord.find({ datasetId }).sort({ rowNumber: 1 }).lean().cursor();

    for await (const row of cursor) {
      const sourceData =
        row.rawData && typeof row.rawData === "object" && !Array.isArray(row.rawData)
          ? row.rawData
          : {};
      const normalizedData = cleanAndNormalizeRow(sourceData, schemaMap);

      batchRestored.push({
        data: normalizedData,
        rowNumber: row.rowNumber,
      });
      batchIds.push(row._id);

      if (batchRestored.length >= BATCH_SIZE) {
        await flushBatch();
      }
    }

    await flushBatch();

    const newRowCount = (metaDoc?.rowCount ?? 0) + restoredCount;
    const newQuarantinedCount = Math.max(0, (metaDoc?.quarantinedCount ?? 0) - restoredCount);

    await Metadata.updateOne(
      { datasetId },
      { $set: { rowCount: newRowCount, quarantinedCount: newQuarantinedCount } }
    );

    return res.json({
      message: `Restored ${restoredCount} rows`,
      restoredCount: restoredCount,
      failedCount: failedRows.length,
      restoredRows: [],
      failedRows,
      rowCount: newRowCount,
      quarantinedCount: newQuarantinedCount,
    });
  } catch (error) {
    logger.error(`restoreAllValidQuarantinedRows error: ${error.message}`, "Datasets");
    return res.status(500).json({ message: "Internal server error" });
  }
};

/**
 * POST /api/datasets/:datasetId/query
 */
exports.queryDatasetData = async (req, res) => {
  try {
    const { datasetId } = req.params;
    const { dimensions = [], measures = [], filters = [], orderBy = [], raw = false } = req.body;
    if (!datasetId) return res.status(400).json({ message: "datasetId is required" });

    const pipeline = [];
    const matchStage = { datasetId };
    if (Array.isArray(filters)) {
      filters.forEach(f => {
        if (f.field && f.operator) {
          const key = `data.${f.field}`;
          if (f.operator === "=") matchStage[key] = f.value;
          else if (f.operator === ">") matchStage[key] = { $gt: f.value };
          else if (f.operator === "<") matchStage[key] = { $lt: f.value };
        }
      });
    }
    pipeline.push({ $match: matchStage });

    if (raw) {
      // Raw mode: return individual records (for scatter plots)
      const projectStage = { _id: 0 };
      const allFields = [
        ...dimensions.map(d => (typeof d === "string" ? d : d.field)),
        ...measures.map(m => m.field)
      ].filter(Boolean);
      allFields.forEach(f => { projectStage[f] = `$data.${f}`; });
      pipeline.push({ $project: projectStage });
      pipeline.push({ $limit: 1000 });
    } else {
      // Aggregated mode: group and aggregate (for bar, line, pie, area)
      const groupStage = { _id: {} };
      dimensions.forEach(dim => {
        const f = typeof dim === "string" ? dim : dim.field;
        if (f) groupStage._id[f] = `$data.${f}`;
      });
      measures.forEach(m => {
        if (m.field && m.aggregation) {
          const op = m.aggregation.toUpperCase();
          if (op === "COUNT") groupStage[m.field] = { $sum: 1 };
          else groupStage[m.field] = { [`$${op.toLowerCase()}`]: `$data.${m.field}` };
        }
      });
      if (Object.keys(groupStage._id).length === 0 && Object.keys(groupStage).length === 1) groupStage.count = { $sum: 1 };
      pipeline.push({ $group: groupStage });

      const projectStage = { _id: 0 };
      Object.keys(groupStage._id).forEach(k => { projectStage[k] = `$_id.${k}`; });
      Object.keys(groupStage).forEach(k => { if (k !== "_id") projectStage[k] = 1; });
      pipeline.push({ $project: projectStage });

      if (Array.isArray(orderBy) && orderBy.length > 0) {
        const sortStage = {};
        orderBy.forEach(o => { if (o.field) sortStage[o.field] = o.direction === "desc" ? -1 : 1; });
        pipeline.push({ $sort: sortStage });
      }
      pipeline.push({ $limit: 1000 });
    }

    const results = await CleanRecord.aggregate(pipeline);
    return res.json({ results });
  } catch (error) {
    logger.error(`queryDatasetData error: ${error.message}`, "Datasets");
    return res.status(500).json({ message: "Internal server error" });
  }
};
