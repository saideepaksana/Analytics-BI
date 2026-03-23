// API routes for file upload configuration

// File upload middleware (multer)
const express = require("express");
const multer = require("multer");
const path = require("path");
const { uploadFile } = require("./upload.controller");

const router = express.Router();

// Allowed file types
const allowedExtensions = [".csv", ".xls", ".xlsx"];
const allowedMimeTypes = [
  "text/csv",
  "text/x-csv",
  "application/x-csv",
  "application/csv",
  "text/comma-separated-values",
  "text/plain",
  "application/vnd.ms-excel",
  "application/vnd.ms-excel.sheet_macroEnabled.12",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/octet-stream",
];

// File stored in memory (not disk)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB
  },
  fileFilter: (req, file, cb) => { // Checks file extension
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

// Wraps multer middleware
// Handles:
// - File too large errors
// - Invalid file errors
const handleUpload = (req, res, next) => {
  const uploadMiddleware = upload.single("file");

  uploadMiddleware(req, res, function (err) {
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({
          message: "File too large. Max size is 100MB.",
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

// Route: Client → multer → validation → uploadFile()
router.post("/", handleUpload, uploadFile);

module.exports = router;
