const { getBucket } = require("../../core/storage"); //Gets GridFS storage bucket
const { Readable } = require("stream"); //Converts buffer → stream 
const XLSX = require("xlsx"); //Reads Excel files
const { parse } = require("fast-csv"); //Reads CSV files
const Metadata = require("../../models/Metadata"); 
const CleanRecord = require("../../models/CleanRecord"); 
const DLQRecord = require("../../models/DLQRecord"); 
//MongoDB models:
//Metadata → dataset info
//CleanRecord → valid rows
//DLQRecord → invalid rows (Dead Letter Queue)
const { processGridFsFile } = require("../../pipelines/parser/streamParser"); //Parses file from GridFS → gives rows.
const { classifyAllColumns } = require("../../pipelines/schema-inference/classifyColumns");  //Detects column types (number, string..etc)
const { detectRelationships } = require("../../pipelines/schema-inference/relationshipMapper"); //Finds relationships between datasets.
const { transformRows } = require("../../pipelines/dts/index"); //Validates + transforms rows.
const { getIO } = require("../../core/socket"); //for real-time progress updates

//Some numeric fields can be negative
const SIGNED_NUMERIC_FIELDS = new Set(["base_excess"]);


//Sends progress updates to frontend like 50% or 90%
//If no uploadId → skip.
const emitProgress = (uploadId, payload) => {
  if (!uploadId) {
    return;
  }
  const io = getIO();
  if (!io) {
    return;
  }
  //If socket not ready → skip.
  io.to(`upload:${uploadId}`).emit("upload:progress", { uploadId, ...payload });
};

//"eg : Total Amount ($)" → "total_amount"
//Used for matching columns.
const normalizeColumnName = (name) => String(name || "").toLowerCase().replace(/[^a-z0-9]+/g, "_");

//Checks if column contains words like "price" or "amount".
const hasToken = (name, tokens = []) => {
  const normalized = normalizeColumnName(name);
  return tokens.some((token) => {
    const safe = String(token).toLowerCase();
    const pattern = new RegExp(`(^|_)${safe}(_|$)`); //Ensures exact match
    return pattern.test(normalized);
  });
};

//These fields must be ≥ 0 for business semantics (price, amount, cost etc.)
const isPositiveOnlyNumericField = (name) =>
  hasToken(name, ["price", "amount", "cost", "quantity", "count", "total"]);

//Derives schema constraints (min=0) for non-signed numeric fields with financial/quantity tokens.
//No constraints are added for non-numeric columns or fields in the signed exception list.
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

//Finds last row number → used for appending new rows with correct rowNumber.
const getNextRowBase = async (datasetId) => {
  const latest = await CleanRecord.findOne({ datasetId }).sort({ rowNumber: -1 }).select("rowNumber").lean();
  return latest?.rowNumber || 0;
};

//If column name missing → assign default like "column_1", "column_2"..etc based on position.
const normalizeHeader = (value, index) => {
  const label = String(value ?? "").trim();
  return label || `column_${index + 1}`;
};

//Reads first row of CSV → returns column names
const extractHeadersFromCsvBuffer = async (buffer) => {
  const csvStream = parse({ headers: false, ignoreEmpty: true, trim: true });
  Readable.from(buffer).pipe(csvStream);

  for await (const row of csvStream) {
    const values = Array.isArray(row) ? row : Object.values(row || {});
    return values.map(normalizeHeader);
  }

  return [];
};

//Detects file type → calls correct function
const extractHeadersFromWorkbookBuffer = async (buffer) => {
  const workbook = XLSX.read(buffer, { type: "buffer", raw: true });
  const firstSheetName = workbook.SheetNames[0];
  const firstSheet = firstSheetName ? workbook.Sheets[firstSheetName] : null;

  if (!firstSheet) {
    return [];
  }

  const rows = XLSX.utils.sheet_to_json(firstSheet, {
    header: 1,
    raw: true,
    defval: null,
    blankrows: false
  });

  const headerValues = Array.isArray(rows[0]) ? rows[0] : [];
  return headerValues.map(normalizeHeader);
};

const extractIncomingHeaders = async (buffer, originalName) => {
  const lowerName = String(originalName || "").toLowerCase();

  if (lowerName.endsWith(".csv")) {
    return extractHeadersFromCsvBuffer(buffer);
  }

  if (lowerName.endsWith(".xlsx") || lowerName.endsWith(".xls")) {
    return extractHeadersFromWorkbookBuffer(buffer);
  }

  throw new Error("Unsupported file format");
};

