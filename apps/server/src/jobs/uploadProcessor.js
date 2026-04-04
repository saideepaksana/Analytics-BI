const { getBucket } = require("../core/storage");
const Metadata = require("../models/Metadata"); 
const CleanRecord = require("../models/CleanRecord"); 
const DLQRecord = require("../models/DLQRecord"); 
const { processGridFsFile } = require("../pipelines/parser/streamParser");
const { classifyAllColumns } = require("../pipelines/schema-inference/classifyColumns");
const { detectRelationships } = require("../pipelines/schema-inference/relationshipMapper");
const { transformRows } = require("../pipelines/dts/index");
const { getIO } = require("../core/socket");
const { PermanentError } = require("./retryPolicy");

const SIGNED_NUMERIC_FIELDS = new Set(["base_excess"]);

const emitProgress = (uploadId, payload) => {
  if (!uploadId) return;
  const io = getIO();
  if (io) {
    io.to(`upload:${uploadId}`).emit("upload:progress", { uploadId, ...payload });
  }
};

const normalizeColumnName = (name) => String(name || "").toLowerCase().replace(/[^a-z0-9]+/g, "_");

const hasToken = (name, tokens = []) => {
  const normalized = normalizeColumnName(name);
  return tokens.some((token) => new RegExp(`(^|_)${String(token).toLowerCase()}(_|$)`).test(normalized));
};

const isPositiveOnlyNumericField = (name) =>
  hasToken(name, ["price", "amount", "cost", "quantity", "count", "total"]);

const inferConstraints = (column) => {
  const normalized = normalizeColumnName(column.name);
  const constraints = {};

  if (["number", "decimal", "integer", "int", "float", "double"].includes(column.dataType)) {
    if (!SIGNED_NUMERIC_FIELDS.has(normalized) && isPositiveOnlyNumericField(column.name)) {
      constraints.min = 0;
    }
  }
  return constraints;
};

const getNextRowBase = async (datasetId) => {
  const latest = await CleanRecord.findOne({ datasetId }).sort({ rowNumber: -1 }).select("rowNumber").lean();
  return latest?.rowNumber || 0;
};

const refreshDatasetRelationships = async (targetDatasetId, explicitlyRelatedDatasetIds = []) => {
  if (!Array.isArray(explicitlyRelatedDatasetIds) || explicitlyRelatedDatasetIds.length === 0) return;

  const datasetsToLink = [targetDatasetId, ...explicitlyRelatedDatasetIds];
  const metadataDocs = await Metadata.find({ datasetId: { $in: datasetsToLink } })
    .select("datasetId fileName schema relationships")
    .lean();

  if (metadataDocs.length < 2) return;

  const relationshipInputs = metadataDocs
    .filter((doc) => typeof doc.datasetId === "string" && doc.datasetId.trim().length > 0)
    .map((doc) => {
      let readableName = doc.datasetId;
      if (doc.fileName && typeof doc.fileName === "string") {
        readableName = doc.fileName.replace(/\.[^/.]+$/, "");
      }
      return {
        collectionName: readableName,
        datasetId: doc.datasetId,
        columns: (doc.schema || []).map((column) => ({
          name: column.name,
          dataType: column.dataType || column.type || "string",
          sampleValues: column.sampleValues || []
        }))
      };
    });

  const detectedRelationships = detectRelationships(relationshipInputs);

  const docsToUpdate = metadataDocs.map((doc) => {
    const retainedOldEdges = (doc.relationships || []).filter((edge) => {
      const otherSide = edge.fromCollection === doc.datasetId ? edge.toCollection : edge.fromCollection;
      return !datasetsToLink.includes(otherSide);
    });

    const newEdgesForDoc = detectedRelationships
      .filter((rel) => rel.fromCollection === doc.datasetId || rel.toCollection === doc.datasetId)
      .map(({ strategy, ...safeRelationship }) => safeRelationship);

    return {
      datasetId: doc.datasetId,
      relationships: [...retainedOldEdges, ...newEdgesForDoc]
    };
  });

  await Promise.all(
    docsToUpdate.map(({ datasetId, relationships }) =>
      Metadata.updateOne({ datasetId }, { $set: { relationships } })
    )
  );
};

