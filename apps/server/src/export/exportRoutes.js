const express = require("express");
const router = express.Router();
const { 
    startRawExport, 
    startVisualExport, 
    getExportStatus, 
    downloadExportFile,
    getExportLog, 
    generateEmbedToken 
} = require("../api/export/exportController");

// Pipeline A: Raw Data Export
router.post("/raw", startRawExport);

// Pipeline B: Visual Dashboard Export
router.post("/visual", startVisualExport);

// Shared Job Status & Download
router.get("/status/:jobId", getExportStatus);
router.get("/download/:filename", downloadExportFile);

// Legacy/Other
router.get("/:datasetId/log", getExportLog);
router.post("/embed/token", generateEmbedToken);

module.exports = router;