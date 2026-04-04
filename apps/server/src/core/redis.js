const Redis = require("ioredis");

const redisConfig = {
  host: process.env.REDIS_HOST || "127.0.0.1",
  port: process.env.REDIS_PORT || 6379,
  maxRetriesPerRequest: null, // Required by BullMQ
};

// Create a singleton Redis connection
const redisConnection = new Redis(redisConfig);

redisConnection.on("error", (err) => {
  console.error("Redis connection error:", err.message);
  console.error("Background jobs and queuing might fail due to Redis unavailability.");
});

redisConnection.on("connect", () => {
  console.log(`Redis Connected at ${redisConfig.host}:${redisConfig.port}`);
});

module.exports = {
  redisConnection,
  redisConfig,
};
