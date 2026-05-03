/**
 * queue.js
 *
 * Task #238 — BullMQ Queue Definitions
 * Task #243 — Retry Logic (retry policy applied here at queue level)
 *
 * Defines and exports all queue instances for the system.
 * Each queue is a singleton — calling getQueue() twice with the same name
 * returns the same instance.
 *
 * QueueEvents listeners are attached here for global job-lifecycle logging.
 * DLQ attachment is handled by attachDLQListener() called from worker.js boot.
 */

const { Queue, QueueEvents } = require("bullmq");
const { redisConnection } = require("../core/redis");
const { RETRY_POLICIES } = require("./retryPolicy");
const logger = require("../core/logger");

// ---------------------------------------------------------------------------
// Queue name registry — single source of truth
// ---------------------------------------------------------------------------
const QUEUE_NAMES = {
    BACKGROUND_TASKS: "background-tasks",
    BULK_INGESTION: "bulk-ingestion",
    RAW_EXPORT: "raw-export",
    DASHBOARD_EXPORT: "dashboard-export",
    SCHEDULED_EXPORT: "scheduled-export",
    // Extend here as new queues are introduced
};

// Singleton store
const queues = {};
const queueEventListeners = {};

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Get or create a BullMQ queue with the given name.
 * Attaches QueueEvents log listeners on first creation.
 *
 * @param {string} queueName                  - Queue identifier (use QUEUE_NAMES)
 * @param {Object} [defaultJobOptions]        - Override default retry policy
 * @returns {Queue}
 */
const getQueue = (queueName, defaultJobOptions = RETRY_POLICIES.STANDARD) => {
    if (!queues[queueName]) {
        queues[queueName] = new Queue(queueName, {
            connection: redisConnection,
            defaultJobOptions,
        });

        // QueueEvents — global monitoring for this queue
        const events = new QueueEvents(queueName, { connection: redisConnection });

        events.on("completed", ({ jobId }) => {
            logger.success(`Job ${jobId} completed.`, `Queue:${queueName}`);
        });

        events.on("failed", ({ jobId, failedReason }) => {
            logger.error(`Job ${jobId} failed — ${failedReason}`, `Queue:${queueName}`);
        });

        events.on("stalled", ({ jobId }) => {
            logger.warn(
                `Job ${jobId} stalled (worker likely crashed mid-job).`,
                `Queue:${queueName}`
            );
        });

        queueEventListeners[queueName] = events;
    }

    return queues[queueName];
};

// ---------------------------------------------------------------------------
// Convenience accessor for QueueEvents (needed by waitUntilFinished)
// ---------------------------------------------------------------------------

/**
 * Get the QueueEvents instance for a given queue name.
 * Must be called after getQueue() has been called for that name.
 */
const getQueueEvents = (queueName) => queueEventListeners[queueName];

// ---------------------------------------------------------------------------
// Named queue instances — import these directly where needed
// ---------------------------------------------------------------------------

/** General background task queue (standard retry policy) */
const backgroundTasksQueue = getQueue(
    QUEUE_NAMES.BACKGROUND_TASKS,
    RETRY_POLICIES.STANDARD
);

/**
 * Bulk ingestion queue (conservative retry — heavy jobs, fewer retries).
 * Worker concurrency for this queue is lower (see orchestrator.js).
 */
const bulkIngestionQueue = getQueue(
    QUEUE_NAMES.BULK_INGESTION,
    RETRY_POLICIES.CONSERVATIVE
);

/** Raw data export queue (standard policy) */
const rawExportQueue = getQueue(
    QUEUE_NAMES.RAW_EXPORT,
    RETRY_POLICIES.STANDARD
);

/** Dashboard visual export queue (standard policy, but can be heavy) */
const dashboardExportQueue = getQueue(
    QUEUE_NAMES.DASHBOARD_EXPORT,
    RETRY_POLICIES.STANDARD
);

/** Scheduled export queue for recurring jobs */
const scheduledExportQueue = getQueue(
    QUEUE_NAMES.SCHEDULED_EXPORT,
    RETRY_POLICIES.STANDARD
);

// ---------------------------------------------------------------------------
// Convenience helpers
// ---------------------------------------------------------------------------

/**
 * Add a job to the background-tasks queue.
 * Optionally override the retry policy per job.
 *
 * @param {string}  jobName  - Logical job type name (e.g. "process-dataset")
 * @param {Object}  data     - Job payload
 * @param {Object}  [opts]   - Per-job BullMQ options (merged on top of defaults)
 * @returns {Promise<import('bullmq').Job>}
 */
const addBackgroundTask = async (jobName, data, opts = {}) => {
    return backgroundTasksQueue.add(jobName, data, opts);
};

/**
 * Add a job to the bulk-ingestion queue.
 *
 * @param {string}  jobName
 * @param {Object}  data
 * @param {Object}  [opts]
 * @returns {Promise<import('bullmq').Job>}
 */
const addBulkIngestionJob = async (jobName, data, opts = {}) => {
    return bulkIngestionQueue.add(jobName, data, opts);
};

/**
 * Wait for a job in a specific queue to finish (complete or fail).
 * Uses the Job instance method for reliable waiting.
 *
 * @param {string} queueName
 * @param {string} jobId
 * @param {number} [timeout=30000]
 * @returns {Promise<any>} - Resolves with job return value, rejects on failure
 */
const waitUntilFinished = async (queueName, jobId, timeout = 30000) => {
    const queue = queues[queueName];
    if (!queue) throw new Error(`Queue "${queueName}" not initialized.`);

    const job = await queue.getJob(jobId);
    if (!job) throw new Error(`Job "${jobId}" not found in queue "${queueName}".`);

    const events = getQueueEvents(queueName);
    if (!events) throw new Error(`QueueEvents for "${queueName}" not initialized.`);

    return job.waitUntilFinished(events, timeout);
};

module.exports = {
    QUEUE_NAMES,
    getQueue,
    getQueueEvents,
    waitUntilFinished,
    backgroundTasksQueue,
    bulkIngestionQueue,
    rawExportQueue,
    dashboardExportQueue,
    scheduledExportQueue,
    addBackgroundTask,
    addBulkIngestionJob,
};
