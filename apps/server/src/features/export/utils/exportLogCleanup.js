const { ExportLog } = require("../../../models/exportLog");
const logger = require("../../../core/logger");

/**
 * Marks all "processing" export logs as "failed" on server startup.
 * This prevents exports from being stuck with spinners if the server crashed/restarted.
 */
const cleanupStaleExportLogs = async () => {
    try {
        const result = await ExportLog.updateMany(
            { status: "processing" },
            { 
                status: "failed", 
                failureReason: "Server restart or unexpected termination." 
            }
        );
        
        if (result.modifiedCount > 0) {
            logger.info(`Cleaned up ${result.modifiedCount} stale export logs.`, "ExportLogCleanup");
        }
    } catch (err) {
        logger.error(`Failed to clean up stale export logs: ${err.message}`, "ExportLogCleanup");
    }
};

module.exports = { cleanupStaleExportLogs };
