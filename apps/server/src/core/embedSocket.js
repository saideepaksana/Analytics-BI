const Dashboard = require("../models/Dashboard");
const embedTokenService = require("../services/embedTokenService");
const logger = require("./logger");

let embedNamespace = null;

const configureEmbedSocket = (io) => {
  embedNamespace = io.of("/embed");

  embedNamespace.use(async (socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.query?.token ||
        "";

      if (!token) {
        return next(new Error("Missing embed token"));
      }

      const validation = embedTokenService.validateToken(token);
      if (!validation.valid) {
        return next(new Error("Invalid embed token"));
      }

      const payload = validation.payload || {};
      if (payload.sub !== "embed" || (payload.scope && payload.scope !== "view")) {
        return next(new Error("Unauthorized embed token"));
      }

      const dashboardId = String(payload.dashboardId || "");
      if (!dashboardId) {
        return next(new Error("Invalid dashboard"));
      }

      const dashboard = await Dashboard.findById(dashboardId)
        .select("status")
        .lean();

      if (!dashboard || dashboard.status !== "published") {
        return next(new Error("Dashboard not available"));
      }

      socket.data.embed = {
        token,
        dashboardId,
        payload,
      };

      return next();
    } catch (error) {
      logger.error(`Embed socket auth failed: ${error.message}`, "EmbedSocket");
      return next(new Error("Embed socket auth failed"));
    }
  });

  embedNamespace.on("connection", (socket) => {
    const dashboardId = socket.data.embed?.dashboardId;
    if (dashboardId) {
      socket.join(`embed:${dashboardId}`);
    }

    socket.on("embed:subscribe", ({ dashboardId: requested } = {}) => {
      if (!dashboardId) return;
      if (requested && requested !== dashboardId) return;
      socket.join(`embed:${dashboardId}`);
    });

    socket.on("embed:unsubscribe", ({ dashboardId: requested } = {}) => {
      if (!dashboardId) return;
      if (requested && requested !== dashboardId) return;
      socket.leave(`embed:${dashboardId}`);
    });
  });

  logger.info("Embed socket namespace initialized", "EmbedSocket");
};

const emitEmbedEvent = (dashboardId, event, payload = {}) => {
  if (!embedNamespace || !dashboardId) {
    return;
  }

  embedNamespace.to(`embed:${dashboardId}`).emit(event, payload);
};

module.exports = {
  configureEmbedSocket,
  emitEmbedEvent,
};
