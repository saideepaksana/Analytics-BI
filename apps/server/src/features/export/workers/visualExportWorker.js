/**
 * visualExportWorker.js
 */

const mongoose = require("mongoose");
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

        const renderedWidth = pageWidthPt;
        const renderedHeight = Math.max(1, Math.ceil(clipHeight * PX_TO_PT));

        pdfDoc.addPage({
            size: [renderedWidth, renderedHeight],
            margin: PDF_MARGIN,
        });

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
                const tab = tabs[idx];
                if (tab) {
                    const isActive = tab.classList.contains("active");
                    // Only click if it's not already active to avoid no-op that stalls RENDER_COMPLETE
                    if (!isActive) {
                        window.RENDER_COMPLETE = false;
                        tab.click();
                    }
                    return { name: tab.innerText.trim(), wasAlreadyActive: isActive };
                }
                return { name: `Tab ${idx + 1}`, wasAlreadyActive: false };
            }, i);

            // Give React a moment to switch tabs and start loading (skip if already active)
            if (!tabData.wasAlreadyActive) {
                await new Promise(r => setTimeout(r, 100));
            }

            // Bug 2 Fix: Check widget count AFTER the timeout to ensure React has swapped components
            const hasWidgets = await page.evaluate(() => {
                const grid = document.querySelector(".dashboard-canvas-grid");
                return grid ? grid.querySelectorAll(".dashboard-widget").length > 0 : false;
            });

            // Wait for render if there are widgets (skip if already rendered/active)
            if (hasWidgets) {
                const alreadyRendered = await page.evaluate(() => window.RENDER_COMPLETE === true);
                if (!alreadyRendered) {
                    try {
                        await page.waitForFunction(() => window.RENDER_COMPLETE === true, { timeout: 15000 });
                    } catch (e) {
                        logger.warn(`Render timeout for tab ${i}. Proceeding.`);
                    }
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

        // Collect all unique chart IDs across all tabs for parallel fetching
        const chartIdSet = new Set();
        for (const tab of allTabs) {
            for (const widget of (tab.widgets || [])) {
                if (widget.chartId) chartIdSet.add(widget.chartId);
            }
        }
        const uniqueChartIds = Array.from(chartIdSet);

        // Parallel pre-fetch: fetch all chart configs and data concurrently
        if (uniqueChartIds.length > 0) {
            const BATCH_SIZE = 5;
            for (let i = 0; i < uniqueChartIds.length; i += BATCH_SIZE) {
                const batch = uniqueChartIds.slice(i, i + BATCH_SIZE);
                const results = await Promise.allSettled(batch.map(async (chartId) => {
                    // Bug 3 Fix: Handle charts that only have _id and no chartId field.
                    const queryFilter = mongoose.Types.ObjectId.isValid(chartId)
                        ? { $or: [{ chartId }, { _id: chartId }] }
                        : { chartId };

                    const chart = await Chart.findOne(queryFilter).lean();
                    if (!chart) return;

                    const datasetId = chart.dataSource?.datasetId;
                    if (!datasetId) return;

                    const chartType = chart.visualization?.type || chart.type;
                    const isScatter = chartType === "scatter";
                    const isDistribution = chartType === "boxplot" || chartType === "histogram";
                    const isLineOrArea = chartType === "line" || chartType === "area";
                    const hasRawMeasure = (chart.query?.measures || []).some(
                        (m) => String(m.aggregation || "").toUpperCase() === "RAW"
                    );

                    const dashboardFilters = enrichedState.filters || {};
                    let relevantFilters = {};
                    if (Array.isArray(dashboardFilters)) {
                        relevantFilters = dashboardFilters.filter(f => !f.datasetId || f.datasetId === datasetId);
                    } else {
                        relevantFilters = Object.entries(dashboardFilters).reduce((acc, [id, f]) => {
                            if (!f.datasetId || f.datasetId === datasetId) {
                                acc[id] = f;
                            }
                            return acc;
                        }, {});
                    }

                    const cq = {
                        ...chart.query,
                        raw: chart.query?.raw || isScatter || isDistribution || (isLineOrArea && hasRawMeasure),
                        filters: mergeFilters(chart.query?.filters || [], relevantFilters)
                    };

                    const { results } = await executeDatasetQuery(datasetId, cq);
                    chartDataCache[chartId] = results;
                }));

                // Log any failures
                results.forEach((r, idx) => {
                    if (r.status === "rejected") {
                        logger.warn(`Pre-fetch failed for chart ${batch[idx]}: ${r.reason?.message}`, "VisualExportWorker");
                    }
                });
            }
        }
        enrichedState.chartDataCache = chartDataCache;

        const { width = 1280, height = 800 } = enrichedState.viewport || {};
        // Ensure a minimum width for presentation-ready exports
        const exportWidth = Math.max(1280, width);
        const exportHeight = Math.max(800, height);

        await page.setViewport({ width: exportWidth, height: exportHeight });
        await page.emulateMediaType("screen");

        // Block unnecessary resources to speed up page load
        await page.setRequestInterception(true);
        page.on("request", (req) => {
            const resourceType = req.resourceType();
            // Block fonts, media, and external images to speed up rendering
            if (["font", "media"].includes(resourceType)) {
                req.abort();
            } else {
                req.continue();
            }
        });

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

        // Forward console messages from the export page for debugging
        page.on("console", (msg) => {
            const text = msg.text();
            if (text.includes("[Export]") || text.includes("RENDER_COMPLETE")) {
                logger.debug(`[Puppeteer Console] ${text}`, "VisualExportWorker");
            }
        });

        await page.goto(exportUrl, { waitUntil: "load", timeout: 30000 });

        // After 'load', wait briefly for React to mount and hydrate the export state
        await page.waitForSelector(".dashboard-canvas-grid", { timeout: 10000 }).catch(() => {
            logger.warn("Dashboard grid selector not found within 10s", "VisualExportWorker");
        });

        await job.updateProgress(50);

        try {
            // The client hydrates deterministic export state when
            // window.IS_EXPORT_MODE is enabled, so capture waits for the
            // explicit render-complete signal instead of live page timing.
            // With the ChartPreview onChartReady fix, this should fire in <3s.
            await page.waitForFunction(() => window.RENDER_COMPLETE === true, { timeout: 15000 });
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
                    const wasAlreadyActive = await page.evaluate((idx) => {
                        const tabs = document.querySelectorAll(".dashboard-tab-item");
                        const tab = tabs[idx];
                        if (tab) {
                            const isActive = tab.classList.contains("active");
                            if (!isActive) {
                                window.RENDER_COMPLETE = false;
                                tab.click();
                            }
                            return isActive;
                        }
                        return false;
                    }, i);

                    // Wait for render
                    if (!wasAlreadyActive) {
                        await new Promise(r => setTimeout(r, 100));
                        try {
                            await page.waitForFunction(() => window.RENDER_COMPLETE === true, { timeout: 15000 });
                        } catch (e) { }
                    }

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
