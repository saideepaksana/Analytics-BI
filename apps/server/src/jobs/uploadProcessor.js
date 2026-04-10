const { getBucket } = require("../core/storage");
const Metadata = require("../models/Metadata");
const CleanRecord = require("../models/CleanRecord");
const DLQRecord = require("../models/DLQRecord");
const { processGridFsFile } = require("../pipelines/parser/streamParser");
const { classifyAllColumns, inferConstraints } = require("../pipelines/schema-inference/classifyColumns");
const { peekFirstRows } = require("../pipelines/parser/filePeeker");
const { detectRelationships } = require("../pipelines/schema-inference/relationshipMapper");
const { transformRows, resolveCleanerForColumn } = require("../pipelines/dts/index");
const { getIO } = require("../core/socket");
const { PermanentError } = require("./retryPolicy");
const logger = require("../core/logger");

/**
 * Bulk upsert clean records to ensure idempotency on job retries.
 */
const upsertCleanRecords = async (docs = []) => {
  if (!Array.isArray(docs) || docs.length === 0) {
    return;
  }

  try {
    // Switch to native driver for maximum performance (bypasses Mongoose document overhead)
    await CleanRecord.collection.insertMany(docs, { ordered: false });
  } catch (error) {
    // Idempotency: Ignore duplicate key errors implicitly (job retry)
    const isDuplicateError = error.code === 11000 || (error.name === "MongoBulkWriteError" && error.writeErrors?.every(e => e.code === 11000));
    if (!isDuplicateError) {
      throw error;
    }
  }
};

/**
 * Bulk upsert DLQ records to ensure idempotency on job retries.
 */
const upsertDlqRecords = async (docs = []) => {
  if (!Array.isArray(docs) || docs.length === 0) {
    return;
  }

  try {
    // Switch to native driver for maximum performance
    await DLQRecord.collection.insertMany(docs, { ordered: false });
  } catch (error) {
    // Idempotency: Ignore duplicate key errors implicitly (job retry)
    const isDuplicateError = error.code === 11000 || (error.name === "MongoBulkWriteError" && error.writeErrors?.every(e => e.code === 11000));
    if (!isDuplicateError) {
      throw error;
    }
  }
};


const emitProgress = (uploadId, payload) => {
  if (!uploadId) return;
  const io = getIO();
  if (io) {
    // 1. Target the specific upload room (legacy behavior)
    io.to(`upload:${uploadId}`).emit("upload:progress", { uploadId, ...payload });

    // 2. Global monitoring for the Ingestion page
    io.emit("background-tasks:update", { uploadId, ...payload });

    // 3. User notification on completion
    if (payload.stage === "complete") {
      io.emit("background-tasks:completed", {
        uploadId,
        datasetId: payload.datasetId,
        fileName: payload.fileName || "Unnamed Dataset",
      });
    }
  }
};

const getNextRowBase = async (datasetId) => {
  const latest = await CleanRecord.findOne({ datasetId }).sort({ rowNumber: -1 }).select("rowNumber").lean();
  return latest?.rowNumber || 0;
};

