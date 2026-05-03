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
// Visual export captures the rendered dashboard widgets only.
const EXPORT_SELECTOR = ".dashboard-canvas-grid";
const WIDGET_CROP_PADDING = 0;
const PDF_MARGIN = 0;
const PX_TO_PT = 0.75;

const waitForStream = (stream) => {
    return new Promise((resolve, reject) => {
        stream.on("finish", resolve);
        stream.on("error", reject);
    });
};

const getExportBounds = async (page) => {
    return page.evaluate((selector, padding) => {
        const element = document.querySelector(selector);
        if (!element) return { x: 0, y: 0, width: 1280, height: 800 };

        const rect = element.getBoundingClientRect();
        const widgets = Array.from(element.querySelectorAll(".dashboard-widget"));

        if (widgets.length === 0) {
            return {
                x: Math.max(0, Math.floor(rect.left + window.scrollX)),
                y: Math.max(0, Math.floor(rect.top + window.scrollY)),
                width: Math.max(1, Math.ceil(rect.width)),
                height: Math.max(1, Math.ceil(rect.height)),
            };
        }

        let minLeft = Number.POSITIVE_INFINITY;
        let minTop = Number.POSITIVE_INFINITY;
        let maxRight = Number.NEGATIVE_INFINITY;
        let maxBottom = Number.NEGATIVE_INFINITY;

        widgets.forEach((widget) => {
            const r = widget.getBoundingClientRect();
            minLeft = Math.min(minLeft, r.left);
            minTop = Math.min(minTop, r.top);
            maxRight = Math.max(maxRight, r.right);
            maxBottom = Math.max(maxBottom, r.bottom);
        });

        const x = Math.max(0, Math.floor(minLeft + window.scrollX - padding));
        const y = Math.max(0, Math.floor(minTop + window.scrollY - padding));
        const width = Math.max(1, Math.ceil(maxRight - minLeft + padding * 2));
        const height = Math.max(1, Math.ceil(maxBottom - minTop + padding * 2));

        return { x, y, width, height };
    }, EXPORT_SELECTOR, WIDGET_CROP_PADDING);
};

/**
 * Appends a tab's content to the PDF document.
 * Slices vertically if the content is longer than one page.
 */
