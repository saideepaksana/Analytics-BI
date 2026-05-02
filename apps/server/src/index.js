require("dotenv").config({ quiet: true });
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const http = require("http");
const { Server } = require("socket.io");
const Redis = require("ioredis");
const connectDB = require("./core/db");
const { redisConfig } = require("./core/redis");
const { initStorage } = require("./core/storage");
const { initIndexes } = require("./core/dbIndexes");
const uploadRoutes = require("./api/upload/upload.routes");
const datasetsRoutes = require("./api/query/datasets.routes");
const exportRoutes = require("./export/exportRoutes");
const chartsRoutes = require("./api/charts/charts.routes");
const dashboardRoutes = require("./api/dashboard/dashboard.routes");
const annotationsRoutes = require("./api/annotations/annotations.routes");
const aiRoutes = require("./api/ai/ai.routes");
const { setIO } = require("./core/socket");
const logger = require("./core/logger");
const { idempotencyMiddleware } = require("./core/middleware/idempotencyMiddleware");
const authMiddleware = require("./middleware/auth");
const { requestLoggingMiddleware } = require("./core/middleware/requestLogger");
const { securityHeaders, permissionsPolicy, sanitizeInput, rateLimitMiddleware, sqlInjectionProtection, generateCsrfToken, validateCsrfToken } = require("./middleware/security");

const app = express();
const server = http.createServer(app);

logger.info("Logger initialized", "Logger", logger.config);

connectDB();

const startWorkersIfAvailable = async () => {
  const probe = new Redis({
    ...redisConfig,
    lazyConnect: true,
    enableOfflineQueue: false,
  });

  probe.on("error", () => {});

  try {
    await probe.connect();
    await probe.ping();
  } catch (error) {
    logger.warn(
      `Redis unavailable at startup (${error.message}). Background workers are disabled until Redis is reachable.`,
      "Server"
    );
    return;
  } finally {
    try {
      await probe.quit();
    } catch {
      probe.disconnect();
    }
  }

  try {
    const { initWorkers } = require("./jobs/worker");
    initWorkers();
  } catch (error) {
    logger.error(
      `Background worker initialization failed: ${error.message}`,
      "Server"
    );
  }
};

startWorkersIfAvailable();

//start GridFS AFTER DB connects
mongoose.connection.once("open", async () => {
  await initStorage();
  await initIndexes();
});

//middleware
app.use(securityHeaders);
app.use(permissionsPolicy);
const CORS_WHITELIST = (process.env.CORS_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (curl, Postman, same-origin)
      if (!origin || CORS_WHITELIST.includes(origin) || CORS_WHITELIST.includes('*')) {
        callback(null, true);
      } else {
        callback(new Error(`CORS policy: origin ${origin} is not allowed`));
      }
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-User-ID", "X-User-Role", "X-Idempotency-Key", "X-CSRF-Token"],
    credentials: true,
  })
);
app.use(express.json({ limit: '10mb' }));
app.use(sanitizeInput);
app.use(rateLimitMiddleware);
app.use(sqlInjectionProtection);
app.use(authMiddleware);
app.use(requestLoggingMiddleware());
app.use(idempotencyMiddleware);

const io = new Server(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || "*",
    methods: ["GET", "POST"],
  },
});

setIO(io);

io.on("connection", (socket) => {
  socket.on("upload:subscribe", ({ uploadId } = {}) => {
    if (!uploadId || typeof uploadId !== "string") {
      return;
    }
    socket.join(`upload:${uploadId}`);
  });

  socket.on("upload:unsubscribe", ({ uploadId } = {}) => {
    if (!uploadId || typeof uploadId !== "string") {
      return;
    }
    socket.leave(`upload:${uploadId}`);
  });
});

//Routes
// ── CSRF Token endpoint (must be before mutating route middleware) ──────────
app.get('/api/csrf-token', authMiddleware, (req, res) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Authentication required to obtain a CSRF token' });
  }
  const token = generateCsrfToken(req.user.id);
  return res.json({ csrfToken: token });
});

// ── CSRF validation middleware for mutating methods ─────────────────────
// Only enforced in production so dev workflow (curl / Postman) remains smooth.
const csrfProtect = (req, res, next) => {
  if (process.env.NODE_ENV !== 'production') return next();
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
  const token = req.headers['x-csrf-token'];
  if (!req.user) return next(); // auth middleware will handle unauthenticated
  if (!validateCsrfToken(req.user.id, token)) {
    return res.status(403).json({ message: 'Invalid or missing CSRF token' });
  }
  return next();
};

app.use('/api', csrfProtect);

