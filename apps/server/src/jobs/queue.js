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

// ---------------------------------------------------------------------------
// Queue name registry — single source of truth
// ---------------------------------------------------------------------------
const QUEUE_NAMES = {
  BACKGROUND_TASKS: "background-tasks",
  BULK_INGESTION: "bulk-ingestion",
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
      console.log(`[Queue:${queueName}] ✓ Job ${jobId} completed.`);
    });

    events.on("failed", ({ jobId, failedReason }) => {
      console.error(
        `[Queue:${queueName}] ✗ Job ${jobId} failed — ${failedReason}`
      );
    });

    events.on("stalled", ({ jobId }) => {
      console.warn(
        `[Queue:${queueName}] ⚠ Job ${jobId} stalled (worker likely crashed mid-job).`
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

module.exports = {
  QUEUE_NAMES,
  getQueue,
  getQueueEvents,
  backgroundTasksQueue,
  bulkIngestionQueue,
  addBackgroundTask,
  addBulkIngestionJob,
};
