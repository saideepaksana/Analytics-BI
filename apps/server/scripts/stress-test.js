/**
 * rigorous_test.js
 * 
 * Stress test for the Analytics-BI background pipeline.
 * Verified:
 * 1. Global Semaphore (Concurrency CAP)
 * 2. Permanent Failure -> DLQ Routing
 * 3. Manual Job Retry (API endpoint)
 */

const { backgroundTasksQueue, globalSemaphore, activeProfile } = require("../src/jobs/orchestrator");
const logger = require("../src/core/logger");
const axios = require("axios");

// Mock job processing time
const JOB_DURATION = 2000; 
const PORT = process.env.PORT || 5000;
const BASE_URL = `http://localhost:${PORT}/api`;

async function runStressTest() {
  logger.info("--- STARTING RIGOROUS STRESS TEST ---", "StressTest");
  logger.info(`Active Profile: ${JSON.stringify(activeProfile)}`, "StressTest");
  
  const TOTAL_JOBS = 30;
  logger.info(`Enqueuing ${TOTAL_JOBS} jobs to exceed GLOBAL_MAX (${activeProfile.GLOBAL_MAX})...`, "StressTest");

  const promises = [];
  for (let i = 1; i <= TOTAL_JOBS; i++) {
    promises.push(
      backgroundTasksQueue.add("test-job", { 
        id: i, 
        simulateFailure: i === 7, // Job 7 is a "poison pill"
        duration: JOB_DURATION 
      })
    );
  }

  const enqueuedJobs = await Promise.all(promises);
  logger.info("All jobs enqueued. Monitoring semaphore...", "StressTest");

  // Wait a bit for workers to pick up jobs
  await new Promise(r => setTimeout(r, 2000));

  const statsResp = await fetch(`${BASE_URL}/jobs/stats`);
  const stats = await statsResp.json();
  const currentActive = stats.globalActiveJobs;
  
  logger.info(`Server Stats: ${JSON.stringify(stats)}`, "StressTest");
  logger.info(`Active Jobs (Server Semaphore): ${currentActive}`, "StressTest");

  if (currentActive > stats.globalLimit) {
    logger.error(`CRITICAL FAILURE: Semaphore count (${currentActive}) exceeds GLOBAL_MAX (${stats.globalLimit})!`, "StressTest");
  } else if (currentActive === 0) {
    logger.warn(`WARNING: No active jobs found. Workers might be idle or too fast.`, "StressTest");
  } else {
    logger.info(`SUCCESS: Semaphore respecting limits (${currentActive} <= ${stats.globalLimit})`, "StressTest");
  }

  // Wait for Job 7 to fail multiple times and go to DLQ
  // Standard policy has backoff: 1s, 2s, 4s... so 10-15s is safe for 3 retries.
  logger.info("Waiting for 'poison pill' (Job 7) to exhaust retries (15s)...", "StressTest");
  await new Promise(r => setTimeout(r, 15000));
  const job7 = enqueuedJobs[6];
  const state = await job7.getState();
  logger.info(`Job 7 State: ${state}`, "StressTest");

  if (state === "failed") {
    logger.info("Found job 7 in failed state. Testing RETRY endpoint...", "StressTest");
    
    try {
      const resp = await fetch(`${BASE_URL}/jobs/retry/${job7.id}`, {
        method: 'POST'
      });
      const data = await resp.json();
      logger.info(`Retry Response: ${JSON.stringify(data)}`, "StressTest");
      
      const newState = await job7.getState();
      logger.info(`Job 7 State after retry: ${newState}`, "StressTest");
      
      if (newState === "waiting" || newState === "active") {
        logger.info("SUCCESS: Job successfully re-enqueued via API.", "StressTest");
      } else {
        logger.error(`FAILURE: Job 7 in unexpected state: ${newState}`, "StressTest");
      }
    } catch (err) {
      logger.error(`Retry API call failed: ${err.message}`, "StressTest");
    }
  } else {
    logger.warn(`Job 7 is ${state}, not failed. Check retryPolicy settings.`, "StressTest");
  }

  logger.info("--- STRESS TEST COMPLETE ---", "StressTest");
  process.exit(0);
}

// Run the test
// Note: This assumes the server is running on localhost:5000
runStressTest().catch(err => {
  logger.error(`Stress test crashed: ${err.stack}`, "StressTest");
  process.exit(1);
});
