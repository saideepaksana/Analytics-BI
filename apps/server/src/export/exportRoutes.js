const express = require("express");
const router = express.Router();
const { 
    startRawExport, 
    startVisualExport, 
    getExportStatus, 
    downloadExportFile,
    getExportLog, 
    generateEmbedToken,
    getEmbeddedDashboard,
    createSchedule,
    listSchedules,
    deleteSchedule
} = require("../api/export/exportController");
const embedTokenAuth = require("../middleware/embedTokenAuth");
const embedRateLimiter = require("../middleware/embedRateLimiter");
const embedCors = require("../middleware/embedCors");

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
router.get("/embed/:dashboardId", embedTokenAuth, embedRateLimiter, embedCors, getEmbeddedDashboard);

// Pipeline C: Scheduled Exports
router.post("/schedules", createSchedule);
router.get("/schedules", listSchedules);
router.delete("/schedules/:scheduleId", deleteSchedule);

module.exports = router;