/**
 * visualExportWorker.js
 */

const path = require("path");
const fs = require("fs");
const os = require("os");
const PDFDocument = require("pdfkit");
const Dashboard = require("../../../models/Dashboard");
const Chart = require("../../../models/Chart");
const { ExportLog } = require("../../../models/exportLog");
const { executeDatasetQuery, mergeFilters } = require("../../../api/query/queryExecution");
const puppeteerService = require("../services/PuppeteerService");
const logger = require("../../../core/logger");

// Namespacing: /tmp/exports/visual
const EXPORT_DIR = path.join(os.tmpdir(), "analytics-bi", "exports", "visual");
const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:5173";
// Visual export captures the rendered dashboard canvas grid.
const EXPORT_SELECTOR = ".dashboard-canvas-grid";
const PDF_MARGIN = 20;

const waitForStream = (stream) => {
    return new Promise((resolve, reject) => {
        stream.on("finish", resolve);
        stream.on("error", reject);
    });
};

const getExportBounds = async (page) => {
    return page.evaluate((selector) => {
        const element = document.querySelector(selector);
        if (!element) return { x: 0, y: 0, width: 1280, height: 800 };
        
        const rect = element.getBoundingClientRect();
        const widgets = Array.from(element.querySelectorAll('.dashboard-widget'));
        
        let contentHeight = rect.height;
        if (widgets.length > 0) {
            // After height injection, the rect.height should already be the tight content height
            contentHeight = rect.height;
        }

        return {
            x: Math.max(0, Math.floor(rect.left + window.scrollX)),
            y: Math.max(0, Math.floor(rect.top + window.scrollY)),
            width: Math.max(1, Math.ceil(rect.width)),
            height: Math.max(1, Math.ceil(contentHeight)),
        };
    }, EXPORT_SELECTOR);
};

/**
 * Appends a tab's content to the PDF document.
 * Slices vertically if the content is longer than one page.
 */
const appendTabToPdf = async (page, pdfDoc, job, tabIndex, totalTabs, tabName) => {
    const bounds = await getExportBounds(page);
    
    const pageWidth = 841.89; // A4 Landscape width in pts
    const pageHeight = 595.28; // A4 Landscape height in pts
    const usableWidth = pageWidth - (PDF_MARGIN * 2);
    // Reserve space for the header if it's the first slice of the tab
    const headerHeight = 30;
    const usableHeight = pageHeight - (PDF_MARGIN * 2);
    
    const sliceHeight = Math.max(1, Math.floor(bounds.width * (usableHeight / usableWidth)));
    const totalSlices = Math.max(1, Math.ceil(bounds.height / sliceHeight));

    for (let sliceIndex = 0; sliceIndex < totalSlices; sliceIndex += 1) {
        const yOffset = sliceIndex * sliceHeight;
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

        pdfDoc.addPage({
            size: "A4",
            layout: "landscape",
            margin: PDF_MARGIN,
        });

        let currentY = PDF_MARGIN;
        
        // Add tab name as header on the first slice of each tab
        if (sliceIndex === 0 && tabName) {
            pdfDoc
                .fillColor("#0f172a")
                .font("Helvetica-Bold")
                .fontSize(18)
                .text(tabName, PDF_MARGIN, currentY);
            currentY += headerHeight;
        }

        const availableImageHeight = pageHeight - currentY - PDF_MARGIN;
        const renderedHeight = Math.min(availableImageHeight, (clipHeight * usableWidth) / bounds.width);
        
        pdfDoc.image(imageBuffer, PDF_MARGIN, currentY, {
            width: usableWidth,
            height: renderedHeight,
        });

        const progressBase = 60 + (tabIndex / totalTabs) * 35;
        const sliceProgress = ((sliceIndex + 1) / totalSlices) * (35 / totalTabs);
        await job.updateProgress(Math.min(98, Math.round(progressBase + sliceProgress)));
    }
};

const writeDashboardPdf = async (page, filePath, job) => {
    const output = fs.createWriteStream(filePath);
    const pdfDoc = new PDFDocument({
        autoFirstPage: false,
        size: "A4",
        layout: "landscape",
        margin: PDF_MARGIN,
    });

    pdfDoc.pipe(output);

    // Detect tabs
    const tabSelectors = await page.$$(".dashboard-tab-item");
    
    if (tabSelectors.length > 0) {
        for (let i = 0; i < tabSelectors.length; i++) {
            // Click the tab and get its name
            const tabData = await page.evaluate((idx) => {
                const tabs = document.querySelectorAll(".dashboard-tab-item");
                if (tabs[idx]) {
                    window.RENDER_COMPLETE = false;
                    tabs[idx].click();
                    
                    // Check if tab has widgets to know if we should wait for RENDER_COMPLETE
                    const grid = document.querySelector(".dashboard-canvas-grid");
                    const widgetCount = grid ? grid.querySelectorAll(".dashboard-widget").length : 0;
                    
                    return {
                        name: tabs[idx].innerText.trim(),
                        hasWidgets: widgetCount > 0
                    };
                }
                return { name: `Tab ${idx + 1}`, hasWidgets: false };
            }, i);

            // Give React a moment to switch tabs and start loading
            await new Promise(r => setTimeout(r, 500));

            // Wait for render if there are widgets
            if (tabData.hasWidgets) {
                try {
                    await page.waitForFunction(() => window.RENDER_COMPLETE === true, { timeout: 30000 });
                } catch (e) {
                    logger.warn(`Render timeout for tab ${i}. Proceeding.`);
                }
            }

            await appendTabToPdf(page, pdfDoc, job, i, tabSelectors.length, tabData.name);
        }
    } else {
        // Single page dashboard
        const dashboardTitle = await page.evaluate(() => {
            const titleEl = document.querySelector(".dashboard-name-input") || document.querySelector(".dashboard-superset-title");
            return titleEl ? (titleEl.value || titleEl.innerText).trim() : "Dashboard Export";
        });
        await appendTabToPdf(page, pdfDoc, job, 0, 1, dashboardTitle);
    }

    pdfDoc.end();
    await waitForStream(output);
};

