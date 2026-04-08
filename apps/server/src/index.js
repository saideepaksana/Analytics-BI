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
const uploadRoutes = require("./api/upload/upload.routes");
const datasetsRoutes = require("./api/query/datasets.routes");
const exportRoutes = require("./export/exportRoutes");
const chartsRoutes = require("./api/charts/charts.routes");
const dashboardRoutes = require("./api/dashboard/dashboard.routes");
const annotationsRoutes = require("./api/annotations/annotations.routes");
const { setIO } = require("./core/socket");
const logger = require("./core/logger");

const app = express();
const server = http.createServer(app);

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
    const { initWorkers } = require("./jobs/worker");
    initWorkers();
  } catch (error) {
    logger.warn(
      `Redis unavailable at startup (${error.message}). Background workers are disabled until Redis is reachable.`,
      "Server"
    );
  } finally {
    try {
      await probe.quit();
    } catch {
      probe.disconnect();
    }
  }
};

startWorkersIfAvailable();

//start GridFS AFTER DB connects
mongoose.connection.once("open", () => {
  initStorage();
});

//middleware
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "*",
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  })
);
app.use(express.json());

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
app.use("/api/upload", uploadRoutes);
app.use("/api/datasets", datasetsRoutes);
app.use("/api/charts", chartsRoutes);
app.use("/api/dashboard", dashboardRoutes);
// Alias for consistency with newer clients/specs
app.use("/api/dashboards", dashboardRoutes);
app.use("/api/annotations", annotationsRoutes);
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
// ─────────────────────────────────────────────────────────────────────────────

//check server status
app.get("/", (req, res) => {
  res.send("Analytics BI Server is Running!!");
});

//Start the server
const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`, "Server");
});

// Graceful shutdown handling
const shutdown = async () => {
  logger.warn("Graceful shutdown initiated...", "Server");
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
      logger.info("Server closed.", "Server");
      process.exit(0);
    });
  }
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
