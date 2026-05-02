/**
 * visualExportWorker.js
 */

const path = require("path");
const fs = require("fs");
const os = require("os");
const PDFDocument = require("pdfkit");
const Dashboard = require("../../../models/Dashboard");
const { ExportLog } = require("../../../models/exportLog");
const puppeteerService = require("../services/PuppeteerService");
const logger = require("../../../core/logger");

// Namespacing: /tmp/exports/visual
const EXPORT_DIR = path.join(os.tmpdir(), "analytics-bi", "exports", "visual");
const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:5173";
// Visual export captures the rendered dashboard editor surface only.
const EXPORT_SELECTOR = ".dashboard-editor-page";
const PDF_MARGIN = 20;

const waitForStream = (stream) => {
    return new Promise((resolve, reject) => {
        stream.on("finish", resolve);
        stream.on("error", reject);
    });
};

const getExportBounds = async (page) => {
    return page.$eval(EXPORT_SELECTOR, (element) => {
        const rect = element.getBoundingClientRect();
        return {
            x: Math.max(0, Math.floor(rect.left + window.scrollX)),
            y: Math.max(0, Math.floor(rect.top + window.scrollY)),
            width: Math.max(1, Math.ceil(Math.max(rect.width, element.scrollWidth, element.offsetWidth))),
            height: Math.max(1, Math.ceil(Math.max(rect.height, element.scrollHeight, element.offsetHeight))),
        };
    });
};

const writePaginatedPdf = async (page, filePath, bounds, job) => {
    const output = fs.createWriteStream(filePath);
    const document = new PDFDocument({
        autoFirstPage: false,
        size: "A4",
        layout: "landscape",
        margin: PDF_MARGIN,
    });

    document.pipe(output);

    const pageWidth = 841.89;
    const pageHeight = 595.28;
    const usableWidth = pageWidth - (PDF_MARGIN * 2);
    const usableHeight = pageHeight - (PDF_MARGIN * 2);
    const sliceHeight = Math.max(1, Math.floor(bounds.width * (usableHeight / usableWidth)));
    const totalPages = Math.max(1, Math.ceil(bounds.height / sliceHeight));

    for (let pageIndex = 0; pageIndex < totalPages; pageIndex += 1) {
        const yOffset = pageIndex * sliceHeight;
        const clipHeight = Math.min(sliceHeight, bounds.height - yOffset);
        const imageBuffer = await page.screenshot({
            type: "png",
            captureBeyondViewport: true,
            clip: {
                x: bounds.x,
                y: bounds.y + yOffset,
                width: bounds.width,
                height: clipHeight,
            },
        });

        document.addPage({
            size: "A4",
            layout: "landscape",
            margin: PDF_MARGIN,
        });

        const renderedHeight = Math.min(usableHeight, (clipHeight * usableWidth) / bounds.width);
        document.image(imageBuffer, PDF_MARGIN, PDF_MARGIN, {
            width: usableWidth,
            height: renderedHeight,
        });

        await job.updateProgress(Math.min(95, 60 + Math.round(((pageIndex + 1) / totalPages) * 35)));
    }

    document.end();
    await waitForStream(output);
};

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

        await ExportLog.findOneAndUpdate(
            { jobId },
            {
                $set: {
                    datasetId: dashboardId,
                    format,
                    status: "processing",
                    exportedBy: userId || "anonymous",
                    filename,
                    recordCount: 0,
                    exportedAt: Date.now(),
                },
                $unset: { failureReason: "" },
            },
            { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
        );

        page = await puppeteerService.acquirePage();
        const { width = 1280, height = 800 } = frozenState.viewport || {};
        // Ensure a minimum width for presentation-ready exports
        const exportWidth = Math.max(1280, width);
        const exportHeight = Math.max(800, height);
        
        await page.setViewport({ width: exportWidth, height: exportHeight });
        await page.emulateMediaType("screen");

        const exportUrl = `${CLIENT_URL}?view=dashboards&id=${dashboardId}&export=true`;
        await page.evaluateOnNewDocument((state) => {
            window.RENDER_COMPLETE = false;
            window.IS_EXPORT_MODE = true;
            localStorage.setItem("export_frozen_state", JSON.stringify(state));
        }, frozenState);

        await page.goto(exportUrl, { waitUntil: "networkidle2", timeout: 60000 });
        await job.updateProgress(50);

        try {
            // The client hydrates deterministic export state when
            // window.IS_EXPORT_MODE is enabled, so capture waits for the
            // explicit render-complete signal instead of live page timing.
            await page.waitForFunction(() => window.RENDER_COMPLETE === true, { timeout: 45000 });
        } catch (e) {
            logger.warn(`Render signal timeout for ${filename}. Proceeding with partial render.`, "VisualExportWorker");
        }

        // Visual export captures the rendered dashboard surface only.
        const bounds = await getExportBounds(page);

        if (format === "png") {
            await page.screenshot({
                path: filePath,
                type: "png",
                captureBeyondViewport: true,
                clip: bounds,
            });
        } else {
            await writePaginatedPdf(page, filePath, bounds, job);
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