//Used in append mode
//Compare existing dataset schema column names against incoming file headers
//after normalization. Ensures count and normalized names match exactly.
//Returns boolean and details for missing/unexpected names.
const compareAppendColumns = ({ existingSchema = [], incomingHeaders = [] }) => {
  const existingNames = existingSchema
    .map((column) => column?.name)
    .filter((name) => typeof name === "string" && name.trim().length > 0)
    .map((name) => name.trim());

  const normalizedExisting = new Map(existingNames.map((name) => [normalizeColumnName(name), name]));
  const normalizedIncoming = new Map(
    incomingHeaders
      .map((name) => String(name || "").trim())
      .filter(Boolean)
      .map((name) => [normalizeColumnName(name), name])
  );

  const missingColumns = existingNames.filter((name) => !normalizedIncoming.has(normalizeColumnName(name)));
  const unexpectedColumns = incomingHeaders.filter(
    (name) => !normalizedExisting.has(normalizeColumnName(name))
  );

  const expectedCount = existingNames.length;
  const receivedCount = incomingHeaders.length;

  return {
    isMatch: expectedCount === receivedCount && missingColumns.length === 0 && unexpectedColumns.length === 0,
    expectedCount,
    receivedCount,
    missingColumns,
    unexpectedColumns
  };
};

const refreshDatasetRelationships = async (targetDatasetId, explicitlyRelatedDatasetIds = []) => {
  if (!Array.isArray(explicitlyRelatedDatasetIds) || explicitlyRelatedDatasetIds.length === 0) {
    return; // Opt-in relationship mapping: skip evaluating relationships if user didn't select any.
  }

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

  // Safely merge edges so we don't accidentally overwrite non-intersecting edges matching third-party collections
  const docsToUpdate = metadataDocs.map((doc) => {
    const retainedOldEdges = (doc.relationships || []).filter((edge) => {
      const otherSide = edge.fromCollection === doc.datasetId ? edge.toCollection : edge.fromCollection;
      return !datasetsToLink.includes(otherSide);
    });

    const newEdgesForDoc = detectedRelationships
      .filter((rel) => rel.fromCollection === doc.datasetId || rel.toCollection === doc.datasetId)
      .map((rel) => {
        const { strategy, ...safeRelationship } = rel;
        return safeRelationship;
      });

    return {
      datasetId: doc.datasetId,
      relationships: [...retainedOldEdges, ...newEdgesForDoc]
    };
  });

  await Promise.all(
    docsToUpdate.map(({ datasetId, relationships }) =>
      Metadata.updateOne(
        { datasetId },
        { $set: { relationships } }
      )
    )
  );
};

