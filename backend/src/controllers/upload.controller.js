const { getBucket } = require("../utils/gridfs");
const { Readable } = require("stream");

exports.uploadFile = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    const ingestionMode = req.body.mode;

    if (!["new", "append", "replace"].includes(ingestionMode)) {
      return res.status(400).json({
        message: "Invalid ingestion mode"
      });
    }

    const bucket = getBucket();

    const readableStream = Readable.from(req.file.buffer);

    const uploadStream = bucket.openUploadStream(req.file.originalname, {
      metadata: {
        mode: ingestionMode,
        uploadedAt: new Date()
      }
    });

    readableStream.pipe(uploadStream);

    uploadStream.on("finish", () => {
      console.log("File stored in MongoDB GridFS");

      res.status(200).json({
        message: "File uploaded successfully",
        fileName: req.file.originalname,
        mode: ingestionMode
      });
    });

    uploadStream.on("error", (error) => {
      console.error("Upload stream error:", error);
      res.status(500).json({ message: "Upload failed" });
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Upload failed" });
  }
};
