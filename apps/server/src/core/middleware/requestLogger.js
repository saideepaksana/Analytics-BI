const { randomUUID } = require("crypto");
const logger = require("../logger");

const DEFAULT_SLOW_REQUEST_MS = Number(process.env.LOG_SLOW_REQUEST_MS || 1500);

const parseIgnorePaths = (ignorePathsOption) => {
  if (Array.isArray(ignorePathsOption)) {
    return new Set(ignorePathsOption.map((path) => String(path).trim()).filter(Boolean));
  }

  if (typeof ignorePathsOption === "string") {
    return new Set(
      ignorePathsOption
        .split(",")
        .map((path) => path.trim())
        .filter(Boolean)
    );
  }

  const fromEnv = String(process.env.LOG_IGNORE_PATHS || "")
    .split(",")
    .map((path) => path.trim())
    .filter(Boolean);

  return new Set(fromEnv);
};

const getRequestId = (req) => {
  const incoming = req.headers["x-request-id"];
  if (typeof incoming === "string" && incoming.trim()) {
    return incoming.trim();
  }

  if (Array.isArray(incoming) && incoming.length > 0 && incoming[0].trim()) {
    return incoming[0].trim();
  }

  return randomUUID();
};

const getClientIp = (req) => {
  const forwarded = req.headers["x-forwarded-for"];

  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0].trim();
  }

  if (Array.isArray(forwarded) && forwarded.length > 0 && forwarded[0].trim()) {
    return forwarded[0].split(",")[0].trim();
  }

  return req.ip || req.socket?.remoteAddress || "unknown";
};

const shouldIgnorePath = (ignorePaths, req) => {
  const requestPath = req.path || req.originalUrl || req.url || "/";
  const normalizedPath = String(requestPath).split("?")[0];
  return ignorePaths.has(normalizedPath);
};

const requestLoggingMiddleware = (options = {}) => {
  const ignorePaths = parseIgnorePaths(options.ignorePaths);
  const slowThresholdMs = Number(options.slowThresholdMs || DEFAULT_SLOW_REQUEST_MS);

  return (req, res, next) => {
    const requestId = getRequestId(req);
    const requestPath = req.originalUrl || req.url || req.path || "/";
    const clientIp = getClientIp(req);
    const startedAt = process.hrtime.bigint();
    const ignored = shouldIgnorePath(ignorePaths, req);

    req.requestId = requestId;
    req.id = req.id || requestId;
    res.setHeader("x-request-id", requestId);

    const requestContext = {
      requestId,
      method: req.method,
      path: requestPath,
    };

    const requestLogger = logger.child(requestContext);

    let finished = false;

    const emitSummary = (aborted = false) => {
      if (finished) {
        return;
      }
      finished = true;

      if (ignored) {
        return;
      }

      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
      const durationRounded = Number(durationMs.toFixed(1));
      const statusCode = aborted ? 499 : res.statusCode;

      let level = "info";
      if (statusCode >= 500 || aborted) {
        level = "error";
      } else if (statusCode >= 400 || durationMs >= slowThresholdMs) {
        level = "warn";
      }

      const contentLengthRaw = res.getHeader("content-length");
      const contentLength =
        contentLengthRaw !== undefined && contentLengthRaw !== null && contentLengthRaw !== ""
          ? Number(contentLengthRaw)
          : undefined;

      requestLogger[level](
        aborted ? "HTTP request aborted" : "HTTP request completed",
        "HTTP",
        {
          method: req.method,
          path: requestPath,
          statusCode,
          durationMs: durationRounded,
          ip: clientIp,
          userAgent: req.headers["user-agent"],
          contentLength: Number.isFinite(contentLength) ? contentLength : undefined,
          query: req.query,
        }
      );
    };

    logger.withContext(requestContext, () => {
      if (!ignored) {
        requestLogger.debug("HTTP request started", "HTTP", {
          method: req.method,
          path: requestPath,
          ip: clientIp,
          userAgent: req.headers["user-agent"],
        });
      }

      res.on("finish", () => emitSummary(false));
      res.on("close", () => {
        if (!res.writableEnded) {
          emitSummary(true);
        }
      });

      next();
    });
  };
};

module.exports = {
  requestLoggingMiddleware,
};
