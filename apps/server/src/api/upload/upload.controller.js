const { getBucket } = require("../../core/storage");
const { Readable } = require("stream");
exports.uploadFile = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }
    const bucket = getBucket();
    const readableStream = Readable.from(req.file.buffer);
    const uploadStream = bucket.openUploadStream(req.file.originalname,
      {
        metadata:
        {
          uploadedAt: new Date(),
          mode: req.body.mode || "new"
        }
      });
    readableStream.pipe(uploadStream);
    uploadStream.on("finish", () => {
      console.log("File stored in GridFS");
      res.status(200).json({
        message: "File uploaded successfully",
        fileName: req.file.originalname
      });
    });
  }
  catch (error) {
    console.error(error);
    res.status(500).json({ message: "Upload failed" });
  }
};
