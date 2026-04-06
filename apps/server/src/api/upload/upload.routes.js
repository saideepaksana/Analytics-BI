const express = require("express");
const { uploadFile, getActiveJobs } = require("./upload.controller");
const idempotency = require("../../middleware/idempotency");

const router = express.Router();

// Get currently running background jobs
router.get("/active-jobs", getActiveJobs);

// Multipart parsing is handled in controller with Busboy for streaming to GridFS.
router.post("/", idempotency, uploadFile);

module.exports = router;
