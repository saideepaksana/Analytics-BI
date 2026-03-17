const express = require("express");
const multer = require("multer");
const path = require("path");
const { uploadFile } = require("./upload.controller");

const router = express.Router();

const allowedExtensions = [".csv", ".xls", ".xlsx"];
const allowedMimeTypes = [
  "text/csv",
  "application/csv",
  "text/plain",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();

    if (
      allowedExtensions.includes(ext) &&
      allowedMimeTypes.includes(file.mimetype)
    ) {
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
          message: "File too large. Max size is 10MB.",
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