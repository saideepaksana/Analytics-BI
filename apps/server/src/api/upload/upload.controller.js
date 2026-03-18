const { getBucket } = require("../../core/storage");
const { Readable } = require("stream");
const XLSX = require("xlsx");
const { parse } = require("fast-csv");
const Metadata = require("../../models/Metadata");
const CleanRecord = require("../../models/CleanRecord");
const DLQRecord = require("../../models/DLQRecord");
const { processGridFsFile } = require("../../pipelines/parser/streamParser");
const { classifyAllColumns } = require("../../pipelines/schema-inference/classifyColumns");
const { transformRows } = require("../../pipelines/dts/index");
const { getIO } = require("../../core/socket");

const SIGNED_NUMERIC_FIELDS = new Set(["base_excess"]);

const emitProgress = (uploadId, payload) => {
  if (!uploadId) {
    return;
  }
  const io = getIO();
  if (!io) {
    return;
  }
  io.to(`upload:${uploadId}`).emit("upload:progress", { uploadId, ...payload });
};

const normalizeColumnName = (name) => String(name || "").toLowerCase().replace(/[^a-z0-9]+/g, "_");

const hasToken = (name, tokens = []) => {
  const normalized = normalizeColumnName(name);
  return tokens.some((token) => {
    const safe = String(token).toLowerCase();
    const pattern = new RegExp(`(^|_)${safe}(_|$)`);
    return pattern.test(normalized);
  });
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

const normalizeHeader = (value, index) => {
  const label = String(value ?? "").trim();
  return label || `column_${index + 1}`;
};

const extractHeadersFromCsvBuffer = async (buffer) => {
  const csvStream = parse({ headers: false, ignoreEmpty: true, trim: true });
  Readable.from(buffer).pipe(csvStream);

  for await (const row of csvStream) {
    const values = Array.isArray(row) ? row : Object.values(row || {});
    return values.map(normalizeHeader);
  }

  return [];
};

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

    // GridFS bucket
    let bucket;
    try {
      bucket = getBucket();
    } catch (err) {
      return res.status(503).json({
        message: "Storage not ready. Please try again in a moment.",
      });
    }

    // Basic safety check for file name.
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

    if (mode === "replace") {
      await Promise.all([
        CleanRecord.deleteMany({ datasetId }),
        DLQRecord.deleteMany({ datasetId })
      ]);
    }

    const rowBase = mode === "append" ? await getNextRowBase(datasetId) : 0;

    const parsedRows = [];
    emitProgress(uploadId, { stage: "parsing", progress: 35, datasetId });
    const { parseQuarantineRows = [] } = await processGridFsFile({
      gridFsFileId: sourceFileId,
      originalFileName: safeFileName,
      onBatch: async (batchRows) => {
        parsedRows.push(...batchRows);
      }
    });

    const rawRows = parsedRows.map((row) => row.data || {});
    emitProgress(uploadId, { stage: "schema", progress: 55, datasetId });
    const inferredColumns = classifyAllColumns(rawRows, rawRows.length);
    const schema = inferredColumns.map((column) => ({
      name: column.name,
      type: column.dataType,
      dataType: column.dataType,
      role: column.role,
      constraints: inferConstraints(column),
      suggestedAggregation: column.suggestedAggregation || null,
      sampleValues: column.sampleValues || [],
      nullCount: column.nullCount || 0,
      uniqueCount: column.uniqueCount || 0
    }));

    emitProgress(uploadId, { stage: "transforming", progress: 70, datasetId });
    const { validRows, invalidRows } = transformRows(rawRows, datasetId, schema);

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

    emitProgress(uploadId, { stage: "done", progress: 100, datasetId });
    return res.status(200).json({
      message: "File uploaded and processed successfully",
      datasetId,
      fileId: sourceFileId,
      fileName: safeFileName,
      mode,
      rowCount: mode === "append" ? updatedRowCount : cleanDocs.length,
      quarantinedCount: mode === "append" ? updatedQuarantineCount : dlqDocs.length,
      uploadId: uploadId || undefined
    });

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
