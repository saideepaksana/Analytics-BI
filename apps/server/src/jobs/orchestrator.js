/**
 * orchestrator.js
 *
 * Task #251 — Worker Orchestration
 *
 * Controls how many background workers run, how jobs are distributed,
 * and how throughput stays stable under load.
 *
 * Responsibilities:
 *   1. Define per-queue concurrency budgets (how many jobs run in parallel).
 *   2. Enforce a global job cap via a semaphore so the process can't be
 *      overwhelmed even if multiple queues fire at once.
 *   3. Provide a bulk-dispatch helper that chunks large arrays into safely-
 *      sized batches before adding them to a queue.
 *   4. Expose live stats (active / waiting / failed counts) for health checks.
 *   5. Drain (pause) or resume individual queues at runtime — useful when
 *      a downstream dependency (e.g. DB) becomes temporarily unavailable.
 */

const { RETRY_POLICIES } = require("./retryPolicy");
const logger = require("../core/logger");

// ---------------------------------------------------------------------------
// Concurrency profile — tweak per environment / deployment size
// ---------------------------------------------------------------------------

/**
 * CONCURRENCY_PROFILES
 *
 * LOW    - Dev / CI environments, minimal parallel pressure.
 * MEDIUM - Standard staging / small production.
 * HIGH   - Large production deployments with many queues.
 *
 * Select via WORKER_CONCURRENCY_PROFILE env var (default: MEDIUM).
 */
const CONCURRENCY_PROFILES = {
    LOW: {
        "background-tasks": 2,
        "bulk-ingestion": 1,
        DEFAULT: 2,
        GLOBAL_MAX: 5,
    },
    MEDIUM: {
        "background-tasks": 5,
        "bulk-ingestion": 3,
        DEFAULT: 3,
        GLOBAL_MAX: 15,
    },
    HIGH: {
        "background-tasks": 10,
        "bulk-ingestion": 5,
        DEFAULT: 5,
        GLOBAL_MAX: 30,
    },
};

const activeProfile =
    CONCURRENCY_PROFILES[
    (process.env.WORKER_CONCURRENCY_PROFILE || "MEDIUM").toUpperCase()
    ] || CONCURRENCY_PROFILES.MEDIUM;

/**
 * Get the concurrency limit for a specific queue.
 * Falls back to the profile's DEFAULT if no specific entry exists.
 *
 * @param {string} queueName
 * @returns {number}
 */
const getConcurrency = (queueName) =>
    activeProfile[queueName] ?? activeProfile.DEFAULT;

// ---------------------------------------------------------------------------
// Global in-flight semaphore
// Prevents total active jobs across ALL workers from exceeding GLOBAL_MAX.
// ---------------------------------------------------------------------------

let _activeJobCount = 0;

const globalSemaphore = {
    get count() {
        return _activeJobCount;
    },
    get limit() {
        return activeProfile.GLOBAL_MAX;
    },

    /**
     * Attempt to acquire a slot. Returns false if at capacity.
     * Call this at the START of each job processor.
     */
    acquire() {
        if (_activeJobCount >= activeProfile.GLOBAL_MAX) {
            return false;
        }
        _activeJobCount++;
        return true;
    },

    /**
     * Release a slot. Call this in finally{} at the END of each job processor.
     */
    release() {
        if (_activeJobCount > 0) _activeJobCount--;
    },
};

// ---------------------------------------------------------------------------
// Bulk-dispatch helper
// ---------------------------------------------------------------------------

const DEFAULT_BATCH_SIZE = 50;

/**
 * Add a large number of jobs to a queue in safe-sized chunks.
 * Prevents Redis from being overwhelmed with thousands of simultaneous writes.
 *
 * @param {Queue}    queue      - BullMQ Queue instance to add jobs to
 * @param {string}   jobName    - Name of the job type
 * @param {Array}    dataItems  - Array of job payloads to enqueue
 * @param {Object}   [options]  - BullMQ job options (merged with STANDARD policy)
 * @param {number}   [batchSize=50] - Max items per Redis pipeline call
 * @returns {Promise<{enqueued: number, batches: number}>}
 */
