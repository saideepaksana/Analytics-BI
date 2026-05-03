const path = require("path");
const fs = require("fs");
const os = require("os");
const crypto = require("crypto");
const { ExportLog } = require("../../models/exportLog");
const Dashboard = require("../../models/Dashboard");
const ScheduledExport = require("../../models/ScheduledExport");
const { rawExportQueue, dashboardExportQueue, scheduledExportQueue } = require("../../jobs/queue");
const { validateRawExport, validateVisualExport } = require("../../features/export/utils/exportPayloadValidator");
const { getVisualExportAvailabilityError } = require("../../features/export/utils/visualExportAvailability");
const dashboardMapper = require("../dashboard/dashboardMapper");
const { loadDashboard } = require("../dashboard/dashboardService");
const { isOwnerOrEditor } = require("../../middleware/rbac");
const embedTokenService = require("../../services/embedTokenService");
const logger = require("../../core/logger");

const CRON_MAP = {
    daily: "0 6 * * *",
    weekly: "0 6 * * 1",
    monthly: "0 6 1 * *",
    test: "* * * * *",
};

const EXPORT_DIR = path.join(os.tmpdir(), "analytics-bi", "exports");

const buildExportUrl = (req, filename) => {
    if (!filename) return "";
    const origin = `${req.protocol}://${req.get("host")}`;
    return `${origin}/api/export/download/${encodeURIComponent(filename)}`;
};

const buildExportResult = (req, result = {}) => {
    const filename = result?.filename || "";
    const recordCount = Number(result?.recordCount) || 0;
    const downloadUrl = filename ? buildExportUrl(req, filename) : "";

    return {
        ...result,
        filename,
        recordCount,
        downloadUrl,
        shareUrl: downloadUrl,
    };
};

const parseExpirationHours = (value) => {
    if (value === undefined || value === null || value === "") return undefined;
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
    return Math.min(Math.max(parsed, 1), 720);
};

/**
 * Pipeline A: Start Raw Data Export
 */
async function startRawExport(req, res) {
    try {
        validateRawExport(req.body);
        const { datasetId, format, context } = req.body;

        const jobId = crypto.randomUUID();
        const job = await rawExportQueue.add("raw-export", {
            datasetId,
            format,
            context,
            userId: req.user?.id || "anonymous",
            userRole: req.user?.role || "viewer"
        }, { jobId });

        res.status(202).json({ 
            message: "Raw export job queued.", 
            jobId: job.id 
        });
    } catch (err) {
        logger.error(`Failed to start raw export: ${err.message}`, "exportController");
        res.status(400).json({ error: err.message, message: err.message });
    }
}

/**
 * Pipeline B: Start Visual Dashboard Export
 */
