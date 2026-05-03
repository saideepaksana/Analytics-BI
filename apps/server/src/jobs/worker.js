/**
 * worker.js
 *
 * Task #238 — BullMQ Worker Definitions
 * Task #243 — Retry Logic (isPermanentFailure + DLQ routing applied here)
 * Task #251 — Worker Orchestration (getConcurrency + globalSemaphore applied here)
 */

const path = require("path");
const fs = require("fs");
const os = require("os");
const { Worker, DelayedError } = require("bullmq");
const { redisConfig } = require("../core/redis");
const { QUEUE_NAMES, backgroundTasksQueue, bulkIngestionQueue } = require("./queue");
const { RETRY_POLICIES, isPermanentFailure, PermanentError, TransientError } = require("./retryPolicy");
const { sendToDLQ, attachDLQListener } = require("./dlq");
const { getConcurrency, globalSemaphore } = require("./orchestrator");
const logger = require("../core/logger");
const { getVisualExportAvailabilityError } = require("../features/export/utils/visualExportAvailability");

const { runUploadProcessor } = require("./uploadProcessor");
const { runRawExport } = require("../features/export/workers/rawExportWorker");
const { runScheduledExport } = require("../features/export/workers/scheduledExportWorker");

const EXPORT_DIR = path.join(os.tmpdir(), "analytics-bi", "exports");

/**
 * Periodically cleans up old export files (older than 1 hour)
 */
const cleanupOldExports = () => {
    if (!fs.existsSync(EXPORT_DIR)) return;
    
    const scanDir = (dir) => {
        if (!fs.existsSync(dir)) return;
        const files = fs.readdirSync(dir);
        const now = Date.now();
        const TTL = 60 * 60 * 1000; // 1 hour

        files.forEach(file => {
            const filePath = path.join(dir, file);
            const stats = fs.statSync(filePath);
            if (now - stats.mtimeMs > TTL) {
                try {
                    fs.unlinkSync(filePath);
                    logger.info("Deleted stale export artifact", "WorkerCleanup", {
                        file,
                        filePath,
                    });
                } catch (e) {
                    logger.warn("Failed to delete stale export artifact", "WorkerCleanup", {
                        file,
                        filePath,
                        error: e,
                    });
                }
            }
        });
    };

    scanDir(path.join(EXPORT_DIR, "raw"));
    scanDir(path.join(EXPORT_DIR, "visual"));
};

// Run cleanup every 15 minutes
setInterval(cleanupOldExports, 15 * 60 * 1000);
// Also run on startup
setTimeout(cleanupOldExports, 5000);

function ensurePermanentError(err) {
    if (!err) return new PermanentError("Unknown permanent error");
    if (err instanceof PermanentError || err?.name === "PermanentError" || err?.permanent === true) return err;
    return new PermanentError(err.message || "Permanent error", { cause: err });
}

function ensureTransientError(err) {
    if (!err) return new TransientError("Unknown transient error");
    if (err instanceof TransientError || err?.name === "TransientError") return err;
    return new TransientError(err.message || "Transient error", { cause: err });
}

const BACKGROUND_TASK_HANDLERS = {
    "test-job": async (job) => {
        const { message, duration, simulateFailure } = job.data;
        if (simulateFailure) throw new Error(`Simulated failure for job ${job.id}`);
        await new Promise((r) => setTimeout(r, duration || 500));
        return { status: "ok", echo: message };
    },
    "process-upload": async (job) => {
        return await runUploadProcessor(job.data);
    },
};

const BULK_INGESTION_HANDLERS = {
    "process-ingestion": runUploadProcessor,
};

const RAW_EXPORT_HANDLERS = {
    "raw-export": runRawExport,
};

let cachedVisualExportHandler = null;

const getVisualExportHandler = () => {
    const availabilityError = getVisualExportAvailabilityError();
    if (availabilityError) {
        throw new PermanentError(availabilityError);
    }

    if (!cachedVisualExportHandler) {
        ({ runVisualExport: cachedVisualExportHandler } = require("../features/export/workers/visualExportWorker"));
    }

    return cachedVisualExportHandler;
};

const DASHBOARD_EXPORT_HANDLERS = {
    "dashboard-export": async (job) => {
        const handler = getVisualExportHandler();
        return handler(job);
    },
};