exports.runUploadProcessor = async (jobData) => {
  const { uploadId, datasetId, sourceFileId, mode, safeFileName, explicitlyRelatedDatasets } = jobData;

  try {
    const rowBase = mode === "append" ? await getNextRowBase(datasetId) : 0;
    const existingMeta = mode === "append" ? await Metadata.findOne({ datasetId }).lean() : null;

    // Delete old data for replace mode
    if (mode === "replace") {
      await Promise.all([
        CleanRecord.deleteMany({ datasetId }),
        DLQRecord.deleteMany({ datasetId })
      ]);
    }

    const parsedRows = [];
    emitProgress(uploadId, { stage: "parsing", progress: 35, datasetId });
    
    // Parse gridfs
    let parseQuarantineRows = [];
    try {
        const result = await processGridFsFile({
        gridFsFileId: sourceFileId,
        originalFileName: safeFileName,
        onBatch: async (batchRows) => parsedRows.push(...batchRows)
        });
        parseQuarantineRows = result.parseQuarantineRows || [];
    } catch (parseError) {
        throw new PermanentError(`File parsing failed for ${safeFileName}: ` + parseError.message);
    }
  
    const rawRows = parsedRows.map((row) => row.data || {});
    emitProgress(uploadId, { stage: "schema", progress: 55, datasetId });
    const inferredColumns = classifyAllColumns(rawRows, rawRows.length);
    const schema = inferredColumns.map((column) => ({
      name: column.name,
      type: column.dataType,
      dataType: column.dataType,
      role: column.role,
      nullable: false, 
      constraints: inferConstraints(column),
      suggestedAggregation: column.suggestedAggregation || null,
      sampleValues: column.sampleValues || [],
      nullCount: column.nullCount || 0,
      uniqueCount: column.uniqueCount || 0
    }));

    emitProgress(uploadId, { stage: "transforming", progress: 70, datasetId });
    const { validRows, invalidRows } = transformRows(rawRows, datasetId, schema);

    const totalInvalidCount = parseQuarantineRows.length + invalidRows.length;
    
    // -----------------------------------------------------------------------
    // Demonstration of #243 Retry Logic Thresholding
    // If the data quality drops below a critical threshold (e.g., > 10% bad rows
    // in this demo), we intentionally throw a non-permanent Error to simulate
    // an operational block. BullMQ will catch this, backoff, and retry 3 times.
    // If it's still failing (since the data hasn't changed), it moves to DLQ.
    // -----------------------------------------------------------------------
    if (rawRows.length > 0 && totalInvalidCount > (rawRows.length * 0.1)) {
        throw new Error(`Data Quality Check Failed: Too many invalid rows (${totalInvalidCount} out of ${rawRows.length}). Halting ingestion for retry protocol.`);
    }

    const cleanDocs = validRows.map((data, index) => ({
      datasetId,
      rowNumber: rowBase + index + 1,
      data,
      sourceFileName: safeFileName,
      status: "VALID"
    }));

    if (cleanDocs.length > 0) {
      await CleanRecord.insertMany(cleanDocs);
    }

    emitProgress(uploadId, { stage: "quarantine", progress: 82, datasetId });
    const dlqDocs = [
      ...parseQuarantineRows.map((row, index) => ({
        datasetId,
        rowNumber: rowBase + parsedRows.length + index + 1,
        rawData: row.rawData,
        errorMessages: row.errors || ["Structural parse error"],
        status: "QUARANTINED"
      })),
      ...invalidRows.map((row, index) => ({
        datasetId,
        rowNumber: rowBase + cleanDocs.length + parseQuarantineRows.length + index + 1,
        rawData: row.rawData,
        errorMessages: row.errors || ["Validation failed"],
        status: "QUARANTINED"
      }))
    ];

    if (dlqDocs.length > 0) {
      await DLQRecord.insertMany(dlqDocs);
    }

    const updatedRowCount = (existingMeta?.rowCount || 0) + cleanDocs.length;
    const updatedQuarantineCount = (existingMeta?.quarantinedCount || 0) + dlqDocs.length;
    const finalSchema = schema.length > 0 ? schema : existingMeta?.schema || [];

    emitProgress(uploadId, { stage: "saving", progress: 92, datasetId });
    await Metadata.findOneAndUpdate(
      { datasetId },
      {
        $set: {
          datasetId,
          fileName: safeFileName,
          mode,
          schema: finalSchema,
          rowCount: mode === "append" ? updatedRowCount : cleanDocs.length,
          quarantinedCount: mode === "append" ? updatedQuarantineCount : dlqDocs.length,
          sourceFileId
        }
      },
      { upsert: true }
    );

    emitProgress(uploadId, { stage: "relationships", progress: 96, datasetId });
    try {
      await refreshDatasetRelationships(datasetId, explicitlyRelatedDatasets);
    } catch (relationshipError) {
      console.warn("[Upload] Relationship mapping refresh failed:", relationshipError.message);
    }

    emitProgress(uploadId, { stage: "done", progress: 100, datasetId });

    return {
      status: "success",
      datasetId,
      rowCount: mode === "append" ? updatedRowCount : cleanDocs.length,
      quarantinedCount: mode === "append" ? updatedQuarantineCount : dlqDocs.length,
    };
  } catch (error) {
    emitProgress(uploadId, { stage: "failed", progress: 100, detail: error.message });
    throw error;
  }
};
