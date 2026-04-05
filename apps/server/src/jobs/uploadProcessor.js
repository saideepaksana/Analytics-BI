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
const logger = require("../core/logger");

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

    emitProgress(uploadId, { stage: "parsing", progress: 35, datasetId });

    let schema = mode === "append" ? (existingMeta?.schema || []) : null;
    let totalCleanCount = 0;
    let totalDlqCount = 0;
    let currentRowOffset = rowBase;
    let currentSchema = null;
    let totalParsedCount = 0;

    let parseQuarantineRows = [];
    try {
      const result = await processGridFsFile({
        gridFsFileId: sourceFileId,
        originalFileName: safeFileName,
        getSchema: () => currentSchema, // Pass schema to workers for parallel transformation
        onBatch: async (batchWrappers) => {
          const allTransformed = batchWrappers.every(w => w.transformed);
          const rawBatch = batchWrappers.map(w => w.data);

          totalParsedCount += rawBatch.length;

          // 1. Initial Schema Inference (if not yet done)
          if (!schema || schema.length === 0) {
            emitProgress(uploadId, { stage: "schema", progress: 55, datasetId });
            const inferredColumns = classifyAllColumns(rawBatch, rawBatch.length);
            schema = inferredColumns.map((column) => ({
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
            
            // Set currentSchema to activate parallel transformation in workers for remaining batches
            currentSchema = schema;
          }

          // 2. Data Insertion
          let cleanDocs = [];
          if (allTransformed) {
            // Already cleaned and validated in worker threads!
            cleanDocs = rawBatch.map((data, index) => ({
              datasetId,
              rowNumber: currentRowOffset + index + 1,
              data,
              sourceFileName: safeFileName,
              status: "VALID"
            }));
          } else {
            // Manual transformation (usually only for the first batch)
            const { validRows, invalidRows } = transformRows(rawBatch, datasetId, schema);
            
            cleanDocs = validRows.map((data, index) => ({
              datasetId,
              rowNumber: currentRowOffset + index + 1,
              data,
              sourceFileName: safeFileName,
              status: "VALID"
            }));

            const dlqDocs = invalidRows.map((row, index) => ({
              datasetId,
              rowNumber: currentRowOffset + validRows.length + index + 1,
              rawData: row.rawData,
              errorMessages: row.errors || ["Validation failed"],
              status: "QUARANTINED"
            }));

            if (dlqDocs.length > 0) {
              await DLQRecord.insertMany(dlqDocs);
              totalDlqCount += dlqDocs.length;
            }
          }

          if (cleanDocs.length > 0) {
            await CleanRecord.insertMany(cleanDocs);
            totalCleanCount += cleanDocs.length;
          }

          currentRowOffset += rawBatch.length;
        }
      });
      parseQuarantineRows = result.parseQuarantineRows || [];
    } catch (parseError) {
      throw new PermanentError(`File parsing failed for ${safeFileName}: ` + parseError.message);
    }

    emitProgress(uploadId, { stage: "quarantine", progress: 82, datasetId });

    const structuralDlqDocs = parseQuarantineRows.map((row, index) => ({
      datasetId,
      rowNumber: currentRowOffset + index + 1,
      rawData: row.rawData,
      errorMessages: row.errors || ["Structural parse error"],
      status: "QUARANTINED"
    }));

    if (structuralDlqDocs.length > 0) {
      await DLQRecord.insertMany(structuralDlqDocs);
      totalDlqCount += structuralDlqDocs.length;
    }

    const totalInvalidCount = parseQuarantineRows.length + (totalDlqCount - structuralDlqDocs.length);


    const updatedRowCount = (existingMeta?.rowCount || 0) + totalCleanCount;
    const updatedQuarantineCount = (existingMeta?.quarantinedCount || 0) + totalDlqCount;
    const finalSchema = schema && schema.length > 0 ? schema : existingMeta?.schema || [];

    emitProgress(uploadId, { stage: "saving", progress: 92, datasetId });
    await Metadata.findOneAndUpdate(
      { datasetId },
      {
        $set: {
          datasetId,
          fileName: safeFileName,
          mode,
          schema: finalSchema,
          rowCount: mode === "append" ? updatedRowCount : totalCleanCount,
          quarantinedCount: mode === "append" ? updatedQuarantineCount : totalDlqCount,
          sourceFileId,
          inferenceStatus: "complete",
          inferenceError: null
        }
      },
      { upsert: true }
    );

    emitProgress(uploadId, { stage: "relationships", progress: 96, datasetId });
    try {
      await refreshDatasetRelationships(datasetId, explicitlyRelatedDatasets);
    } catch (relationshipError) {
      logger.warn(`Relationship mapping refresh failed: ${relationshipError.message}`, "Upload");
    }

    emitProgress(uploadId, { stage: "done", progress: 100, datasetId });

    return {
      status: "success",
      datasetId,
      rowCount: mode === "append" ? updatedRowCount : totalCleanCount,
      quarantinedCount: mode === "append" ? updatedQuarantineCount : totalDlqCount,
    };
  } catch (error) {
    emitProgress(uploadId, { stage: "failed", progress: 100, detail: error.message });
    
    // Finalize Metadata with failure status
    try {
      await Metadata.updateOne(
        { datasetId },
        { 
          $set: { 
            inferenceStatus: "failed", 
            inferenceError: error.message 
          } 
        }
      );
    } catch (metaErr) {
      logger.error(`Failed to update error status in Metadata: ${metaErr.message}`, "Upload");
    }

    throw error;
  }
};