const buildSchemaMap = (metadataSchema = []) => {
  const schemaMap = {};
  metadataSchema.forEach((col) => {
    const normalizedName = String(col.name || "").toLowerCase();
    schemaMap[normalizedName] = {
      ...col,
      cleanerFn: resolveCleanerForColumn ? resolveCleanerForColumn(col) : null,
      nullable: col.nullable === true,
      constraints: col.constraints || {},
      type: col.type || col.dataType,
    };
  });
  return schemaMap;
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
    // 1. Keep relationships to datasets NOT involved in this refresh
    const unrelatedEdges = (doc.relationships || []).filter((edge) => {
      const otherSide = edge.fromCollection === doc.datasetId ? edge.toCollection : edge.fromCollection;
      return !datasetsToLink.includes(otherSide);
    });

    // 2. Keep MANUALLY created relationships (confidence: 1.0) even if they ARE in the refresh set
    const manualEdges = (doc.relationships || []).filter((edge) => {
      const isInRefresh = datasetsToLink.includes(edge.fromCollection === doc.datasetId ? edge.toCollection : edge.fromCollection);
      return isInRefresh && edge.confidence === 1.0;
    });

    // 3. Get new inferred edges from the relationship mapper
    const newInferredEdges = detectedRelationships
      .filter((rel) => rel.fromCollection === doc.datasetId || rel.toCollection === doc.datasetId)
      .map(({ strategy, ...safeRelationship }) => safeRelationship);

    // 4. Merge (Avoid duplicates: manual link takes precedence over inferred link for the same column pair)
    const combined = [...unrelatedEdges, ...manualEdges];
    
    newInferredEdges.forEach(inferred => {
      const isDuplicate = combined.some(existing => 
        existing.fromCollection === inferred.fromCollection &&
        existing.toCollection === inferred.toCollection &&
        existing.fromColumn === inferred.fromColumn &&
        existing.toColumn === inferred.toColumn
      );
      if (!isDuplicate) {
        combined.push(inferred);
      }
    });

    return {
      datasetId: doc.datasetId,
      relationships: combined
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

    // --- STEP 1: Pre-Infer Schema (Fast Peek) ---
    if (mode !== "append" || !schema || schema.length === 0) {
      emitProgress(uploadId, { stage: "schema", progress: 45, datasetId });
      try {
        const { rows: peekRows } = await peekFirstRows(sourceFileId, safeFileName, 500);
        if (peekRows.length > 0) {
          const inferredColumns = classifyAllColumns(peekRows, peekRows.length);
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
          currentSchema = schema;
          emitProgress(uploadId, { stage: "parsing", progress: 50, datasetId });
        }
      } catch (peekError) {
        logger.warn(`Peek-inference failed for ${safeFileName}: ${peekError.message}. Falling back to on-the-fly inference.`, "UploadProcessor");
      }
    } else {
      currentSchema = schema;
    }

    try {
      await processGridFsFile({
        gridFsFileId: sourceFileId,
        originalFileName: safeFileName,
        getSchema: () => currentSchema, // Pass schema to workers for parallel transformation
        onQuarantine: async (quarantineBatch) => {
          const structuralDlqDocs = quarantineBatch.map((row) => ({
            datasetId,
            rowNumber: row.rowNumber,
            rawData: row.rawData,
            errorMessages: row.errors || ["Structural parse error"],
            errorCategory: "structural",
            severity: "high",
            suggestion: "Check column alignment and raw file format",
            status: "QUARANTINED",
            createdAt: new Date(),
            updatedAt: new Date(),
          }));
          if (structuralDlqDocs.length > 0) {
            await upsertDlqRecords(structuralDlqDocs);
            totalDlqCount += structuralDlqDocs.length;
          }
        },
        onBatch: async (batchWrappers) => {
          const allTransformed = batchWrappers.every(w => w.transformed);
          totalParsedCount += batchWrappers.length;

          let cleanDocs = [];
          if (allTransformed) {
            // Already cleaned and validated in worker threads (best performance!)
            cleanDocs = batchWrappers.map((wrapper, index) => ({
              datasetId,
              rowNumber: wrapper.rowNumber || (currentRowOffset + index + 1),
              data: wrapper.data,
              sourceFileName: safeFileName,
              status: "VALID",
              createdAt: new Date(),
              updatedAt: new Date(),
            }));
          } else {
            // Manual transformation fallback (used for first batch if peek failed)
            const rawRows = batchWrappers.map(w => w.data);

            // If schema still missing, infer it from this first batch
            if (!schema || schema.length === 0) {
              const inferredColumns = classifyAllColumns(rawRows, rawRows.length);
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
              currentSchema = schema;
            }

            const { validRows, invalidRows } = transformRows(rawRows, datasetId, schema);

            cleanDocs = validRows.map((data, index) => ({
              datasetId,
              rowNumber: currentRowOffset + index + 1,
              data,
              sourceFileName: safeFileName,
              status: "VALID",
              createdAt: new Date(),
              updatedAt: new Date(),
            }));

            if (invalidRows.length > 0) {
              const dlqDocs = invalidRows.map((row, index) => ({
                datasetId,
                rowNumber: currentRowOffset + validRows.length + index + 1,
                rawData: row.rawData,
                errorMessages: row.errors || ["Validation failed"],
                errorCategory: "validation",
                severity: "medium",
                suggestion: "Review typing constraints and nullability rules for affected cells",
                status: "QUARANTINED",
                createdAt: new Date(),
                updatedAt: new Date(),
              }));
              await upsertDlqRecords(dlqDocs);
              totalDlqCount += dlqDocs.length;
            }
          }

          if (cleanDocs.length > 0) {
            await upsertCleanRecords(cleanDocs);
            totalCleanCount += cleanDocs.length;
          }

          currentRowOffset += batchWrappers.length;

          // Granular progress reporting (throttled by batch size)
          const baseProgress = 50;
          const processingShare = 32; // from 50% to 82%
          // Since we dont know total rows yet, we use a logarithmic scale or just emit counts
          emitProgress(uploadId, { 
              stage: "parsing", 
              progress: Math.min(81, baseProgress + Math.floor(Math.log10(totalParsedCount + 1) * 5)), 
              datasetId, 
              detail: `processed-${totalParsedCount}-rows` 
          });
        }
      });
      emitProgress(uploadId, { stage: "quarantine", progress: 82, datasetId });
    } catch (parseError) {
      throw new PermanentError(`File parsing failed for ${safeFileName}: ` + parseError.message);
    }

    const updatedRowCount = (existingMeta?.rowCount || 0) + totalCleanCount;
    const updatedQuarantineCount = (existingMeta?.quarantinedCount || 0) + totalDlqCount;
    const finalSchema = schema && schema.length > 0 ? schema : existingMeta?.schema || [];

    emitProgress(uploadId, { stage: "transforming", progress: 90, datasetId, detail: "finalizing-records" });
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

    emitProgress(uploadId, { stage: "persisted", progress: 96, datasetId });
    try {
      await refreshDatasetRelationships(datasetId, explicitlyRelatedDatasets);
    } catch (relationshipError) {
      logger.warn(`Relationship mapping refresh failed: ${relationshipError.message}`, "Upload");
    }

    emitProgress(uploadId, { stage: "complete", progress: 100, datasetId, fileName: safeFileName });

    return {
      status: "success",
      datasetId,
      rowCount: mode === "append" ? updatedRowCount : totalCleanCount,
      quarantinedCount: mode === "append" ? updatedQuarantineCount : totalDlqCount,
    };
  } catch (error) {
    emitProgress(uploadId, { stage: "failed", progress: 100, detail: error.message });
    try {
      await Metadata.updateOne(
        { datasetId },
        { $set: { inferenceStatus: "failed", inferenceError: error.message } }
      );
    } catch (metaErr) {
      logger.error(`Failed to update error status in Metadata: ${metaErr.message}`, "Upload");
    }
    throw error;
  }
};
