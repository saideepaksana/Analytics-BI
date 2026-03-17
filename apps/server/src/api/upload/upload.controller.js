const { getBucket } = require("../../core/storage");
const { Readable } = require("stream");
const Metadata = require("../../models/Metadata");
const CleanRecord = require("../../models/CleanRecord");
const DLQRecord = require("../../models/DLQRecord");
const { processGridFsFile } = require("../../pipelines/parser/streamParser");
const { classifyAllColumns } = require("../../pipelines/schema-inference/classifyColumns");
const { transformRows } = require("../../pipelines/dts/index");

const SIGNED_NUMERIC_FIELDS = new Set(["base_excess"]);

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

    if (mode === "replace") {
      await Promise.all([
        CleanRecord.deleteMany({ datasetId }),
        DLQRecord.deleteMany({ datasetId })
      ]);
    }

    const rowBase = mode === "append" ? await getNextRowBase(datasetId) : 0;

    const parsedRows = [];
    const { parseQuarantineRows = [] } = await processGridFsFile({
      gridFsFileId: sourceFileId,
      originalFileName: safeFileName,
      onBatch: async (batchRows) => {
        parsedRows.push(...batchRows);
      }
    });

    const rawRows = parsedRows.map((row) => row.data || {});
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

    const existingMeta = mode === "append" ? await Metadata.findOne({ datasetId }).lean() : null;
    const updatedRowCount = (existingMeta?.rowCount || 0) + cleanDocs.length;
    const updatedQuarantineCount = (existingMeta?.quarantinedCount || 0) + dlqDocs.length;
    const finalSchema = schema.length > 0 ? schema : existingMeta?.schema || [];

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
    return res.status(500).json({
      message: "Internal server error",
    });
  }
};
