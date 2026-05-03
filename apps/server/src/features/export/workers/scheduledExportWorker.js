const ScheduledExport = require("../../../models/ScheduledExport");
const Dashboard = require("../../../models/Dashboard");
const { runVisualExport } = require("./visualExportWorker");
const emailService = require("../../../services/emailService");
const logger = require("../../../core/logger");
const path = require("path");
const os = require("os");

const EXPORT_DIR = path.join(os.tmpdir(), "analytics-bi", "exports", "visual");

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
                selectedTabs: schedule.selectedTabs,
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

        logger.success(`Scheduled export completed: ${result.filename || result.filenames?.join(", ")}`, "ScheduledExportWorker");
        
        // Send email if recipients exist
        if (schedule.recipients && schedule.recipients.length > 0) {
            try {
                const isPng = schedule.format === "png";
                const filenames = result.filenames || [result.filename];
                
                const attachments = filenames.map((fname, idx) => ({
                    filename: fname,
                    path: path.join(EXPORT_DIR, fname),
                    cid: isPng ? `dashboard-image-${idx}` : undefined
                }));

                const htmlContent = isPng ? `
                    <div style="font-family: sans-serif; color: #333;">
                        <p>Hello,</p>
                        <p>Here is your scheduled snapshot of the <b>${schedule.name}</b> dashboard:</p>
                        ${filenames.map((_, idx) => `
                            <div style="margin: 20px 0; border: 1px solid #ddd; border-radius: 8px; overflow: hidden; max-width: 1000px;">
                                <img src="cid:dashboard-image-${idx}" alt="Dashboard Tab Snapshot" style="width: 100%; display: block;" />
                            </div>
                        `).join("")}
                        <p>Best regards,<br/>Analytics BI Team</p>
                    </div>
                ` : undefined;

                await emailService.sendMail({
                    to: schedule.recipients,
                    subject: `Scheduled Dashboard Export: ${schedule.name}`,
                    text: `Hello,\n\nPlease find the scheduled export for your dashboard "${schedule.name}" attached.\n\nBest regards,\nAnalytics BI Team`,
                    html: htmlContent,
                    attachments
                });
                logger.info(`Email sent to recipients for schedule ${scheduleId}`, "ScheduledExportWorker");
            } catch (emailErr) {
                logger.error(`Failed to email schedule ${scheduleId}: ${emailErr.message}`, "ScheduledExportWorker");
            }
        }

        return { status: "completed", filenames: result.filenames || [result.filename] };

    } catch (err) {
        logger.error(`Scheduled export failed for schedule ${scheduleId}: ${err.message}`, "ScheduledExportWorker");
        throw err;
    }
};

module.exports = { runScheduledExport };
