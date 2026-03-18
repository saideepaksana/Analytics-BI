const express = require("express");
const multer = require("multer");
const path = require("path");
const { uploadFile } = require("./upload.controller");

const router = express.Router();

const allowedExtensions = [".csv", ".xls", ".xlsx"];
const allowedMimeTypes = [
  "text/csv",
  "text/x-csv",
  "application/x-csv",
  "application/csv",
  "text/comma-separated-values",
  "text/plain",
  "application/vnd.ms-excel",
  "application/vnd.ms-excel.sheet.macroEnabled.12",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/octet-stream",
];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB
  },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const hasValidExtension = allowedExtensions.includes(ext);

    // Rely on extension validation because MIME values for Excel files vary widely across browsers/OS.
    if (hasValidExtension) {
      cb(null, true);
    } else {
      cb(
        new Error("Invalid file type. Only CSV and Excel files are allowed."),
        false
      );
    }
  },
});

const handleUpload = (req, res, next) => {
  const uploadMiddleware = upload.single("file");

  uploadMiddleware(req, res, function (err) {
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({
          message: "File too large. Max size is 50MB.",
        });
      }
      return res.status(400).json({ message: err.message });
    }

    if (err) {
      return res.status(400).json({ message: err.message });
    }

    next();
  });
};

router.post("/", handleUpload, uploadFile);

module.exports = router;