//This is the API handler(MAIN)
exports.uploadFile = async (req, res) => {
  try {
    //File check
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    //Mode validation
    const validModes = ["new", "append", "replace"];
    const mode = req.body.mode || "new";
    const uploadId = typeof req.body.uploadId === "string" ? req.body.uploadId.trim() : "";
    const requestedDatasetId =
      typeof req.body.datasetId === "string" ? req.body.datasetId.trim() : "";
      
    let explicitlyRelatedDatasets = [];
    if (req.body.relatedDatasets) {
       try {
           explicitlyRelatedDatasets = JSON.parse(req.body.relatedDatasets);
       } catch(e) { }
    }

    let existingMeta = null;

    if (!validModes.includes(mode)) {
      return res.status(400).json({
        message: "Invalid mode. Allowed: new, append, replace",
      });
    }

    if ((mode === "append" || mode === "replace") && !requestedDatasetId) {
      return res.status(400).json({
        message: "datasetId is required for append/replace mode",
      });
    }

    if (mode === "append") {
      existingMeta = await Metadata.findOne({ datasetId: requestedDatasetId }).lean();
      if (!existingMeta) {
        return res.status(404).json({
          message: "Target dataset not found for append mode",
        });
      }

      emitProgress(uploadId, { stage: "validating", progress: 3, datasetId: requestedDatasetId });
      const incomingHeaders = await extractIncomingHeaders(req.file.buffer, req.file.originalname);
      const comparison = compareAppendColumns({
        existingSchema: existingMeta.schema || [],
        incomingHeaders
      });

      if (!comparison.isMatch) {
        const detail = `Expected ${comparison.expectedCount} columns but received ${comparison.receivedCount}.`;
        emitProgress(uploadId, {
          stage: "failed",
          progress: 100,
          detail: "Append blocked due to column mismatch"
        });
        return res.status(409).json({
          code: "APPEND_SCHEMA_MISMATCH",
          message: "Append blocked: uploaded file columns do not match the target dataset.",
          detail,
          expectedCount: comparison.expectedCount,
          receivedCount: comparison.receivedCount,
          missingColumns: comparison.missingColumns,
          unexpectedColumns: comparison.unexpectedColumns
        });
      }
    }

    //Obtain GridFS bucket handle from storage core. If unavailable, return service unavailable.
    let bucket;
    try {
      bucket = getBucket();
    } catch (err) {
      return res.status(503).json({
        message: "Storage not ready. Please try again in a moment.",
      });
    }

    //Basic safety check for file name.
    const safeFileName = req.file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, "_");

    console.log(`Uploading file: ${safeFileName}, mode: ${mode}`);
    emitProgress(uploadId, { stage: "received", progress: 1 });

    // Buffer to stream.
    const readableStream = Readable.from(req.file.buffer);

    // Upload to GridFS.
    const uploadStream = bucket.openUploadStream(safeFileName, {
      metadata: {
        uploadedAt: new Date(),
        mode: mode,
        uploadId: uploadId || undefined,
        datasetId: requestedDatasetId || undefined,
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        sizeBytes: req.file.size,
      },
    });

    await new Promise((resolve, reject) => {
      readableStream.pipe(uploadStream);
      uploadStream.on("finish", resolve);
      uploadStream.on("error", reject);
    });

    const datasetId = mode === "new" ? String(uploadStream.id) : requestedDatasetId;
    const sourceFileId = String(uploadStream.id);
    emitProgress(uploadId, { stage: "stored", progress: 20, datasetId, fileId: sourceFileId });

    // ── Delegate processing to the background worker, then WAIT for it ──── //
    // We use waitUntilFinished() so the HTTP response is only sent once the   //
    // worker has fully parsed, validated, and stored the data. This restores  //
    // the original UX: Data Review is populated the moment the upload returns.//
    // BullMQ still handles retries, DLQ routing, and concurrency — the only  //
    // difference is that the client waits synchronously for the result.       //
    const { addBackgroundTask, getQueueEvents, QUEUE_NAMES } = require("../../jobs/queue");

    const job = await addBackgroundTask("process-upload", {
      uploadId,
      datasetId,
      sourceFileId,
      mode,
      safeFileName,
      explicitlyRelatedDatasets
    });

    // Wait for the worker to finish (success or final failure)
    const queueEvents = getQueueEvents(QUEUE_NAMES.BACKGROUND_TASKS);
    let jobResult;
    //Deletes old data
    if (mode === "replace") {
      await Promise.all([
        CleanRecord.deleteMany({ datasetId }),
        DLQRecord.deleteMany({ datasetId })
      ]);
    }

    const rowBase = mode === "append" ? await getNextRowBase(datasetId) : 0;

    emitProgress(uploadId, { stage: "parsing", progress: 35, datasetId });

    let schema = mode === "append" ? (existingMeta?.schema || []) : null;
    let totalCleanCount = 0;
    let totalDlqCount = 0;
    let currentRowOffset = rowBase;

    const { parseQuarantineRows = [] } = await processGridFsFile({
      gridFsFileId: sourceFileId,
      originalFileName: safeFileName,
      onBatch: async (batchRows) => {
        const rawBatch = batchRows.map((row) => row.data || {});
        
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
        }

        const { validRows, invalidRows } = transformRows(rawBatch, datasetId, schema);

        const cleanDocs = validRows.map((data, index) => ({
          datasetId,
          rowNumber: currentRowOffset + index + 1,
          data,
          sourceFileName: safeFileName,
          status: "VALID"
        }));

        if (cleanDocs.length > 0) {
          await CleanRecord.insertMany(cleanDocs);
          totalCleanCount += cleanDocs.length;
        }

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
        
        currentRowOffset += rawBatch.length;
      }
    });

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
          sourceFileId
        }
      },
      { upsert: true }
    );

    emitProgress(uploadId, { stage: "relationships", progress: 96, datasetId });
    try {
      jobResult = await job.waitUntilFinished(queueEvents, 120_000); // 2 min timeout
    } catch (jobErr) {
      // The job itself failed (exhausted retries or permanent error)
      emitProgress(uploadId, { stage: "failed", progress: 100, detail: jobErr.message });
      return res.status(500).json({
        message: "File processing failed.",
        detail: jobErr.message,
        datasetId,
        fileId: sourceFileId,
      });
    }

    return res.status(200).json({
      message: "File uploaded and processed successfully.",
      datasetId,
      fileId: sourceFileId,
      fileName: safeFileName,
      mode,
<<<<<<< HEAD
      rowCount: jobResult?.rowCount ?? 0,
      quarantinedCount: jobResult?.quarantinedCount ?? 0,
      uploadId: uploadId || undefined,
      jobId: job.id,
=======
      rowCount: mode === "append" ? updatedRowCount : totalCleanCount,
      quarantinedCount: mode === "append" ? updatedQuarantineCount : totalDlqCount,
      uploadId: uploadId || undefined
>>>>>>> 5854a3a (fixed crashing quarantine UI)
    });
      //Error handling:
//Handles:
//corrupted Excel
//internal errors
  } catch (error) {
    console.error("Upload Controller Error:", error);
    const uploadId = typeof req.body?.uploadId === "string" ? req.body.uploadId.trim() : "";

    const lowerMessage = String(error?.message || "").toLowerCase();
    if (lowerMessage.includes("can't find end of central directory")) {
      emitProgress(uploadId, { stage: "failed", progress: 100, detail: "Invalid Excel file" });
      return res.status(400).json({
        message: "Invalid or corrupted Excel file. Please re-save as .xls/.xlsx and upload again."
      });
    }

    emitProgress(uploadId, { stage: "failed", progress: 100, detail: "Internal server error" });
    return res.status(500).json({
      message: "Internal server error",
    });
  }
};
