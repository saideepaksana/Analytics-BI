const express = require("express");
const { uploadFile } = require("./upload.controller");

const router = express.Router();

// Multipart parsing is handled in controller with Busboy for streaming to GridFS.
router.post("/", uploadFile);

module.exports = router;
