/**
 * retryPolicy.js
 *
 * Task #243 — Retry Logic
 *
 * Centralizes all BullMQ retry configurations for the system.
 * - Exponential backoff: wait time doubles after each failure (2s → 4s → 8s → ...)
 * - Permanent vs transient failure classification
 * - Failed jobs after max attempts are considered permanently failed (sent to DLQ)
 *
 * Usage: import the appropriate policy and spread into queue defaultJobOptions
 * or pass as individual job options via addJob(..., RETRY_POLICIES.STANDARD).
 */

/**
 * Error categories to distinguish transient vs permanent failures.
 * Throw a PermanentError to skip retries entirely and fail immediately.
 */
class PermanentError extends Error {
  constructor(message) {
    super(message);
    this.name = "PermanentError";
    this.permanent = true;
  }
}

/**
 * RETRY_POLICIES
 *
 * STANDARD  - For most background tasks (file processing, data ingestion).
 *             3 attempts with exponential backoff starting at 2 seconds.
 *
 * AGGRESSIVE - For short, fast operations (API calls, small transforms).
 *              5 attempts with a shorter initial delay of 1 second.
 *
 * CONSERVATIVE - For heavy operations where retrying too soon is harmful.
 *                2 attempts with a longer initial delay of 5 seconds.
 *
 * NONE - For jobs that must never retry (one-shot tasks like exports).
 *        1 attempt only, fails immediately on error.
 */
const RETRY_POLICIES = {
  STANDARD: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 2000, // 2s → 4s → 8s
    },
    removeOnComplete: { count: 100 }, // Keep last 100 successful jobs for auditing
    removeOnFail: false,             // Keep ALL failed jobs for DLQ inspection
  },

  AGGRESSIVE: {
    attempts: 5,
    backoff: {
      type: "exponential",
      delay: 1000, // 1s → 2s → 4s → 8s → 16s
    },
    removeOnComplete: { count: 50 },
    removeOnFail: false,
  },

  CONSERVATIVE: {
    attempts: 2,
    backoff: {
      type: "exponential",
      delay: 5000, // 5s → 10s
    },
    removeOnComplete: { count: 50 },
    removeOnFail: false,
  },

  NONE: {
    attempts: 1,
    removeOnComplete: { count: 50 },
    removeOnFail: false,
  },
};

/**
 * Checks if a job error should skip retries and be treated as permanent.
 * Call this inside a worker processor to decide whether to retry or fail fast.
 *
 * @param {Error} error - The error thrown during job processing
 * @returns {boolean} - true = permanent failure, false = transient (retryable)
 */
const isPermanentFailure = (error) => {
  // Explicit permanent classification
  if (error?.permanent === true) return true;

  // Known unrecoverable error types
  const permanentMessages = [
    "ValidationError",
    "CastError",
    "Bad Request",
    "Unauthorized",
    "Forbidden",
    "not found",
    "invalid format",
    "schema mismatch",
  ];

  if (error?.name === "PermanentError") return true;

  return permanentMessages.some((msg) =>
    error?.message?.toLowerCase().includes(msg.toLowerCase())
  );
};

module.exports = {
  RETRY_POLICIES,
  PermanentError,
  isPermanentFailure,
};
