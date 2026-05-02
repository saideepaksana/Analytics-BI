const crypto = require("crypto");
const logger = require("../core/logger");

const DEFAULT_EXPIRATION_HOURS = 24;
const MAX_EXPIRATION_HOURS = 720;

const resolveJwt = () => {
  try {
    return require("jsonwebtoken");
  } catch (error) {
    if (error && error.code === "MODULE_NOT_FOUND") {
      return null;
    }
    throw error;
  }
};

const getJwtOrThrow = () => {
  const jwt = resolveJwt();
  if (!jwt) {
    const error = new Error(
      "Missing dependency: jsonwebtoken (install in apps/server)."
    );
    error.code = "EMBED_JWT_MISSING";
    throw error;
  }
  return jwt;
};

const getEmbedSecret = () => {
  const secret =
    process.env.EMBED_TOKEN_SECRET ||
    process.env.JWT_SECRET ||
    "dev-embed-secret";

  if (!process.env.EMBED_TOKEN_SECRET && process.env.NODE_ENV === "production") {
    logger.warn(
      "EMBED_TOKEN_SECRET is not set; using fallback secret.",
      "EmbedTokenService"
    );
  }

  return secret;
};

const normalizeAllowedOrigins = (value) => {
  if (!value) return [];

  if (Array.isArray(value)) {
    return Array.from(
      new Set(
        value
          .map((origin) => String(origin || "").trim())
          .filter(Boolean)
          .map((origin) => origin.toLowerCase())
      )
    );
  }

  if (typeof value === "string") {
    return Array.from(
      new Set(
        value
          .split(",")
          .map((origin) => origin.trim())
          .filter(Boolean)
          .map((origin) => origin.toLowerCase())
      )
    );
  }

  return [];
};

const resolveExpirationHours = (override) => {
  const envValue = Number(process.env.EMBED_TOKEN_EXPIRATION_HOURS);
  const candidate = Number.isFinite(override) ? override : envValue;

  if (!Number.isFinite(candidate) || candidate <= 0) {
    return DEFAULT_EXPIRATION_HOURS;
  }

  return Math.min(Math.max(candidate, 1), MAX_EXPIRATION_HOURS);
};

const generateToken = ({
  dashboardId,
  userId,
  scope = "view",
  expiresInHours,
  allowedOrigins = [],
}) => {
  const jwt = getJwtOrThrow();
  const expiresHours = resolveExpirationHours(expiresInHours);
  const nowSeconds = Math.floor(Date.now() / 1000);
  const exp = nowSeconds + expiresHours * 60 * 60;

  const payload = {
    dashboardId,
    userId,
    scope,
    sub: "embed",
    allowedOrigins: normalizeAllowedOrigins(allowedOrigins),
    iat: nowSeconds,
    exp,
  };

  const token = jwt.sign(payload, getEmbedSecret(), { algorithm: "HS256" });

  return {
    token,
    expiresAt: new Date(exp * 1000).toISOString(),
    expiresInHours: expiresHours,
  };
};

const validateToken = (token) => {
  try {
    const jwt = resolveJwt();
    if (!jwt) {
      return { valid: false, error: "jsonwebtoken not installed" };
    }
    const payload = jwt.verify(token, getEmbedSecret(), {
      algorithms: ["HS256"],
    });

    if (!payload || payload.sub !== "embed" || !payload.dashboardId) {
      return { valid: false, error: "Invalid embed token" };
    }

    return { valid: true, payload };
  } catch (error) {
    return { valid: false, error: error.message };
  }
};

const hashToken = (token) =>
  crypto.createHash("sha256").update(token).digest("hex");

module.exports = {
  generateToken,
  validateToken,
  normalizeAllowedOrigins,
  hashToken,
};