app.use("/api/upload", uploadRoutes);
app.use("/api/datasets", datasetsRoutes);
app.use("/api/charts", chartsRoutes);
app.use("/api/dashboard", dashboardRoutes);
// Alias for consistency with newer clients/specs
app.use("/api/dashboards", dashboardRoutes);
app.use("/api/annotations", annotationsRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/export", exportRoutes);

// ── Job testing routes (remove these in production) ──────────────────────────

// POST /api/jobs/test-job
// Enqueues a test-job with a custom message. Worker will process it.
// Body: { "message": "hello" }
app.post("/api/jobs/test-job", async (req, res) => {
  try {
    const { addBackgroundTask } = require("./jobs/queue");
    const { message = "default test message" } = req.body;
    const job = await addBackgroundTask("test-job", { message });
    res.json({ queued: true, jobId: job.id, message });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/jobs/test-permanent-fail
// Enqueues a job with an unknown name — triggers PermanentError → DLQ.
app.post("/api/jobs/test-permanent-fail", async (req, res) => {
  try {
    const { addBackgroundTask } = require("./jobs/queue");
    const job = await addBackgroundTask("nonexistent-job-type", { test: true });
    res.json({ queued: true, jobId: job.id, note: "This job will be routed to DLQ immediately" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/jobs/stats
// Returns live queue stats: active, waiting, failed, completed counts.
app.get("/api/jobs/stats", async (req, res) => {
  try {
    const { getQueueStats } = require("./jobs/orchestrator");
    const { backgroundTasksQueue } = require("./jobs/queue");
    const stats = await getQueueStats(backgroundTasksQueue);
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/jobs/retry/:jobId
// Retries a failed job by ID (moved from failed -> wait).
app.post("/api/jobs/retry/:jobId", async (req, res) => {
  try {
    const { retryJob, backgroundTasksQueue } = require("./jobs/orchestrator");
    const { jobId } = req.params;
    const success = await retryJob(backgroundTasksQueue, jobId);
    
    if (success) {
      res.json({ message: `Job ${jobId} re-enqueued for retry` });
    } else {
      res.status(400).json({ error: "Job could not be retried. Ensure it exists and is in 'failed' state." });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
// ─────────────────────────────────────────────────────────────────────────────

//check server status
app.get("/", (req, res) => {
  res.send("Analytics BI Server is Running!!");
});

app.use((error, req, res, next) => {
  logger.error("Unhandled HTTP route error", "HTTP", {
    requestId: req.requestId,
    method: req.method,
    path: req.originalUrl || req.url,
    statusCode: error?.status || error?.statusCode || 500,
    error,
  });

  if (res.headersSent) {
    next(error);
    return;
  }

  const statusCode = Number(error?.status || error?.statusCode) || 500;
  res.status(statusCode).json({
    error: statusCode >= 500 ? "Internal Server Error" : error.message,
  });
});

// Start the server with auto-port fallback when default is busy.
const START_PORT = Number(process.env.PORT) || 5000;
const PORT_SEARCH_LIMIT = Number(process.env.PORT_SEARCH_LIMIT) || 20;
let activePort = START_PORT;

const startServer = (port, attempt = 0) => {
  const onListening = () => {
    server.off("error", onError);
    activePort = port;
    logger.info("Server running", "Server", {
      port: activePort,
      nodeEnv: process.env.NODE_ENV || "development",
      logLevel: logger.config.level,
      logFormat: logger.config.format,
    });
  };

  const onError = (err) => {
    server.off("listening", onListening);
    server.off("error", onError);

    if (err?.code === "EADDRINUSE" && attempt < PORT_SEARCH_LIMIT) {
      const nextPort = port + 1;
      logger.warn(`Port ${port} in use. Retrying on ${nextPort}...`, "Server");
      startServer(nextPort, attempt + 1);
      return;
    }

    logger.error(`Failed to start server: ${err.message}`, "Server");
    process.exit(1);
  };

  server.once("listening", onListening);
  server.once("error", onError);
  server.listen(port);
};

startServer(START_PORT);

// Graceful shutdown handling
let shuttingDown = false;
const shutdown = async (signal = "SIGTERM") => {
  if (shuttingDown) return;
  shuttingDown = true;

  logger.warn(`Graceful shutdown initiated (${signal})...`, "Server");

  const isRestartSignal = signal === "SIGUSR2";

  try {
    try {
      const { shutdownWorkers } = require("./jobs/worker");
      await shutdownWorkers();
    } catch {
      // Workers may never have started if Redis was unavailable.
    }
    // if mongoose is connected, we might want to close that too
    await mongoose.connection.close();
  } catch (err) {
    logger.error(`Error during shutdown: ${err.message}`, "Server");
  } finally {
    server.close(() => {
      if (isRestartSignal) {
        logger.info("Server closed for nodemon restart.", "Server");
        process.kill(process.pid, "SIGUSR2");
        return;
      }

      logger.info("Server closed.", "Server");
      process.exit(0);
    });

    // Safety timeout in case server.close never resolves.
    setTimeout(() => {
      if (isRestartSignal) {
        process.kill(process.pid, "SIGUSR2");
        return;
      }
      process.exit(1);
    }, 5000).unref();
  }
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGUSR2", () => shutdown("SIGUSR2"));

process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled promise rejection", "Process", {
    reason,
  });
});

process.on("uncaughtException", (error) => {
  logger.fatal("Uncaught exception", "Process", {
    error,
  });
});

process.on("warning", (warning) => {
  logger.warn("Node.js process warning", "Process", {
    warning,
  });
});
