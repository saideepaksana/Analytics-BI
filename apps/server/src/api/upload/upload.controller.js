const { getBucket } = require("../../core/storage");
const Busboy = require("busboy");
const mongoose = require("mongoose");
const { Readable } = require("stream");
const XLSX = require("xlsx");
const { parse } = require("fast-csv");
const Metadata = require("../../models/Metadata");
const { getIO } = require("../../core/socket");
const logger = require("../../core/logger");

const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024;
const allowedExtensions = new Set([".csv", ".xls", ".xlsx"]);

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

const normalizeHeader = (value, index) => {
  const label = String(value ?? "").trim();
  return label || `column_${index + 1}`;
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
    blankrows: false,
  });

  const headerValues = Array.isArray(rows[0]) ? rows[0] : [];
  return headerValues.map(normalizeHeader);
};

const getGridFsFileBuffer = async (bucket, sourceFileId) => {
  const chunks = [];

  await new Promise((resolve, reject) => {
    const stream = bucket.openDownloadStream(sourceFileId);
    stream.on("data", (chunk) => chunks.push(chunk));
    stream.on("error", reject);
    stream.on("end", resolve);
  });

  return Buffer.concat(chunks);
};

const extractIncomingHeadersFromGridFs = async (bucket, sourceFileId, originalName) => {
  const lowerName = String(originalName || "").toLowerCase();

  if (lowerName.endsWith(".csv")) {
    const stream = bucket.openDownloadStream(sourceFileId);
    const csvStream = parse({ headers: false, ignoreEmpty: true, trim: true });
    stream.pipe(csvStream);

    for await (const row of csvStream) {
      const values = Array.isArray(row) ? row : Object.values(row || {});
      stream.destroy();
      return values.map(normalizeHeader);
    }

    return [];
  }

  if (lowerName.endsWith(".xlsx") || lowerName.endsWith(".xls")) {
    const buffer = await getGridFsFileBuffer(bucket, sourceFileId);
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
  const unexpectedColumns = incomingHeaders.filter((name) => !normalizedExisting.has(normalizeColumnName(name)));

  const expectedCount = existingNames.length;
  const receivedCount = incomingHeaders.length;

  return {
    isMatch: expectedCount === receivedCount && missingColumns.length === 0 && unexpectedColumns.length === 0,
    expectedCount,
    receivedCount,
    missingColumns,
    unexpectedColumns,
  };
};

const parseUploadRequest = async (req, bucket) => {
  const busboy = Busboy({
    headers: req.headers,
    limits: { fileSize: MAX_FILE_SIZE_BYTES, files: 1, fields: 20 },
  });

  const fields = {};
  let uploadPromise = null;
  let uploadMeta = null;
  let parsingError = null;
  let sourceFileId = null;

  await new Promise((resolve, reject) => {
    busboy.on("field", (name, value) => {
      fields[name] = value;
    });

    busboy.on("file", (name, fileStream, info) => {
      if (name !== "file") {
        fileStream.resume();
        return;
      }

      const originalName = String(info?.filename || "upload.bin");
      const ext = require("path").extname(originalName).toLowerCase();
      if (!allowedExtensions.has(ext)) {
        parsingError = new Error("Invalid file type. Only CSV and Excel files are allowed.");
        fileStream.resume();
        return;
      }

      const safeFileName = originalName.replace(/[^a-zA-Z0-9.\-_]/g, "_");
      const uploadStream = bucket.openUploadStream(safeFileName, {
        metadata: {
          uploadedAt: new Date(),
          originalName,
          mimeType: info?.mimeType,
        },
      });
      sourceFileId = uploadStream.id;

      let sizeBytes = 0;
      fileStream.on("data", (chunk) => {
        sizeBytes += chunk.length;
      });

      fileStream.on("limit", () => {
        parsingError = new Error("File too large. Max size is 100MB.");
        parsingError.sourceFileId = sourceFileId;
        fileStream.unpipe(uploadStream);
        uploadStream.destroy(parsingError);
      });

      uploadPromise = new Promise((resolveUpload, rejectUpload) => {
        uploadStream.on("finish", () => {
          uploadMeta = {
            sourceFileId: uploadStream.id,
            originalName,
            safeFileName,
            mimeType: info?.mimeType || "application/octet-stream",
            sizeBytes,
          };
          resolveUpload();
        });
        uploadStream.on("error", rejectUpload);
      });

      fileStream.pipe(uploadStream);
    });

    busboy.on("error", reject);
    busboy.on("finish", resolve);
    req.pipe(busboy);
  });

  if (parsingError) {
    parsingError.sourceFileId = parsingError.sourceFileId || sourceFileId;
    throw parsingError;
  }

  if (!uploadPromise) {
    throw new Error("No file uploaded");
  }

  await uploadPromise;

  return { fields, uploadMeta };
};

exports.uploadFile = async (req, res) => {
  let uploadId = "";
  let sourceFileId = "";

  try {
    let bucket;
    try {
      bucket = getBucket();
    } catch (err) {
      return res.status(503).json({
        message: "Storage not ready. Please try again in a moment.",
      });
    }

    const { fields, uploadMeta } = await parseUploadRequest(req, bucket);

    uploadId = typeof fields.uploadId === "string" ? fields.uploadId.trim() : "";
    const validModes = ["new", "append", "replace"];
    const mode = fields.mode || "new";
    const requestedDatasetId = typeof fields.datasetId === "string" ? fields.datasetId.trim() : "";

    let explicitlyRelatedDatasets = [];
    if (fields.relatedDatasets) {
      try {
        explicitlyRelatedDatasets = JSON.parse(fields.relatedDatasets);
      } catch {
        explicitlyRelatedDatasets = [];
      }
    }

    if (!validModes.includes(mode)) {
      await bucket.delete(uploadMeta.sourceFileId).catch(() => {});
      return res.status(400).json({ message: "Invalid mode. Allowed: new, append, replace" });
    }

    if ((mode === "append" || mode === "replace") && !requestedDatasetId) {
      await bucket.delete(uploadMeta.sourceFileId).catch(() => {});
      return res.status(400).json({ message: "datasetId is required for append/replace mode" });
    }

    if (mode === "append") {
      const existingMeta = await Metadata.findOne({ datasetId: requestedDatasetId }).lean();
      if (!existingMeta) {
        await bucket.delete(uploadMeta.sourceFileId).catch(() => {});
        return res.status(404).json({ message: "Target dataset not found for append mode" });
      }

      emitProgress(uploadId, { stage: "parsing", progress: 3, datasetId: requestedDatasetId });
      const incomingHeaders = await extractIncomingHeadersFromGridFs(
        bucket,
        uploadMeta.sourceFileId,
        uploadMeta.originalName
      );
      const comparison = compareAppendColumns({
        existingSchema: existingMeta.schema || [],
        incomingHeaders,
      });

      if (!comparison.isMatch) {
        await bucket.delete(uploadMeta.sourceFileId).catch(() => {});
        const detail = `Expected ${comparison.expectedCount} columns but received ${comparison.receivedCount}.`;
        emitProgress(uploadId, { stage: "failed", progress: 100, detail: "Append blocked due to column mismatch" });
        return res.status(409).json({
          code: "APPEND_SCHEMA_MISMATCH",
          message: "Append blocked: uploaded file columns do not match the target dataset.",
          detail,
          expectedCount: comparison.expectedCount,
          receivedCount: comparison.receivedCount,
          missingColumns: comparison.missingColumns,
          unexpectedColumns: comparison.unexpectedColumns,
        });
      }
    }

    const datasetId = mode === "new" ? String(uploadMeta.sourceFileId) : requestedDatasetId;
    sourceFileId = String(uploadMeta.sourceFileId);

    await mongoose.connection.db.collection("uploads.files").updateOne(
      { _id: uploadMeta.sourceFileId },
      {
        $set: {
          metadata: {
            uploadedAt: new Date(),
            mode,
            uploadId: uploadId || undefined,
            datasetId: requestedDatasetId || undefined,
            originalName: uploadMeta.originalName,
            mimeType: uploadMeta.mimeType,
            sizeBytes: uploadMeta.sizeBytes,
          },
        },
      }
    );

    logger.info(`Uploading file: ${uploadMeta.safeFileName}, mode: ${mode}`, "Upload");
    emitProgress(uploadId, { stage: "received", progress: 15, datasetId, fileId: sourceFileId });

    const { addBackgroundTask } = require("../../jobs/queue");
    const job = await addBackgroundTask("process-upload", {
      uploadId,
      datasetId,
      sourceFileId,
      mode,
      safeFileName: uploadMeta.safeFileName,
      explicitlyRelatedDatasets,
    });

    emitProgress(uploadId, { stage: "queued", progress: 25, datasetId, fileId: sourceFileId, jobId: job.id });

    await Metadata.findOneAndUpdate(
      { datasetId },
      {
        $set: {
          datasetId,
          fileName: uploadMeta.safeFileName,
          mode,
          sourceFileId,
          inferenceStatus: "pending",
        },
      },
      { upsert: true }
    );

    return res.status(202).json({
      message: "File uploaded and queued for processing.",
      datasetId,
      fileId: sourceFileId,
      fileName: uploadMeta.safeFileName,
      mode,
      uploadId: uploadId || undefined,
      jobId: job.id,
      processing: true,
    });
  } catch (error) {
    logger.error(`Upload Controller Error: ${error.message}`, "Upload");
    const cleanupSourceFileId = sourceFileId || error?.sourceFileId;
    if (cleanupSourceFileId) {
      try {
        const bucket = getBucket();
        await bucket.delete(cleanupSourceFileId);
      } catch {
        // best-effort cleanup only
      }
    }

    const lowerMessage = String(error?.message || "").toLowerCase();

    if (lowerMessage.includes("file too large")) {
      emitProgress(uploadId, { stage: "failed", progress: 100, detail: "File too large" });
      return res.status(400).json({ message: "File too large. Max size is 100MB." });
    }

    if (lowerMessage.includes("invalid file type")) {
      emitProgress(uploadId, { stage: "failed", progress: 100, detail: "Invalid file type" });
      return res.status(400).json({ message: "Invalid file type. Only CSV and Excel files are allowed." });
    }

    if (lowerMessage.includes("can't find end of central directory")) {
      emitProgress(uploadId, { stage: "failed", progress: 100, detail: "Invalid Excel file" });
      return res.status(400).json({
        message: "Invalid or corrupted Excel file. Please re-save as .xls/.xlsx and upload again.",
      });
    }

    emitProgress(uploadId, { stage: "failed", progress: 100, detail: "Internal server error" });
    return res.status(500).json({ message: "Internal server error" });
  }
};