const runVisualExport = async (job) => {
    const { dashboardId, format, frozenState, userId, userRole } = job.data;
    const jobId = job.id;
    const isAdmin = userRole === "admin";
    
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
        
        const isOwner = dashboard.createdBy === userId || userId === "anonymous";
        if (dashboard.createdBy && !isOwner && !isAdmin) {
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

        // Bug 1 Fix: Pre-fetch chart data server-side to bypass headless auth issues
        const chartDataCache = {};
        const allTabs = frozenState.tabs || [];
        for (const tab of allTabs) {
            const widgets = tab.widgets || [];
            for (const widget of widgets) {
                if (widget.type === "chart" && widget.chartId) {
                    try {
                        const chart = await Chart.findOne({ chartId: widget.chartId }).lean();
                        if (chart) {
                            const datasetId = chart.dataSource?.datasetId;
                            if (datasetId) {
                                // Replicate client-side query building: merge chart + dashboard filters
                                const dashboardFilters = frozenState.filters || [];
                                const chartQuery = {
                                    ...chart.query,
                                    filters: mergeFilters(chart.query.filters || [], dashboardFilters)
                                };
                                const { results } = await executeDatasetQuery(datasetId, chartQuery);
                                chartDataCache[widget.chartId] = results;
                            }
                        }
                    } catch (err) {
                        logger.warn(`Pre-fetch failed for chart ${widget.chartId}: ${err.message}`, "VisualExportWorker");
                    }
                }
            }
        }
        frozenState.chartDataCache = chartDataCache;

        const { width = 1280, height = 800 } = frozenState.viewport || {};
        // Ensure a minimum width for presentation-ready exports
        const exportWidth = Math.max(1280, width);
        const exportHeight = Math.max(800, height);
        
        await page.setViewport({ width: exportWidth, height: exportHeight });
        
        // Bug 2 Fix: Force light theme and white backgrounds
        await page.evaluate(() => {
            document.documentElement.setAttribute("data-theme", "light");
        });
        await page.emulateMediaType("print");
        
        // Inject styles to fix dark theme bleeding and hide UI elements
        await page.addStyleTag({
            content: `
                .dashboard-editor-page, 
                .dashboard-canvas-wrapper, 
                .dashboard-canvas-grid, 
                .dashboard-widget {
                    background: #ffffff !important;
                    background-color: #ffffff !important;
                    color: #000000 !important;
                }
                .dashboard-editor-topbar, 
                .dashboard-tabs-bar {
                    display: none !important;
                }
                .dashboard-canvas-grid {
                    border: none !important;
                    box-shadow: none !important;
                }
            `
        });

        const exportUrl = `${CLIENT_URL}?view=dashboards&id=${dashboardId}&export=true`;
        await page.evaluateOnNewDocument((state) => {
            window.RENDER_COMPLETE = false;
            window.IS_EXPORT_MODE = true;
            window.__EXPORT_STATE__ = state;
            localStorage.setItem("export_frozen_state", JSON.stringify(state));
        }, frozenState);

        await page.goto(exportUrl, { waitUntil: "networkidle2", timeout: 60000 });
        
        // Bug 2 Fix: Calculate tight content height and force grid height to eliminate black void
        const contentHeight = await page.evaluate(() => {
            const grid = document.querySelector(".dashboard-canvas-grid");
            const widgets = grid ? grid.querySelectorAll(".dashboard-widget") : [];
            if (!grid || widgets.length === 0) return 800;
            
            let maxBottom = 0;
            widgets.forEach(w => {
                const r = w.getBoundingClientRect();
                const relativeBottom = r.bottom - grid.getBoundingClientRect().top;
                maxBottom = Math.max(maxBottom, relativeBottom);
            });
            return Math.ceil(maxBottom) + 24; // 24px padding
        });

        await page.addStyleTag({
            content: `.dashboard-canvas-grid { height: ${contentHeight}px !important; min-height: ${contentHeight}px !important; }`
        });

        await job.updateProgress(50);

        try {
            // The client hydrates deterministic export state when
            // window.IS_EXPORT_MODE is enabled, so capture waits for the
            // explicit render-complete signal instead of live page timing.
            await page.waitForFunction(() => window.RENDER_COMPLETE === true, { timeout: 45000 });
        } catch (e) {
            logger.warn(`Render signal timeout for ${filename}. Proceeding with partial render.`, "VisualExportWorker");
        }

        if (format === "png") {
            // For PNG, we capture the entire dashboard including all tabs stacked
            // To do this, we'll iterate through tabs and take screenshots, then the user gets a composite?
            // Actually, usually PNG is just the first tab or active tab.
            // Requirement says "one tab in one page" for PDF. For PNG, let's just ensure high quality.
            const bounds = await getExportBounds(page);
            await page.screenshot({
                path: filePath,
                type: "png",
                captureBeyondViewport: true,
                clip: bounds,
            });
        } else {
            await writeDashboardPdf(page, filePath, job);
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
