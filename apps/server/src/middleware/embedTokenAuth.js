const Dashboard = require("../models/Dashboard");
const embedTokenService = require("../services/embedTokenService");
const logger = require("../core/logger");

const extractToken = (req) => {
  const authHeader = String(req.headers.authorization || "");
  if (authHeader.toLowerCase().startsWith("bearer ")) {
    return authHeader.slice(7).trim();
  }

  if (req.query && req.query.token) {
    return String(req.query.token).trim();
  }

  const headerToken = req.headers["x-embed-token"];
  if (headerToken) {
    return String(headerToken).trim();
  }

  return "";
};

const embedTokenAuth = async (req, res, next) => {
  try {
    const token = extractToken(req);

    if (!token) {
      return res.status(401).json({ error: "Access token required." });
    }

    const validation = embedTokenService.validateToken(token);
    if (!validation.valid) {
      return res.status(403).json({ error: "Invalid or expired token." });
    }

    const payload = validation.payload || {};

    if (payload.sub !== "embed" || (payload.scope && payload.scope !== "view")) {
      return res.status(403).json({ error: "Unauthorized token scope." });
    }

    const dashboardId = String(payload.dashboardId || "");
    if (!dashboardId) {
      return res.status(403).json({ error: "Invalid embed token." });
    }

    if (req.params?.dashboardId && String(req.params.dashboardId) !== dashboardId) {
      return res.status(403).json({ error: "Token does not match dashboard." });
    }

    const dashboard = await Dashboard.findById(dashboardId)
      .select("status")
      .lean();

    if (!dashboard) {
      return res.status(404).json({ error: "Dashboard not found." });
    }

    if (dashboard.status !== "published") {
      return res.status(403).json({ error: "Dashboard is not published." });
    }

    req.embed = {
      token,
      tokenHash: embedTokenService.hashToken(token),
      dashboardId,
      allowedOrigins: embedTokenService.normalizeAllowedOrigins(
        payload.allowedOrigins || process.env.EMBED_ALLOWED_ORIGINS
      ),
      payload,
    };

    next();
  } catch (error) {
    logger.error(`Embed token auth failed: ${error.message}`, "EmbedTokenAuth");
    res.status(500).json({ error: "Embed token validation failed." });
  }
};

module.exports = embedTokenAuth;
