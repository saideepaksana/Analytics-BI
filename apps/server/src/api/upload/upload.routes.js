const express = require("express");
const multer = require("multer");
const { uploadFile } = require("./upload.controller");
const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage()
});
router.post("/", upload.single("file"), uploadFile);
module.exports = router;
