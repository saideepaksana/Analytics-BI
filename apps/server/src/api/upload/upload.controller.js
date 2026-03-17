
const { getBucket } = require("../../core/storage");
const { Readable } = require("stream");

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

    //GridFS bucket
    let bucket;
    try {
      bucket = getBucket();
    } catch (err) {
      return res.status(503).json({
        message: "Storage not ready. Please try again in a moment.",
      });
    }

    //basic safty check for file name
    const safeFileName = req.file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, "_");

    console.log(`Uploading file: ${safeFileName}, mode: ${mode}`);

    // buffer to stream
    const readableStream = Readable.from(req.file.buffer);

    //Upload to GridFS
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

    readableStream.pipe(uploadStream);

    //success
    uploadStream.on("finish", () => {
      const datasetId = mode === "new" ? String(uploadStream.id) : requestedDatasetId;
      return res.status(200).json({
        message: "File uploaded successfully",
        datasetId,
        fileId: String(uploadStream.id),
        fileName: safeFileName,
        mode,
        rowCount: 0,
        quarantinedCount: 0,
        uploadId: uploadId || undefined,
      });
    });

    //error
    uploadStream.on("error", (err) => {
      console.error("GridFS Upload Error:", err);
      return res.status(500).json({
        message: "File upload failed",
      });
    });

  } catch (error) {
    console.error("Upload Controller Error:", error);
    return res.status(500).json({
      message: "Internal server error",
    });
  }
};
