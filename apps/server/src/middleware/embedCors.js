const buildOrigin = (value) => {
  if (!value) return "";
  return String(value).trim().toLowerCase();
};

const getRefererOrigin = (referer) => {
  if (!referer) return "";
  try {
    return new URL(String(referer)).origin.toLowerCase();
  } catch (error) {
    return "";
  }
};

const embedCors = (req, res, next) => {
  const allowedOrigins = (req.embed?.allowedOrigins || []).map(buildOrigin);
  const origin = buildOrigin(req.headers.origin);
  const refererOrigin = getRefererOrigin(req.headers.referer);

  const wildcardAllowed =
    allowedOrigins.includes("*") || allowedOrigins.length === 0;
  const originAllowed =
    wildcardAllowed ||
    (!!origin && allowedOrigins.includes(origin)) ||
    (!!refererOrigin && allowedOrigins.includes(refererOrigin));

  if (!originAllowed) {
    return res.status(403).json({ error: "Origin not allowed." });
  }

  const responseOrigin = origin || refererOrigin;
  if (responseOrigin) {
    res.setHeader("Access-Control-Allow-Origin", responseOrigin);
    res.setHeader("Vary", "Origin");
  }

  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  res.setHeader("Access-Control-Max-Age", "600");
  res.setHeader("X-Frame-Options", "ALLOWALL");

  const frameAncestors =
    wildcardAllowed || allowedOrigins.length === 0
      ? "*"
      : allowedOrigins.join(" ");
  res.setHeader("Content-Security-Policy", `frame-ancestors ${frameAncestors}`);

  next();
};

module.exports = embedCors;
