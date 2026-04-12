const { redisConnection } = require('../redis');
const Idempotency = require('../../models/Idempotency');
const logger = require('../logger');

const idempotencyMiddleware = async (req, res, next) => {
  const idempotencyKey = req.headers['idempotency-key'];

  if (!idempotencyKey) {
    return next();
  }

  try {
    // Check Redis cache first for speed
    const cachedResponse = await redisConnection.get(`idempotency:${idempotencyKey}`);
    if (cachedResponse) {
      const parsed = JSON.parse(cachedResponse);
      return res.status(parsed.status).json(parsed.body);
    }

    // Check MongoDB as fallback
    const existingRecord = await Idempotency.findOne({ key: idempotencyKey });
    if (existingRecord && existingRecord.expiresAt > new Date()) {
      return res.status(existingRecord.responseStatus).json(existingRecord.responseBody);
    }

    // Store the key for later response caching
    req.idempotencyKey = idempotencyKey;
    next();
  } catch (error) {
    logger.error(`Idempotency check failed: ${error.message}`, 'IdempotencyMiddleware');
    next();
  }
};

const cacheIdempotentResponse = async (idempotencyKey, status, body, req, ttl = 3600) => {
  if (!idempotencyKey) return;

  try {
    const cacheData = JSON.stringify({ status, body });
    await redisConnection.setex(`idempotency:${idempotencyKey}`, ttl, cacheData);

    // Also store in MongoDB for persistence
    await Idempotency.findOneAndUpdate(
      { key: idempotencyKey },
      {
        key: idempotencyKey,
        requestPath: req.path,
        requestMethod: req.method,
        responseStatus: status,
        responseBody: body,
        expiresAt: new Date(Date.now() + ttl * 1000),
      },
      { upsert: true, new: true }
    );
  } catch (error) {
    logger.error(`Failed to cache idempotent response: ${error.message}`, 'IdempotencyMiddleware');
  }
};

module.exports = {
  idempotencyMiddleware,
  cacheIdempotentResponse,
};