const bulkDispatch = async (
    queue,
    jobName,
    dataItems,
    options = {},
    batchSize = DEFAULT_BATCH_SIZE
) => {
    if (!Array.isArray(dataItems) || dataItems.length === 0) {
        return { enqueued: 0, batches: 0 };
    }

    const mergedOptions = { ...RETRY_POLICIES.STANDARD, ...options };
    let enqueued = 0;
    let batches = 0;

    for (let i = 0; i < dataItems.length; i += batchSize) {
        const chunk = dataItems.slice(i, i + batchSize);

        const jobs = chunk.map((data) => ({
            name: jobName,
            data,
            opts: mergedOptions,
        }));

        await queue.addBulk(jobs);
        enqueued += chunk.length;
        batches++;

        logger.info(
            `Dispatched batch ${batches} → ${chunk.length} jobs ` +
            `(${enqueued}/${dataItems.length} total) to queue "${queue.name}"`,
            "Orchestrator"
        );
    }

    return { enqueued, batches };
};

// ---------------------------------------------------------------------------
// Queue health helpers
// ---------------------------------------------------------------------------

/**
 * Get live job counts for a queue (active, waiting, failed, delayed, completed).
 *
 * @param {Queue} queue
 * @returns {Promise<Object>}
 */
const getQueueStats = async (queue) => {
    const [active, waiting, failed, delayed, completed] = await Promise.all([
        queue.getActiveCount(),
        queue.getWaitingCount(),
        queue.getFailedCount(),
        queue.getDelayedCount(),
        queue.getCompletedCount(),
    ]);

    return {
        queue: queue.name,
        active,
        waiting,
        failed,
        delayed,
        completed,
        globalActiveJobs: _activeJobCount,
        globalLimit: activeProfile.GLOBAL_MAX,
    };
};

/**
 * Pause a queue — no new jobs will be picked up by workers.
 * Useful when a downstream service is degraded.
 *
 * @param {Queue} queue
 */
const pauseQueue = async (queue) => {
    await queue.pause();
    logger.warn(`Queue "${queue.name}" PAUSED.`, "Orchestrator");
};

/**
 * Resume a previously paused queue.
 *
 * @param {Queue} queue
 */
const resumeQueue = async (queue) => {
    await queue.resume();
    logger.info(`Queue "${queue.name}" RESUMED.`, "Orchestrator");
};

/**
 * Restart a failed job by its ID.
 * Moves the job from 'failed' back to 'wait' status.
 *
 * @param {Queue}  queue
 * @param {string} jobId
 * @returns {Promise<boolean>}
 */
const retryJob = async (queue, jobId) => {
    const job = await queue.getJob(jobId);
    if (!job) {
        logger.error(`Cannot retry job: ID "${jobId}" not found in queue "${queue.name}"`, "Orchestrator");
        return false;
    }

    const state = await job.getState();
    if (state !== "failed") {
        logger.warn(`Job "${jobId}" is currently in "${state}" state. Retry only works for failed jobs.`, "Orchestrator");
        return false;
    }

    await job.retry();
    logger.info(`Manual retry initiated for job "${jobId}" in queue "${queue.name}"`, "Orchestrator");
    return true;
};

// ---------------------------------------------------------------------------
// Re-export the shared bulkIngestionQueue from queue.js
// (queue.js owns all Queue instances — orchestrator must not create its own)
// ---------------------------------------------------------------------------
const { bulkIngestionQueue, backgroundTasksQueue } = require("./queue");

module.exports = {
    CONCURRENCY_PROFILES,
    activeProfile,
    getConcurrency,
    globalSemaphore,
    bulkDispatch,
    getQueueStats,
    pauseQueue,
    resumeQueue,
    retryJob,
    bulkIngestionQueue,
    backgroundTasksQueue,
};
