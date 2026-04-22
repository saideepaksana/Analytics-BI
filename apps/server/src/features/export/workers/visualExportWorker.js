/**
 * visualExportWorker.js
 */

const path = require("path");
const fs = require("fs");
const Dashboard = require("../../../models/Dashboard");
const { ExportLog } = require("../../../models/exportLog");
const puppeteerService = require("../services/PuppeteerService");
const logger = require("../../../core/logger");

// Namespacing: /tmp/exports/visual
const EXPORT_DIR = path.join(__dirname, "../../../../tmp/exports/visual");
const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:5173";

const runVisualExport = async (job) => {
    const { dashboardId, format, frozenState, userId } = job.data;
    const jobId = job.id;
    
    if (!fs.existsSync(EXPORT_DIR)) {
        fs.mkdirSync(EXPORT_DIR, { recursive: true });
    }

    const filename = `dashboard_${dashboardId}_${Date.now()}.${format === "png" ? "png" : "pdf"}`;
    const filePath = path.join(EXPORT_DIR, filename);

    let page;
    try {
        await job.updateProgress(5);
        
        const dashboard = await Dashboard.findById(dashboardId).lean();
        if (!dashboard) throw new Error("Dashboard not found.");
        
        if (dashboard.createdBy && userId !== "anonymous" && dashboard.createdBy !== userId) {
            throw new Error("Access Denied: You do not own this dashboard.");
        }

        await ExportLog.create({
            datasetId: dashboardId,
            jobId,
            format,
            status: "processing",
            exportedBy: userId || "anonymous",
            filename
        });

        page = await puppeteerService.acquirePage();
        const { width = 1920, height = 1080 } = frozenState.viewport || {};
        await page.setViewport({ width, height });

        const exportUrl = `${CLIENT_URL}?view=dashboards&id=${dashboardId}&export=true`;
        await page.evaluateOnNewDocument((state) => {
            localStorage.setItem("export_frozen_state", JSON.stringify(state));
        }, frozenState);

        await page.goto(exportUrl, { waitUntil: "networkidle2", timeout: 60000 });
        await job.updateProgress(50);

        try {
            await page.waitForFunction(() => window.RENDER_COMPLETE === true, { timeout: 45000 });
        } catch (e) {
            logger.warn(`Render signal timeout for ${filename}. Proceeding with partial render.`, "VisualExportWorker");
        }

        if (format === "png") {
            await page.screenshot({ path: filePath, fullPage: true });
        } else {
            await page.pdf({ 
                path: filePath, 
                format: "A4", 
                printBackground: true,
                landscape: true,
                margin: { top: "20px", bottom: "20px" }
            });
        }

        await ExportLog.findOneAndUpdate({ jobId }, {
            status: "completed",
            exportedAt: Date.now()
        });

        await job.updateProgress(100);
        return { status: "completed", filename };

    } catch (err) {
        logger.error(`Visual export failed: ${err.message}`, "VisualExportWorker");
        await ExportLog.findOneAndUpdate({ jobId }, { 
            status: "failed",
            failureReason: err.message,
            filename: null
        }).catch(() => {});

        if (fs.existsSync(filePath)) {
            try { fs.unlinkSync(filePath); } catch (e) {}
        }
        throw err;
    } finally {
        puppeteerService.releasePage(page);
    }
};

module.exports = { runVisualExport };