async function startVisualExport(req, res) {
    try {
        validateVisualExport(req.body);
        const visualExportAvailabilityError = getVisualExportAvailabilityError();
        if (visualExportAvailabilityError) {
            return res.status(503).json({
                error: visualExportAvailabilityError,
                message: visualExportAvailabilityError,
            });
        }

        const { dashboardId, format, frozenState } = req.body;

        const jobId = crypto.randomUUID();
        const job = await dashboardExportQueue.add("dashboard-export", {
            dashboardId,
            format,
            frozenState,
            userId: req.user?.id || "anonymous",
            userRole: req.user?.role || "viewer"
        }, { jobId });

        res.status(202).json({ 
            message: "Visual export job queued.", 
            jobId: job.id 
        });
    } catch (err) {
        logger.error(`Failed to start visual export: ${err.message}`, "exportController");
        res.status(400).json({ error: err.message, message: err.message });
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
                    result: log.status === "completed"
                        ? buildExportResult(req, { filename: log.filename, recordCount: log.recordCount })
                        : null,
                    error: log.status === "failed" ? (log.failureReason || "Export failed.") : null
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
            result: state === "completed" ? buildExportResult(req, result) : null,
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

        if (!filename || filename.includes("..") || filename.includes("/") || filename.includes("\\")) {
            return res.status(403).json({ error: "Forbidden." });
        }

        // Security Check: The filename is a long hash + timestamp, acting as a token.
        // We rely on file existence in the namespaced directories.

        // 2. Locate File in namespaced directories
        const rawPath = path.join(EXPORT_DIR, "raw", filename);
        const visualPath = path.join(EXPORT_DIR, "visual", filename);
        let filePath = null;

        if (fs.existsSync(rawPath)) filePath = rawPath;
        else if (fs.existsSync(visualPath)) filePath = visualPath;

        if (!filePath) {
            return res.status(404).json({ error: "Export file not found on disk." });
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
        const { dashboardId, expirationHours, allowedOrigins } = req.body || {};

        if (!dashboardId) {
            return res.status(400).json({ error: "dashboardId is required." });
        }

        if (!req.user) {
            return res.status(401).json({ error: "Authentication required." });
        }

        const dashboard = await Dashboard.findById(dashboardId).lean();
        if (!dashboard) {
            return res.status(404).json({ error: "Dashboard not found." });
        }

        if (!isOwnerOrEditor(dashboard, req.user)) {
            return res.status(403).json({ error: "Access denied." });
        }

        if (dashboard.status !== "published") {
            return res.status(403).json({ error: "Dashboard is not published." });
        }

        const normalizedOrigins = embedTokenService.normalizeAllowedOrigins(
            allowedOrigins ?? process.env.EMBED_ALLOWED_ORIGINS
        );
        const resolvedOrigins =
            normalizedOrigins.length === 0 && process.env.NODE_ENV !== "production"
                ? ["http://localhost:5173", "http://localhost:3000"]
                : normalizedOrigins;
        const expiresInHours = parseExpirationHours(expirationHours);
        const { token, expiresAt } = embedTokenService.generateToken({
            dashboardId: String(dashboard._id),
            userId: req.user.id,
            scope: "view",
            expiresInHours,
            allowedOrigins: resolvedOrigins,
        });

        const clientUrl = (process.env.CLIENT_URL || "http://localhost:5173").replace(/\/+$/, "");
        const embedUrl = `${clientUrl}/embed/${dashboardId}?token=${encodeURIComponent(token)}`;
        const iframeSnippet = `<iframe src="${embedUrl}" width="100%" height="600" frameborder="0" allowfullscreen></iframe>`;

        res.json({ token, embedUrl, iframeSnippet, expiresAt });
    } catch (err) {
        logger.error(`Failed to generate embed token: ${err.message}`, "exportController");
        res.status(500).json({ error: "Failed to generate embed token." });
    }
}

async function getEmbeddedDashboard(req, res) {
    try {
        const { dashboardId } = req.params;
        const fullDashboard = await loadDashboard(dashboardId);
        const dashboard = dashboardMapper.fromDB(fullDashboard);

        res.json({
            dashboard,
            charts: fullDashboard.charts || {},
            filters: dashboard?.filters || {},
            metadata: {
                loadedAt: fullDashboard.loadedAt,
            },
        });
    } catch (err) {
        if (err.message === "Dashboard not found") {
            return res.status(404).json({ error: "Dashboard not found." });
        }
        logger.error(`Failed to load embedded dashboard: ${err.message}`, "exportController");
        res.status(500).json({ error: "Failed to load embedded dashboard." });
    }
}

async function createSchedule(req, res) {
    try {
        const { dashboardId, name, frequency, format, recipients } = req.body;
        const userId = req.user?.id || "anonymous";

        if (!dashboardId || !name || !frequency) {
            return res.status(400).json({ error: "dashboardId, name, and frequency are required." });
        }

        const cron = CRON_MAP[frequency];
        if (!cron) {
            return res.status(400).json({ error: `Invalid frequency: ${frequency}` });
        }

        const dashboard = await Dashboard.findById(dashboardId).lean();
        if (!dashboard) {
            return res.status(404).json({ error: "Dashboard not found." });
        }

        const schedule = await ScheduledExport.create({
            dashboardId,
            userId,
            name,
            frequency,
            format: format || "pdf",
            recipients: recipients || [],
            status: "active"
        });

        // Add repeatable job to BullMQ
        const job = await scheduledExportQueue.add(
            "scheduled-export",
            { scheduleId: schedule._id },
            {
                repeat: { pattern: cron },
                jobId: `repeat-${schedule._id}` // Consistent ID for replacement/deletion
            }
        );

        schedule.repeatJobKey = job.repeatJobKey;
        await schedule.save();

        res.status(201).json({ message: "Schedule created.", schedule });
    } catch (err) {
        logger.error(`Failed to create schedule: ${err.message}`, "exportController");
        res.status(500).json({ error: "Failed to create schedule." });
    }
}

async function listSchedules(req, res) {
    try {
        const { dashboardId } = req.query;
        const filter = { userId: req.user?.id || "anonymous" };
        if (dashboardId) filter.dashboardId = dashboardId;

        const schedules = await ScheduledExport.find(filter).sort({ createdAt: -1 }).lean();
        res.json({ schedules });
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch schedules." });
    }
}

async function deleteSchedule(req, res) {
    try {
        const { scheduleId } = req.params;
        const userId = req.user?.id || "anonymous";

        const schedule = await ScheduledExport.findOne({ _id: scheduleId, userId });
        if (!schedule) {
            return res.status(404).json({ error: "Schedule not found." });
        }

        // Remove repeatable job from BullMQ
        if (schedule.repeatJobKey) {
            const cron = CRON_MAP[schedule.frequency];
            await scheduledExportQueue.removeRepeatableByKey(schedule.repeatJobKey);
        }

        await ScheduledExport.deleteOne({ _id: scheduleId });
        res.json({ message: "Schedule deleted." });
    } catch (err) {
        logger.error(`Failed to delete schedule: ${err.message}`, "exportController");
        res.status(500).json({ error: "Failed to delete schedule." });
    }
}

module.exports = {
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
};
