const express = require("express");
const multer = require("multer");
const fileFilter = require("../middleware/fileValidation");
const uploadController = require("../controllers/upload.controller");

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter
});

router.post("/upload", upload.single("file"), uploadController.uploadFile);

module.exports = router;
