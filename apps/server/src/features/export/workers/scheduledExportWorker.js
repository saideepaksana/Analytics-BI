const ScheduledExport = require("../../../models/ScheduledExport");
const Dashboard = require("../../../models/Dashboard");
const { runVisualExport } = require("./visualExportWorker");
const logger = require("../../../core/logger");

/**
 * Worker handler for scheduled exports.
 * Fetches the schedule, prepares the dashboard state, and runs the visual export.
 */
const runScheduledExport = async (job) => {
    const { scheduleId } = job.data;
    
    try {
        const schedule = await ScheduledExport.findById(scheduleId);
        if (!schedule) {
            logger.error(`Schedule not found: ${scheduleId}`, "ScheduledExportWorker");
            return { status: "failed", reason: "Schedule not found" };
        }

        if (schedule.status === "paused") {
            logger.info(`Schedule ${scheduleId} is paused. Skipping.`, "ScheduledExportWorker");
            return { status: "skipped", reason: "Paused" };
        }

        const dashboard = await Dashboard.findById(schedule.dashboardId).lean();
        if (!dashboard) {
            logger.error(`Dashboard not found for schedule ${scheduleId}: ${schedule.dashboardId}`, "ScheduledExportWorker");
            throw new Error("Dashboard not found");
        }

        // Prepare the "frozenState" which the visualExportWorker expects.
        // We use the dashboard's _rawFrontendState if available, or fall back to empty.
        const frozenState = dashboard._rawFrontendState || {
            layout: dashboard.layout,
            tabs: dashboard.tabs,
            filters: dashboard.filters,
        };

        // Mimic a manual export job payload
        const exportJobData = {
            id: `sched-${scheduleId}-${Date.now()}`,
            data: {
                dashboardId: String(schedule.dashboardId),
                format: schedule.format,
                frozenState,
                userId: schedule.userId,
                userRole: "admin", // Background jobs run with elevated permissions
                exportTheme: "dark",
            },
            updateProgress: async (p) => {
                // You could optionally log progress here
                await job.updateProgress(p);
            }
        };

        logger.info(`Starting scheduled export for dashboard ${schedule.dashboardId} (${schedule.name})`, "ScheduledExportWorker");
        
        const result = await runVisualExport(exportJobData);

        // Update schedule last run
        schedule.lastRunAt = new Date();
        await schedule.save();

        logger.success(`Scheduled export completed: ${result.filename}`, "ScheduledExportWorker");
        
        // TODO: Email the file to schedule.recipients if needed.
        // For now, it stays in the exports directory.

        return { status: "completed", filename: result.filename };

    } catch (err) {
        logger.error(`Scheduled export failed for schedule ${scheduleId}: ${err.message}`, "ScheduledExportWorker");
        throw err;
    }
};

module.exports = { runScheduledExport };
