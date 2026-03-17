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

    if (!validModes.includes(mode)) {
      return res.status(400).json({
        message: "Invalid mode. Allowed: new, append, replace",
      });
    }

    //GridFS bucket
    const bucket = getBucket();

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
      },
    });

    readableStream.pipe(uploadStream);

    //success
    uploadStream.on("finish", () => {
      return res.status(200).json({
        message: "File uploaded successfully",
        fileName: safeFileName,
        mode: mode,
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