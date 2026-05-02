const rateLimitMap = new Map();

const RATE_LIMIT_WINDOW_MS =
  (Number(process.env.EMBED_RATE_LIMIT_WINDOW_SEC) || 3600) * 1000;
const RATE_LIMIT_MAX = Number(process.env.EMBED_RATE_LIMIT_MAX) || 1000;

setInterval(() => {
  const cutoff = Date.now() - RATE_LIMIT_WINDOW_MS;
  for (const [key, record] of rateLimitMap.entries()) {
    if (record.timestamp < cutoff) {
      rateLimitMap.delete(key);
    }
  }
}, 5 * 60 * 1000).unref();

const embedRateLimiter = (req, res, next) => {
  const key = req.embed?.tokenHash || req.ip || "unknown";
  const now = Date.now();
  const record = rateLimitMap.get(key) || { count: 0, timestamp: now };

  if (now - record.timestamp > RATE_LIMIT_WINDOW_MS) {
    record.count = 1;
    record.timestamp = now;
  } else {
    record.count += 1;
  }

  rateLimitMap.set(key, record);

  const remaining = Math.max(0, RATE_LIMIT_MAX - record.count);
  res.setHeader("X-RateLimit-Limit", RATE_LIMIT_MAX);
  res.setHeader("X-RateLimit-Remaining", remaining);
  res.setHeader(
    "X-RateLimit-Reset",
    Math.ceil((record.timestamp + RATE_LIMIT_WINDOW_MS) / 1000)
  );

  if (record.count > RATE_LIMIT_MAX) {
    res.setHeader("Retry-After", Math.ceil(RATE_LIMIT_WINDOW_MS / 1000));
    return res
      .status(429)
      .json({ error: "Too many embed requests. Try again later." });
  }

  next();
};

module.exports = embedRateLimiter;
