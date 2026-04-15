/**
 * dlq.js — Dead Letter Queue
 *
 * Task #243 — Retry Logic (Failure Path)
 *
 * When a job exhausts all retry attempts and still fails, BullMQ moves it to
 * the failed state. This module provides:
 *   1. A dedicated "dead-letter-queue" where permanently failed jobs are recorded.
 *   2. A helper (sendToDLQ) to explicitly route a job there when the worker
 *      detects a permanent (non-retryable) failure.
 *   3. A QueueEvents listener that automatically picks up any job that reaches
 *      the BullMQ "failed" event and logs / forwards it to the DLQ.
 *
 * Why a separate DLQ queue?
 * - Keeps the main queues clean — only in-progress or waiting jobs live there.
 * - Gives you a single place to inspect, replay, or alert on all dead jobs.
 * - The DLQ itself uses RETRY_POLICIES.NONE so jobs never retry again once here.
 */

const { Queue, QueueEvents } = require("bullmq");
const { redisConnection } = require("../core/redis");
const { RETRY_POLICIES } = require("./retryPolicy");
const logger = require("../core/logger");

const DLQ_NAME = "dead-letter-queue";

// Singleton DLQ queue instance
const dlqQueue = new Queue(DLQ_NAME, {
    connection: redisConnection,
    defaultJobOptions: {
        ...RETRY_POLICIES.NONE,         // No retries — this is the end of the line
        removeOnComplete: { count: 500 }, // Keep last 500 dead-job records for audit
        removeOnFail: false,
    },
});

/**
 * Send a failed job explicitly to the DLQ.
 * Call this from a worker when isPermanentFailure() returns true.
 *
 * @param {import('bullmq').Job} job  - The original BullMQ job that failed
 * @param {Error}                err  - The error that caused the failure
 */
const sendToDLQ = async (job, err) => {
    try {
        await dlqQueue.add(
            job.name,
            {
                originalQueue: job.queueName,
                originalJobId: job.id,
                originalData: job.data,
                failedReason: err?.message || "Unknown error",
                failedAt: new Date().toISOString(),
                attemptsMade: job.attemptsMade,
                stackTrace: err?.stack || null,
            },
            { jobId: `dlq-${job.id}-${Date.now()}` }
        );

        logger.error(
            `Job "${job.name}" (ID: ${job.id}) from queue "${job.queueName}" ` +
            `quarantined after ${job.attemptsMade} attempt(s). Reason: ${err?.message}`,
            "DLQ"
        );
    } catch (dlqErr) {
        logger.error(`Could not write to dead-letter-queue: ${dlqErr.message}`, "DLQ");
    }
};

/**
 * Attach a QueueEvents listener to any source queue so that jobs that
 * exhaust ALL retry attempts are automatically forwarded to the DLQ.
 *
 * Call once per source queue during app boot.
 *
 * @param {string} sourceQueueName - The name of the queue to watch
 */
const attachDLQListener = (sourceQueueName) => {
    const events = new QueueEvents(sourceQueueName, { connection: redisConnection });

    events.on("failed", async ({ jobId, failedReason, prev }) => {
        // "prev" holds the previous state; only act on final failure
        // (BullMQ sets prev = 'active' when all retries are exhausted)
        if (prev !== "active") return;

        try {
            await dlqQueue.add(
                `auto-captured:${sourceQueueName}`,
                {
                    originalQueue: sourceQueueName,
                    originalJobId: jobId,
                    failedReason,
                    capturedAt: new Date().toISOString(),
                },
                { jobId: `dlq-auto-${jobId}-${Date.now()}` }
            );

            logger.error(
                `Auto-captured exhausted job ${jobId} from queue "${sourceQueueName}". ` +
                `Reason: ${failedReason}`,
                "DLQ"
            );
        } catch (err) {
            logger.error(`Auto-capture failed: ${err.message}`, "DLQ");
        }
    });

    logger.info(`Watching queue "${sourceQueueName}" for exhausted failures.`, "DLQ");
};

module.exports = {
    DLQ_NAME,
    dlqQueue,
    sendToDLQ,
    attachDLQListener,
};
