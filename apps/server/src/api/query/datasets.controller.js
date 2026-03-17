const Metadata = require("../../models/Metadata");
const CleanRecord = require("../../models/CleanRecord");
const DLQRecord = require("../../models/DLQRecord");
const { validateRow, cleanAndNormalizeRow } = require("../../pipelines/dts/index");

// GET /api/datasets/:datasetId/metadata?limit=N
exports.getDatasetMetadata = async (req, res) => {
  try {
    const { datasetId } = req.params;
    const previewLimit = Math.min(parseInt(req.query.limit) || 25, 500);

    const metadata = await Metadata.findOne({ datasetId }).lean();
    if (!metadata) {
      return res.status(404).json({ message: "Dataset not found" });
    }

    const [previewDocs, quarantinedDocs] = await Promise.all([
      CleanRecord.find({ datasetId }).limit(previewLimit).lean(),
      DLQRecord.find({ datasetId }).sort({ rowNumber: 1 }).lean(),
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
    console.error("[Datasets] getDatasetMetadata error:", error);
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
      { new: true }
    );

    if (!result) {
      return res.status(404).json({ message: "Dataset or column not found" });
    }

    return res.json({ message: "Schema updated", schema: result.schema });
  } catch (error) {
    console.error("[Datasets] updateSchemaColumn error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// DELETE /api/datasets/:datasetId/quarantine/:rowIndex
exports.deleteQuarantinedRow = async (req, res) => {
  try {
    const { datasetId } = req.params;
    const idx = parseInt(req.params.rowIndex);

    const rows = await DLQRecord.find({ datasetId }).sort({ rowNumber: 1 }).lean();
    if (isNaN(idx) || idx < 0 || idx >= rows.length) {
      return res.status(404).json({ message: "Row not found" });
    }

    await DLQRecord.deleteOne({ _id: rows[idx]._id });
    const meta = await Metadata.findOneAndUpdate(
      { datasetId },
      { $inc: { quarantinedCount: -1 } },
      { new: true }
    );

    return res.json({
      message: "Row deleted",
      quarantinedCount: Math.max(0, meta?.quarantinedCount ?? 0),
      rowCount: meta?.rowCount ?? 0,
    });
  } catch (error) {
    console.error("[Datasets] deleteQuarantinedRow error:", error);
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
      { new: true }
    );

    return res.json({
      message: "All quarantined rows deleted",
      quarantinedCount: 0,
      rowCount: meta?.rowCount ?? 0,
    });
  } catch (error) {
    console.error("[Datasets] deleteAllQuarantinedRows error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// POST /api/datasets/:datasetId/quarantine/:rowIndex/validate
exports.validateQuarantinedRow = async (req, res) => {
  try {
    const { datasetId } = req.params;
    const idx = parseInt(req.params.rowIndex);
    const { updatedData } = req.body;

    const rows = await DLQRecord.find({ datasetId }).sort({ rowNumber: 1 }).lean();
    if (isNaN(idx) || idx < 0 || idx >= rows.length) {
      return res.status(404).json({ message: "Row not found" });
    }

    const dataToValidate = updatedData || rows[idx].rawData;
    const errors = validateRow(dataToValidate);

    if (errors.length > 0) {
      return res.status(422).json({ message: "Validation failed", errors });
    }

    return res.json({ message: "Validation passed", errors: [] });
  } catch (error) {
    console.error("[Datasets] validateQuarantinedRow error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// POST /api/datasets/:datasetId/quarantine/:rowIndex/restore
exports.restoreQuarantinedRow = async (req, res) => {
  try {
    const { datasetId } = req.params;
    const idx = parseInt(req.params.rowIndex);
    const { updatedData } = req.body;

    const rows = await DLQRecord.find({ datasetId }).sort({ rowNumber: 1 }).lean();
    if (isNaN(idx) || idx < 0 || idx >= rows.length) {
      return res.status(404).json({ message: "Row not found" });
    }

    const row = rows[idx];
    const dataToRestore = updatedData || row.rawData;

    const errors = validateRow(dataToRestore);
    if (errors.length > 0) {
      return res.status(422).json({ message: "Validation failed", errors });
    }

    const cleanedData = cleanAndNormalizeRow(dataToRestore);
    const metaDoc = await Metadata.findOne({ datasetId }).select("fileName").lean();

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
      { new: true }
    );

    return res.json({
      message: "Row restored",
      restoredData: cleanedData,
      rowCount: meta?.rowCount ?? 0,
      quarantinedCount: Math.max(0, meta?.quarantinedCount ?? 0),
    });
  } catch (error) {
    console.error("[Datasets] restoreQuarantinedRow error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// POST /api/datasets/:datasetId/quarantine/restore-all
exports.restoreAllValidQuarantinedRows = async (req, res) => {
  try {
    const { datasetId } = req.params;

    const [rows, metaDoc] = await Promise.all([
      DLQRecord.find({ datasetId }).sort({ rowNumber: 1 }).lean(),
      Metadata.findOne({ datasetId }).lean(),
    ]);

    const restoredRows = [];
    const failedRows = [];

    for (const row of rows) {
      const errors = validateRow(row.rawData);
      if (errors.length === 0) {
        const cleanedData = cleanAndNormalizeRow(row.rawData);
        restoredRows.push({ _id: row._id, data: cleanedData, rowNumber: row.rowNumber });
      } else {
        failedRows.push({ rowNumber: row.rowNumber, errors });
      }
    }

    if (restoredRows.length > 0) {
      await CleanRecord.insertMany(
        restoredRows.map((r) => ({
          datasetId,
          rowNumber: r.rowNumber,
          data: r.data,
          sourceFileName: metaDoc?.fileName || "",
          status: "VALID",
        }))
      );
      await DLQRecord.deleteMany({ _id: { $in: restoredRows.map((r) => r._id) } });
    }

    const newRowCount = (metaDoc?.rowCount ?? 0) + restoredRows.length;
    const newQuarantinedCount = Math.max(0, (metaDoc?.quarantinedCount ?? 0) - restoredRows.length);

    await Metadata.updateOne(
      { datasetId },
      { $set: { rowCount: newRowCount, quarantinedCount: newQuarantinedCount } }
    );

    return res.json({
      message: `Restored ${restoredRows.length} rows`,
      restoredRows: restoredRows.map((r) => ({ rowNumber: r.rowNumber, data: r.data })),
      failedRows,
      rowCount: newRowCount,
      quarantinedCount: newQuarantinedCount,
    });
  } catch (error) {
    console.error("[Datasets] restoreAllValidQuarantinedRows error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};