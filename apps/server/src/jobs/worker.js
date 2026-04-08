/**
 * worker.js
 *
 * Task #238 — BullMQ Worker Definitions
 * Task #243 — Retry Logic (isPermanentFailure + DLQ routing applied here)
 * Task #251 — Worker Orchestration (getConcurrency + globalSemaphore applied here)
 *
 * How it works end-to-end:
 *   1. initWorkers() starts one Worker per queue using the concurrency level
 *      determined by the orchestrator's CONCURRENCY_PROFILES.
 *   2. Before each job runs, the global semaphore is acquired. If the system
 *      is at capacity the semaphore returns false, the job is re-queued with
 *      a short delay rather than dropped.
 *   3. Inside the processor, isPermanentFailure() distinguishes transient errors
 *      (retried automatically by BullMQ's exponential backoff) from permanent
 *      errors (immediately routed to the Dead Letter Queue and not retried).
 *   4. attachDLQListener() runs alongside each worker to auto-capture any job
 *      that exhausts its retry budget before the worker processor can classify it.
 *   5. shutdownWorkers() drains in-flight jobs cleanly before exit.
 */

const { Worker, DelayedError } = require("bullmq");
const { redisConfig } = require("../core/redis");
const { QUEUE_NAMES, backgroundTasksQueue, bulkIngestionQueue } = require("./queue");
const { RETRY_POLICIES, isPermanentFailure, PermanentError, TransientError } = require("./retryPolicy");
const { sendToDLQ, attachDLQListener } = require("./dlq");
const { getConcurrency, globalSemaphore } = require("./orchestrator");
const logger = require("../core/logger");

// ---------------------------------------------------------------------------
// Internal worker registry
// ---------------------------------------------------------------------------
const workers = {};

// ---------------------------------------------------------------------------
// Processor helpers
// These are thin wrappers that real job handlers will plug into.
// Add a new case here when you introduce a new job type.
// ---------------------------------------------------------------------------
const { runUploadProcessor } = require("./uploadProcessor");

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

/**
 * Dispatch table for background-tasks queue.
 * Each key is a job.name string; each value is an async function (job) => result.
 */
const BACKGROUND_TASK_HANDLERS = {
  // Example handler — remove once you wire in real jobs:
  "test-job": async (job) => {
    const { message } = job.data;
    logger.info(`[test-job] ${message}`, "Worker");
    await new Promise((r) => setTimeout(r, 500));
    return { status: "ok", echo: message };
  },

  // Process file upload from GridFS
  "process-upload": async (job) => {
    return await runUploadProcessor(job.data);
  },
};

/**
 * Dispatch table for bulk-ingestion queue.
 */
const BULK_INGESTION_HANDLERS = {
  // Placeholder: uncomment and implement when wiring bulk CSV/Excel ingest
  // "ingest-csv": async (job) => {
  //   const { fileId, datasetId } = job.data;
  //   return await ingestCsvWorker.run(fileId, datasetId);
  // },
};

// ---------------------------------------------------------------------------
// Generic processor factory
// Wraps the dispatch table with semaphore + retry classification logic.
// ---------------------------------------------------------------------------

/**
 * Build a BullMQ-compatible processor function for a given dispatch table.
 *
 * Semaphore:
 *   Checks the global active-job count before processing. If at capacity,
 *   throws a transient error so BullMQ delays and retries the job later —
 *   no jobs are silently dropped.
 *
 * Retry classification:
 *   - PermanentError / known unrecoverable errors → sent to DLQ, job fails once.
 *   - All other errors → re-thrown so BullMQ applies exponential backoff.
 *
 * @param {Object} handlerMap - { [jobName]: async (job) => result }
 * @returns {Function}        - async (job) => result
 */
