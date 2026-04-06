const { redisConnection } = require("../core/redis");
const Idempotency = require("../models/Idempotency");
const logger = require("../core/logger");

const IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60; // 24 hours

const idempotency = async (req, res, next) => {
  const key = req.headers["idempotency-key"];
  
  if (!key) {
    return next();
  }

  const cacheKey = `idempotency:${key}`;

  try {
    // 1. Check Redis first
    const cachedStr = await redisConnection.get(cacheKey);
    if (cachedStr) {
      if (cachedStr === "IN_PROGRESS") {
        return res.status(409).json({ message: "Duplicate request in progress" });
      }
      
      const cachedResponse = JSON.parse(cachedStr);
      logger.info(`Idempotent hit from Redis for key: ${key}`, "Idempotency");
      return res.status(cachedResponse.status).json(cachedResponse.body);
    }
    
    // 2. Lock it in Redis
    const lockSet = await redisConnection.setnx(cacheKey, "IN_PROGRESS");
    if (!lockSet) {
       return res.status(409).json({ message: "Duplicate request in progress" });
    }
    
    // 3. Set Redis TTL for safety in case of crash
    await redisConnection.expire(cacheKey, 60 * 5); // 5 minutes max for processing

    // Intercept response
    const originalJson = res.json;
    res.json = function (body) {
      // Async save
      const resPayload = { status: res.statusCode, body };
      redisConnection.setex(cacheKey, IDEMPOTENCY_TTL_SECONDS, JSON.stringify(resPayload)).catch(err => logger.error(`Redis set error: ${err.message}`, "Idempotency"));
      
      // Save to MongoDB as persistent track
      const expiresAt = new Date();
      expiresAt.setSeconds(expiresAt.getSeconds() + IDEMPOTENCY_TTL_SECONDS);
      
      Idempotency.create({
        key,
        requestPath: req.originalUrl,
        requestMethod: req.method,
        responseStatus: res.statusCode,
        responseBody: body,
        expiresAt
      }).catch(err => {
         if (err.code !== 11000) logger.error(`Idempotency MongoDB save error: ${err.message}`, "Idempotency");
      });
      
      originalJson.call(this, body);
    };

    next();
  } catch (error) {
    logger.error(`Idempotency middleware error: ${error.message}`, "Idempotency");
    next(); // fail open
  }
};

module.exports = idempotency;