const SCHEDULED_EXPORT_HANDLERS = {
    "scheduled-export": runScheduledExport,
};

const workers = {};

const makeProcessor = (handlers, queueName = "unknown") => async (job) => {
    const context = {
        queueName,
        jobId: String(job.id),
        jobName: job.name,
    };

    return logger.withContext(context, async () => {
        const handler = handlers[job.name];
        if (!handler) {
            logger.error("No handler found for job in this worker pool", "Worker", {
                queueName,
                jobName: job.name,
            });
            throw new PermanentError(`Unrecognized job: ${job.name}`);
        }

        try {
            await globalSemaphore.acquire();
            logger.info("Started worker job", "Worker", {
                queueName,
                jobName: job.name,
                attemptsMade: job.attemptsMade,
                maxAttempts: job.opts?.attempts,
            });

            const result = await handler(job);

            logger.success("Finished worker job", "Worker", {
                queueName,
                jobName: job.name,
            });
            return result;
        } catch (err) {
            if (isPermanentFailure(err)) {
                logger.error("Permanent worker failure", "Worker", {
                    queueName,
                    jobName: job.name,
                    attemptsMade: job.attemptsMade,
                    error: err,
                });
                await sendToDLQ(job, err);
                throw ensurePermanentError(err);
            }

            logger.error("Transient worker failure", "Worker", {
                queueName,
                jobName: job.name,
                attemptsMade: job.attemptsMade,
                nextAttempt: job.attemptsMade + 1,
                error: err,
            });
            throw ensureTransientError(err);
        } finally {
            globalSemaphore.release();
        }
    });
};

const startWorker = (queueName, processor, opts = {}) => {
    if (workers[queueName]) return workers[queueName];
    const concurrency = getConcurrency(queueName);
    const worker = new Worker(queueName, processor, {
        connection: redisConfig,
        concurrency,
        lockDuration: 120000, // 120s (heavy Puppeteer renders)
        lockRenewTime: 30000, // 30s
        maxStalledCount: 3,
        stalledInterval: 60000, // 60s
        ...opts,
    });
    worker.once("ready", () => {
        logger.success("Worker ready", "Worker", {
            queueName,
            concurrency,
        });
    });
    workers[queueName] = worker;
    return worker;
};

const initWorkers = () => {
    if (global.__workers_initialized__) return;
    global.__workers_initialized__ = true;

    startWorker(QUEUE_NAMES.BACKGROUND_TASKS, makeProcessor(BACKGROUND_TASK_HANDLERS, QUEUE_NAMES.BACKGROUND_TASKS));
    attachDLQListener(QUEUE_NAMES.BACKGROUND_TASKS);

    startWorker(QUEUE_NAMES.BULK_INGESTION, makeProcessor(BULK_INGESTION_HANDLERS, QUEUE_NAMES.BULK_INGESTION));
    attachDLQListener(QUEUE_NAMES.BULK_INGESTION);

    startWorker(QUEUE_NAMES.RAW_EXPORT, makeProcessor(RAW_EXPORT_HANDLERS, QUEUE_NAMES.RAW_EXPORT));
    startWorker(QUEUE_NAMES.DASHBOARD_EXPORT, makeProcessor(DASHBOARD_EXPORT_HANDLERS, QUEUE_NAMES.DASHBOARD_EXPORT));
    startWorker(QUEUE_NAMES.SCHEDULED_EXPORT, makeProcessor(SCHEDULED_EXPORT_HANDLERS, QUEUE_NAMES.SCHEDULED_EXPORT));

    const visualExportAvailabilityError = getVisualExportAvailabilityError();
    if (visualExportAvailabilityError) {
        logger.warn(visualExportAvailabilityError, "Worker");
    }
};

const shutdownWorkers = async () => {
    for (const [queueName, worker] of Object.entries(workers)) {
        await worker.close();
    }
};

module.exports = {
    startWorker,
    initWorkers,
    shutdownWorkers,
    makeProcessor,
    BACKGROUND_TASK_HANDLERS,
    BULK_INGESTION_HANDLERS,
    RAW_EXPORT_HANDLERS,
    DASHBOARD_EXPORT_HANDLERS,
};