const makeProcessor = (handlerMap) => async (job) => {
  // 1. Global concurrency guard
  if (!globalSemaphore.acquire()) {
    const waitMs = 3000 + Math.random() * 2000; // jitter: 3–5 s
    logger.warn(
      `Global limit reached (${globalSemaphore.count}/${globalSemaphore.limit}). ` +
        `Re-queuing job ${job.id} ("${job.name}") after ${Math.round(waitMs)}ms.`,
      "Worker"
    );
    await job.moveToDelayed(Date.now() + waitMs, job.token);
    throw new DelayedError();
  }

  try {
    logger.info(
      `Starting job "${job.name}" (ID: ${job.id}) — ` +
        `attempt ${job.attemptsMade + 1} of ${job.opts.attempts ?? "?"}`,
      "Worker"
    );

    // 2. Route to the correct handler
    const handler = handlerMap[job.name];
    if (!handler) {
      // Unknown job name: permanent failure — no point retrying
      throw new PermanentError(`No handler registered for job name: "${job.name}"`);
    }

    const result = await handler(job);

    logger.success(`Job "${job.name}" (ID: ${job.id}) completed successfully.`, "Worker");
    return result;
  } catch (err) {
    // 3. Classify failure
    if (isPermanentFailure(err)) {
      logger.error(
        `Permanent failure on job "${job.name}" (ID: ${job.id}). ` +
          `Routing to DLQ. Error: ${err.message}`,
        "Worker"
      );
      await sendToDLQ(job, err);

      // Return without re-throwing so BullMQ marks it failed-without-retry
      // (BullMQ will still move it to the failed set; DLQ has the full record).
      throw ensurePermanentError(err);
    }

    // Transient error — log and re-throw so BullMQ applies exponential backoff
    logger.error(
      `Transient failure on job "${job.name}" (ID: ${job.id}), ` +
        `attempt ${job.attemptsMade + 1}. BullMQ will retry. Error: ${err.message}`,
      "Worker"
    );
    throw ensureTransientError(err);
  } finally {
    // 4. Always release the global semaphore slot
    globalSemaphore.release();
  }
};

// ---------------------------------------------------------------------------
// Worker factory
// ---------------------------------------------------------------------------

/**
 * Start a worker for a queue if one is not already running.
 *
 * @param {string}   queueName  - Queue to consume
 * @param {Function} processor  - Built with makeProcessor()
 * @param {Object}   [opts]     - Extra Worker options
 * @returns {Worker}
 */
const startWorker = (queueName, processor, opts = {}) => {
  if (workers[queueName]) {
    logger.warn(`Already running for queue "${queueName}".`, "Worker");
    return workers[queueName];
  }

  const concurrency = getConcurrency(queueName);

  const worker = new Worker(queueName, processor, {
    connection: redisConfig,
    concurrency,
    ...opts,
  });

  worker.once("ready", () => {
    logger.success(
      `Ready — queue: "${queueName}" | concurrency: ${concurrency} | ` +
        `global limit: ${globalSemaphore.limit}`,
      "Worker"
    );
  });

  worker.on("error", (err) => {
    // Connection-level errors (not job errors) — log only, don't exit.
    logger.error(`Connection error for "${queueName}": ${err.message}`, "Worker");
  });

  workers[queueName] = worker;
  return worker;
};

// ---------------------------------------------------------------------------
// System bootstrap
// ---------------------------------------------------------------------------

/**
 * Start all workers and attach DLQ listeners.
 * Called once from src/index.js on server boot.
 */
const initWorkers = () => {
  // Guard: ensure workers are only ever initialized ONCE per process lifetime.
  // Prevents duplicate workers if initWorkers() is accidentally called multiple
  // times (e.g., from test setup, hot-reload quirks, or a mis-placed import).
  if (global.__workers_initialized__) {
    logger.warn("initWorkers() called again — skipping (already initialized).", "Worker");
    return;
  }
  global.__workers_initialized__ = true;

  logger.info(
    `Initializing workers (profile: ${process.env.WORKER_CONCURRENCY_PROFILE || "MEDIUM"})...`,
    "Worker"
  );

  // --- background-tasks worker ---
  startWorker(
    QUEUE_NAMES.BACKGROUND_TASKS,
    makeProcessor(BACKGROUND_TASK_HANDLERS)
  );
  attachDLQListener(QUEUE_NAMES.BACKGROUND_TASKS);

  // --- bulk-ingestion worker ---
  startWorker(
    QUEUE_NAMES.BULK_INGESTION,
    makeProcessor(BULK_INGESTION_HANDLERS)
  );
  attachDLQListener(QUEUE_NAMES.BULK_INGESTION);
};

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------

/**
 * Drain all active jobs and close workers cleanly.
 * Called from SIGINT / SIGTERM in src/index.js.
 */
const shutdownWorkers = async () => {
  logger.warn("Initiating graceful shutdown...", "Worker");
  for (const [queueName, worker] of Object.entries(workers)) {
    logger.info(`Closing worker for "${queueName}"...`, "Worker");
    await worker.close(); // Waits for in-flight jobs to finish
  }
  logger.success("All workers shut down cleanly.", "Worker");
};

module.exports = {
  startWorker,
  initWorkers,
  shutdownWorkers,
  makeProcessor, // exported so feature-specific workers can reuse the wrapper
  BACKGROUND_TASK_HANDLERS,
  BULK_INGESTION_HANDLERS,
};