const appendTabToPdf = async (page, pdfDoc, job, tabIndex, totalTabs, tabName) => {
    const bounds = await getExportBounds(page);

    const pageWidthPt = Math.max(1, Math.ceil(bounds.width * PX_TO_PT));
    const pageHeightPt = Math.max(1, Math.ceil(bounds.height * PX_TO_PT));
    const totalSlices = 1;
    const sliceHeight = bounds.height;

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
            size: [pageWidthPt, pageHeightPt],
            margin: PDF_MARGIN,
        });

        const renderedWidth = pageWidthPt;
        const renderedHeight = Math.max(1, Math.floor(clipHeight * PX_TO_PT));

        pdfDoc.image(imageBuffer, 0, 0, {
            width: renderedWidth,
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

    const { selectedTabs = [] } = job.data;

    // Detect tabs
    const tabSelectors = await page.$$(".dashboard-tab-item");

    if (tabSelectors.length > 0) {
        for (let i = 0; i < tabSelectors.length; i++) {
            const tabId = await page.evaluate((idx) => {
                const tabs = document.querySelectorAll(".dashboard-tab-item");
                // In our app, the tab ID might be stored in a data attribute or we can just use index if matched with selectedTabs
                // But safer to check the tab's ID or index.
                return tabs[idx].getAttribute("data-tab-id") || String(idx);
            }, i);

            // If selectedTabs is provided, only export those. Otherwise export all.
            if (selectedTabs.length > 0 && !selectedTabs.includes(tabId)) {
                continue;
            }

            // Click the tab and get its name
            const tabData = await page.evaluate((idx) => {
                const tabs = document.querySelectorAll(".dashboard-tab-item");
                if (tabs[idx]) {
                    window.RENDER_COMPLETE = false;
                    tabs[idx].click();
                    return { name: tabs[idx].innerText.trim() };
                }
                return { name: `Tab ${idx + 1}` };
            }, i);

            // Give React a moment to switch tabs and start loading
            await new Promise(r => setTimeout(r, 500));

            // Bug 2 Fix: Check widget count AFTER the timeout to ensure React has swapped components
            const hasWidgets = await page.evaluate(() => {
                const grid = document.querySelector(".dashboard-canvas-grid");
                return grid ? grid.querySelectorAll(".dashboard-widget").length > 0 : false;
            });

            // Wait for render if there are widgets
            if (hasWidgets) {
                try {
                    await page.waitForFunction(() => window.RENDER_COMPLETE === true, { timeout: 30000 });
                } catch (e) {
                    logger.warn(`Render timeout for tab ${i}. Proceeding.`);
                }
            }

            // Bug 1 Fix: Calculate and inject tight content height PER-TAB to avoid black void on different layouts
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
    const { dashboardId, format, frozenState, userId, userRole, exportTheme } = job.data;
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
                    dashboardId: dashboardId,
                    format,
                    status: "processing",
                    exportedBy: userId || "anonymous",
                    filename,
                    recordCount: 0,
                    exportState: frozenState,
                    exportedAt: Date.now(),
                },
                $unset: { failureReason: "" },
            },
            { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
        );

        page = await puppeteerService.acquirePage();

        // Bug 11 Fix: Avoid direct mutation of job.data.frozenState
        const enrichedState = { ...frozenState };
        const chartDataCache = {};
        const allTabs = enrichedState.tabs || [];
        for (const tab of allTabs) {
            const widgets = tab.widgets || [];
            for (const widget of widgets) {
                if (widget.chartId) {
                    try {
                        // Bug 3 Fix: Handle charts that only have _id and no chartId field
                        const chart = await Chart.findOne({
                            $or: [{ chartId: widget.chartId }, { _id: widget.chartId }]
                        }).lean();

                        if (chart) {
                            const datasetId = chart.dataSource?.datasetId;
                            if (datasetId) {
                                // Replicate client-side query building: merge chart + dashboard filters
                                const dashboardFilters = enrichedState.filters || [];
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
        enrichedState.chartDataCache = chartDataCache;

        const { width = 1280, height = 800 } = enrichedState.viewport || {};
        // Ensure a minimum width for presentation-ready exports
        const exportWidth = Math.max(1280, width);
        const exportHeight = Math.max(800, height);

        await page.setViewport({ width: exportWidth, height: exportHeight });
        await page.emulateMediaType("print");

        // Pass auth headers to Puppeteer so it can authenticate with the API
        if (userId) {
            await page.setExtraHTTPHeaders({
                "x-user-id": String(userId),
                "x-user-role": String(userRole || "admin")
            });
        }

        const exportUrl = `${CLIENT_URL}?view=dashboards&id=${dashboardId}&export=true`;
        await page.evaluateOnNewDocument((state) => {
            window.RENDER_COMPLETE = false;
            window.IS_EXPORT_MODE = true;
            window.DISABLE_CHART_ANIMATIONS = true;
            window.__EXPORT_STATE__ = state;
            localStorage.setItem("export_frozen_state", JSON.stringify(state));
        }, enrichedState);

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

        const resolvedTheme = exportTheme || "dark";

        // Apply styles and theme AFTER navigation and render complete
        await page.evaluate((theme) => {
            document.documentElement.setAttribute("data-theme", theme);
        }, resolvedTheme);

        // Inject styles to hide UI elements and prevent borders/shadows in exports
        await page.addStyleTag({
            content: `
                html, body {
                    background: #0b0f19 !important;
                }
                .dashboard-canvas-wrapper,
                .dashboard-canvas-grid {
                    background: #0b0f19 !important;
                }
                .dashboard-canvas-wrapper {
                    padding: 0 !important;
                }
                .dashboard-editor-topbar {
                    display: none !important;
                }
                .dashboard-canvas-grid,
                .dashboard-widget {
                    border: none !important;
                    box-shadow: none !important;
                }
            `
        });

        const { selectedTabs = [] } = job.data;

        if (format === "png") {
            if (selectedTabs.length > 1) {
                const filenames = [];
                const tabSelectors = await page.$$(".dashboard-tab-item");

                for (let i = 0; i < tabSelectors.length; i++) {
                    const tabId = await page.evaluate((idx) => {
                        const tabs = document.querySelectorAll(".dashboard-tab-item");
                        return tabs[idx].getAttribute("data-tab-id") || String(idx);
                    }, i);

                    logger.info(`Checking tab ${i}: id=${tabId}, selected=${selectedTabs.includes(tabId)}`, "VisualExportWorker");
                    if (!selectedTabs.includes(tabId)) continue;

                    // Switch tab
                    await page.evaluate((idx) => {
                        const tabs = document.querySelectorAll(".dashboard-tab-item");
                        if (tabs[idx]) {
                            window.RENDER_COMPLETE = false;
                            tabs[idx].click();
                        }
                    }, i);

                    // Wait for render
                    await new Promise(r => setTimeout(r, 500));
                    try {
                        await page.waitForFunction(() => window.RENDER_COMPLETE === true, { timeout: 30000 });
                    } catch (e) { }

                    const tabFilename = `dashboard_${dashboardId}_tab_${i}_${Date.now()}.png`;
                    const tabPath = path.join(EXPORT_DIR, tabFilename);
                    const bounds = await getExportBounds(page);

                    await page.screenshot({
                        path: tabPath,
                        type: "png",
                        captureBeyondViewport: true,
                        clip: bounds,
                    });
                    filenames.push(tabFilename);
                }

                // Hide tabs bar AFTER capturing all screenshots
                await page.evaluate(() => {
                    const bar = document.querySelector(".dashboard-tabs-bar");
                    if (bar) bar.style.display = "none";
                });

                await ExportLog.findOneAndUpdate({ jobId }, {
                    status: "completed",
                    filename: filenames[0], // Schema only supports one filename for now
                    exportedAt: Date.now()
                });

                return { status: "completed", filenames };
            } else {
                // Single PNG (either one tab selected or default behavior)
                const bounds = await getExportBounds(page);
                await page.screenshot({
                    path: filePath,
                    type: "png",
                    captureBeyondViewport: true,
                    clip: bounds,
                });
                await ExportLog.findOneAndUpdate({ jobId }, {
                    status: "completed",
                    filename,
                    exportedAt: Date.now()
                });

                return { status: "completed", filename };
            }
        } else {
            await writeDashboardPdf(page, filePath, job);
            await ExportLog.findOneAndUpdate({ jobId }, {
                status: "completed",
                filename,
                exportedAt: Date.now()
            });
            return { status: "completed", filename };
        }

    } catch (err) {
        logger.error(`Visual export failed: ${err.message}`, "VisualExportWorker");
        await ExportLog.findOneAndUpdate({ jobId }, {
            status: "failed",
            failureReason: err.message,
            filename: null
        }).catch(() => { });

        if (fs.existsSync(filePath)) {
            try { fs.unlinkSync(filePath); } catch (e) { }
        }
        throw err;
    } finally {
        puppeteerService.releasePage(page);
    }
};

module.exports = { runVisualExport };
