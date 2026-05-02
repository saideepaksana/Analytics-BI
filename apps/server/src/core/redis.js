const Redis = require("ioredis");
const logger = require("./logger");

const redisConfig = {
  host: process.env.REDIS_HOST || "127.0.0.1",
  port: process.env.REDIS_PORT || 6379,
  lazyConnect: true,
  enableOfflineQueue: false,
  maxRetriesPerRequest: null, // Required by BullMQ
  retryStrategy: (times) => {
    // Exponential backoff with a cap of 3 seconds
    return Math.min(times * 100, 3000);
  },
};

// Create a singleton Redis connection
const redisConnection = new Redis(redisConfig);

redisConnection.on("error", (err) => {
  logger.error(`Redis connection error: ${err.message}`, "Redis");
});

redisConnection.on("connect", () => {
  logger.success(`Redis Connected at ${redisConfig.host}:${redisConfig.port}`, "Redis");
});

module.exports = {
  redisConnection,
  redisConfig,
};
