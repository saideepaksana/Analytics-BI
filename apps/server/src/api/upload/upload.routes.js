const express = require("express");
const { uploadFile, getActiveJobs } = require("./upload.controller");

const router = express.Router();

// Get currently running background jobs
router.get("/active-jobs", getActiveJobs);

// Multipart parsing is handled in controller with Busboy for streaming to GridFS.
router.post("/", uploadFile);

module.exports = router;
