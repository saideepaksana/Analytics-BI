const path = require("path");
const fs = require("fs");
const { ExportLog } = require("../../models/exportLog");
const { rawExportQueue, dashboardExportQueue } = require("../../jobs/queue");
const { validateRawExport, validateVisualExport } = require("../../features/export/utils/exportPayloadValidator");
const logger = require("../../core/logger");

const EXPORT_DIR = path.join(__dirname, "../../../tmp/exports");

/**
 * Pipeline A: Start Raw Data Export
 */
async function startRawExport(req, res) {
    try {
        validateRawExport(req.body);
        const { datasetId, format, context } = req.body;

        const job = await rawExportQueue.add("raw-export", {
            datasetId,
            format,
            context,
            userId: req.user?.id || "anonymous"
        });

        res.status(202).json({ 
            message: "Raw export job queued.", 
            jobId: job.id 
        });
    } catch (err) {
        logger.error(`Failed to start raw export: ${err.message}`, "exportController");
        res.status(400).json({ error: err.message });
    }
}

/**
 * Pipeline B: Start Visual Dashboard Export
 */
async function startVisualExport(req, res) {
    try {
        validateVisualExport(req.body);
        const { dashboardId, format, frozenState } = req.body;

        const job = await dashboardExportQueue.add("dashboard-export", {
            dashboardId,
            format,
            frozenState,
            userId: req.user?.id || "anonymous"
        });

        res.status(202).json({ 
            message: "Visual export job queued.", 
            jobId: job.id 
        });
    } catch (err) {
        logger.error(`Failed to start visual export: ${err.message}`, "exportController");
        res.status(400).json({ error: err.message });
    }
}

/**
 * Shared Status Polling
 */
async function getExportStatus(req, res) {
    try {
        const { jobId } = req.params;
        
        // Check raw-export queue first
        let job = await rawExportQueue.getJob(jobId);
        if (!job) {
            job = await dashboardExportQueue.getJob(jobId);
        }

        if (!job) {
            // FALLBACK: Check persistent ExportLog if job is missing from Redis (BullMQ cleanup)
            const log = await ExportLog.findOne({ jobId }).lean();
            if (log) {
                return res.json({
                    jobId,
                    state: log.status === "processing" ? "active" : log.status,
                    progress: log.status === "completed" ? 100 : 0,
                    result: log.status === "completed" ? { filename: log.filename, recordCount: log.recordCount } : null,
                    error: log.status === "failed" ? "Job record found but failed." : null
                });
            }
            return res.status(404).json({ error: "Export job not found." });
        }

        const state = await job.getState();
        const progress = job.progress;
        const result = job.returnvalue;

        res.json({
            jobId,
            state, // 'waiting', 'active', 'completed', 'failed', 'delayed', 'paused'
            progress,
            result: state === "completed" ? result : null,
            error: state === "failed" ? job.failedReason : null
        });
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch job status." });
    }
}

/**
 * File Download
 */
async function downloadExportFile(req, res) {
    try {
        const { filename } = req.params;
        const userId = req.user?.id || "anonymous";

        // 1. Security Check: Verify Ownership via ExportLog
        const log = await ExportLog.findOne({ filename }).lean();
        if (!log) {
            return res.status(404).json({ error: "Export record not found." });
        }

        if (log.exportedBy !== "anonymous" && log.exportedBy !== userId) {
            return res.status(403).json({ error: "Access Denied: You do not own this export." });
        }

        // 2. Locate File in namespaced directories
        const rawPath = path.join(EXPORT_DIR, "raw", filename);
        const visualPath = path.join(EXPORT_DIR, "visual", filename);
        let filePath = null;

        if (fs.existsSync(rawPath)) filePath = rawPath;
        else if (fs.existsSync(visualPath)) filePath = visualPath;

        if (!filePath) {
            return res.status(404).json({ error: "Export file not found on disk." });
        }

        // Basic security: ensure the filename doesn't contain path traversal
        if (filename.includes("..") || filename.includes("/")) {
            return res.status(403).json({ error: "Forbidden." });
        }

        res.download(filePath);
    } catch (err) {
        res.status(500).json({ error: "Download failed." });
    }
}

/**
 * Legacy/History
 */
async function getExportLog(req, res) {
    try {
        const logs = await ExportLog.find({ datasetId: req.params.datasetId })
            .sort({ exportedAt: -1 })
            .limit(50)
            .lean();
        res.json({ logs });
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch export log." });
    }
}

async function generateEmbedToken(req, res) {
    try {
        const { datasetId, dashboardId } = req.body;
        const token = Buffer.from(
            JSON.stringify({ datasetId, dashboardId, iat: Date.now(), exp: Date.now() + 86400000 })
        ).toString("base64url");
        const embedUrl = `${process.env.CLIENT_URL || "http://localhost:5173"}/embed/${dashboardId}?token=${token}`;
        const iframeSnippet = `<iframe src="${embedUrl}" width="100%" height="600" frameborder="0" allowfullscreen></iframe>`;
        res.json({ token, embedUrl, iframeSnippet });
    } catch (err) {
        res.status(500).json({ error: "Failed to generate embed token." });
    }
}

module.exports = {
    startRawExport,
    startVisualExport,
    getExportStatus,
    downloadExportFile,
    getExportLog,
    generateEmbedToken
};
