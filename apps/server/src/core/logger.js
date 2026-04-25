const os = require("os");
const util = require("util");
const { AsyncLocalStorage } = require("async_hooks");

const asyncLogContext = new AsyncLocalStorage();

const LEVELS = Object.freeze({
  trace: 10,
  debug: 20,
  info: 30,
  success: 35,
  warn: 40,
  error: 50,
  fatal: 60,
});

const LEVEL_LABELS = Object.freeze({
  trace: "TRACE",
  debug: "DEBUG",
  info: "INFO",
  success: "SUCCESS",
  warn: "WARN",
  error: "ERROR",
  fatal: "FATAL",
});

const LEVEL_COLORS = Object.freeze({
  trace: "\x1b[90m",
  debug: "\x1b[35m",
  info: "\x1b[36m",
  success: "\x1b[32m",
  warn: "\x1b[33m",
  error: "\x1b[31m",
  fatal: "\x1b[41m\x1b[97m",
});

const ANSI = Object.freeze({
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
});

const SENSITIVE_KEY_PATTERN = /(password|passwd|token|secret|api[_-]?key|authorization|cookie|session|credit|card|ssn|pin)/i;
const MAX_LOG_DEPTH = 7;
const MAX_ARRAY_ITEMS = 100;
const MAX_OBJECT_KEYS = 120;
const MAX_STRING_LENGTH = 8000;

const IS_PROD = process.env.NODE_ENV === "production";
const LOG_FORMAT = String(process.env.LOG_FORMAT || (IS_PROD ? "json" : "pretty")).toLowerCase();
const LOG_LEVEL = String(process.env.LOG_LEVEL || (IS_PROD ? "info" : "debug")).toLowerCase();
const LOG_SERVICE = process.env.LOG_SERVICE || "analytics-bi-server";

const useColor = (() => {
  if (process.env.NO_COLOR) return false;
  if (process.env.LOG_COLOR === "true") return true;
  if (process.env.LOG_COLOR === "false") return false;
  return Boolean(process.stdout.isTTY) && !IS_PROD;
})();

const minLevelWeight = LEVELS[LOG_LEVEL] || LEVELS.info;

const toPlainError = (error) => {
  if (!(error instanceof Error)) {
    return error;
  }

  return {
    name: error.name,
    message: error.message,
    code: error.code,
    stack: error.stack,
    cause: error.cause instanceof Error ? toPlainError(error.cause) : error.cause,
  };
};

const sanitizeValue = (value, depth = 0, seen = new WeakSet()) => {
  if (depth > MAX_LOG_DEPTH) {
    return "[Truncated]";
  }

  if (value === null || value === undefined) {
    return value;
  }

  if (value instanceof Error) {
    return sanitizeValue(toPlainError(value), depth + 1, seen);
  }

  const valueType = typeof value;

  if (valueType === "string") {
    if (value.length <= MAX_STRING_LENGTH) {
      return value;
    }
    return `${value.slice(0, MAX_STRING_LENGTH)}...[truncated ${value.length - MAX_STRING_LENGTH} chars]`;
  }

  if (valueType === "number" || valueType === "boolean") {
    return value;
  }

  if (valueType === "bigint") {
    return value.toString();
  }

  if (valueType === "function") {
    return `[Function ${value.name || "anonymous"}]`;
  }

  if (Buffer.isBuffer(value)) {
    return `[Buffer ${value.length} bytes]`;
  }

  if (Array.isArray(value)) {
    const sanitizedArray = value
      .slice(0, MAX_ARRAY_ITEMS)
      .map((item) => sanitizeValue(item, depth + 1, seen));

    if (value.length > MAX_ARRAY_ITEMS) {
      sanitizedArray.push(`[+${value.length - MAX_ARRAY_ITEMS} more items]`);
    }

    return sanitizedArray;
  }

  if (valueType === "object") {
    if (seen.has(value)) {
      return "[Circular]";
    }

    seen.add(value);

    const entries = Object.entries(value);
    const trimmedEntries = entries.slice(0, MAX_OBJECT_KEYS);
    const sanitizedObject = {};

    for (const [key, nestedValue] of trimmedEntries) {
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        sanitizedObject[key] = "[REDACTED]";
        continue;
      }

      sanitizedObject[key] = sanitizeValue(nestedValue, depth + 1, seen);
    }

    if (entries.length > MAX_OBJECT_KEYS) {
      sanitizedObject.__truncated__ = `+${entries.length - MAX_OBJECT_KEYS} more keys`;
    }

    return sanitizedObject;
  }

  return String(value);
};

const buildMessageParts = (messageOrPayload, prefixOrMeta, maybeMeta) => {
  let message = "";
  let component;
  let metadata = {};

  if (typeof prefixOrMeta === "string") {
    component = prefixOrMeta;
  } else if (prefixOrMeta && typeof prefixOrMeta === "object") {
    metadata = { ...metadata, ...prefixOrMeta };
  }

  if (maybeMeta && typeof maybeMeta === "object") {
    metadata = { ...metadata, ...maybeMeta };
  }

  if (messageOrPayload instanceof Error) {
    message = messageOrPayload.message || "Unhandled error";
    metadata.error = toPlainError(messageOrPayload);
  } else if (typeof messageOrPayload === "string") {
    message = messageOrPayload;
  } else if (messageOrPayload && typeof messageOrPayload === "object") {
    const payload = { ...messageOrPayload };

    if (typeof payload.message === "string") {
      message = payload.message;
      delete payload.message;
    } else if (typeof payload.msg === "string") {
      message = payload.msg;
      delete payload.msg;
    } else {
      message = "Log event";
    }

    metadata = { ...payload, ...metadata };
  } else {
    message = String(messageOrPayload);
  }

  return {
    message,
    component,
    metadata,
  };
};

const shouldLog = (level) => {
  const weight = LEVELS[level] || LEVELS.info;
  return weight >= minLevelWeight;
};

const getContext = () => {
  return asyncLogContext.getStore() || {};
};

const withContext = (context, callback) => {
  const currentContext = getContext();
  const nextContext = {
    ...currentContext,
    ...(context && typeof context === "object" ? context : {}),
  };

  return asyncLogContext.run(nextContext, callback);
};

const setContext = (context) => {
  const currentContext = getContext();
  const nextContext = {
    ...currentContext,
    ...(context && typeof context === "object" ? context : {}),
  };

  asyncLogContext.enterWith(nextContext);
};

const clearContext = () => {
  asyncLogContext.enterWith({});
};

const prettyPrintLog = (entry) => {
  const level = entry.level;
  const levelLabel = LEVEL_LABELS[level] || level.toUpperCase();

  const levelColor = useColor ? LEVEL_COLORS[level] || "" : "";
  const reset = useColor ? ANSI.reset : "";
  const gray = useColor ? ANSI.gray : "";
  const cyan = useColor ? ANSI.cyan : "";
  const dim = useColor ? ANSI.dim : "";

  const pieces = [];

  pieces.push(`${gray}[${entry.timestamp}]${reset}`);
  pieces.push(`${levelColor}[${levelLabel}]${reset}`);
  pieces.push(`${gray}[${entry.service}]${reset}`);
  pieces.push(`${gray}[pid:${entry.pid}]${reset}`);

  if (entry.component) {
    pieces.push(`${cyan}[${entry.component}]${reset}`);
  }

  if (entry.context && entry.context.requestId) {
    pieces.push(`${gray}[req:${entry.context.requestId}]${reset}`);
  }

   if (entry.context && entry.context.jobId) {
    pieces.push(`${gray}[job:${entry.context.jobId}]${reset}`);
  }

  if (entry.context && entry.context.queueName) {
    pieces.push(`${gray}[queue:${entry.context.queueName}]${reset}`);
  }

  pieces.push(entry.message);

  if (entry.meta && Object.keys(entry.meta).length > 0) {
    const inspected = util.inspect(entry.meta, {
      depth: 4,
      colors: useColor,
      compact: true,
      breakLength: 120,
    });

    pieces.push(`${dim}${inspected}${reset}`);
  }

  return pieces.join(" ");
};

const emit = (level, messageOrPayload, prefixOrMeta, maybeMeta) => {
  if (!shouldLog(level)) {
    return;
  }

  const { message, component, metadata } = buildMessageParts(
    messageOrPayload,
    prefixOrMeta,
    maybeMeta
  );

  const sanitizedContext = sanitizeValue(getContext());
  const sanitizedMeta = sanitizeValue(metadata);

  const logEntry = {
    timestamp: new Date().toISOString(),
    level,
    service: LOG_SERVICE,
    pid: process.pid,
    hostname: os.hostname(),
    message,
  };

  if (component) {
    logEntry.component = component;
  }

  if (sanitizedContext && Object.keys(sanitizedContext).length > 0) {
    logEntry.context = sanitizedContext;
  }

  if (sanitizedMeta && Object.keys(sanitizedMeta).length > 0) {
    logEntry.meta = sanitizedMeta;
  }

  const writer =
    level === "error" || level === "fatal"
      ? console.error.bind(console)
      : level === "warn"
      ? console.warn.bind(console)
      : console.log.bind(console);

  if (LOG_FORMAT === "json") {
    writer(JSON.stringify(logEntry));
    return;
  }

  writer(prettyPrintLog(logEntry));
};

const child = (boundContext = {}) => {
  const runWithBoundContext = (fn) => {
    return withContext(boundContext, fn);
  };

  return {
    trace: (messageOrPayload, prefixOrMeta, maybeMeta) =>
      runWithBoundContext(() => emit("trace", messageOrPayload, prefixOrMeta, maybeMeta)),
    debug: (messageOrPayload, prefixOrMeta, maybeMeta) =>
      runWithBoundContext(() => emit("debug", messageOrPayload, prefixOrMeta, maybeMeta)),
    info: (messageOrPayload, prefixOrMeta, maybeMeta) =>
      runWithBoundContext(() => emit("info", messageOrPayload, prefixOrMeta, maybeMeta)),
    success: (messageOrPayload, prefixOrMeta, maybeMeta) =>
      runWithBoundContext(() => emit("success", messageOrPayload, prefixOrMeta, maybeMeta)),
    warn: (messageOrPayload, prefixOrMeta, maybeMeta) =>
      runWithBoundContext(() => emit("warn", messageOrPayload, prefixOrMeta, maybeMeta)),
    error: (messageOrPayload, prefixOrMeta, maybeMeta) =>
      runWithBoundContext(() => emit("error", messageOrPayload, prefixOrMeta, maybeMeta)),
    fatal: (messageOrPayload, prefixOrMeta, maybeMeta) =>
      runWithBoundContext(() => emit("fatal", messageOrPayload, prefixOrMeta, maybeMeta)),
    child: (nestedContext = {}) => child({ ...boundContext, ...nestedContext }),
  };
};

const logger = {
  config: {
    format: LOG_FORMAT,
    level: LOG_LEVEL,
    service: LOG_SERVICE,
    color: useColor,
  },
  levels: Object.keys(LEVELS),
  withContext,
  setContext,
  clearContext,
  getContext,
  child,
  log: (level, messageOrPayload, prefixOrMeta, maybeMeta) =>
    emit(String(level || "info").toLowerCase(), messageOrPayload, prefixOrMeta, maybeMeta),
  trace: (messageOrPayload, prefixOrMeta, maybeMeta) =>
    emit("trace", messageOrPayload, prefixOrMeta, maybeMeta),
  debug: (messageOrPayload, prefixOrMeta, maybeMeta) =>
    emit("debug", messageOrPayload, prefixOrMeta, maybeMeta),
  info: (messageOrPayload, prefixOrMeta, maybeMeta) =>
    emit("info", messageOrPayload, prefixOrMeta, maybeMeta),
  success: (messageOrPayload, prefixOrMeta, maybeMeta) =>
    emit("success", messageOrPayload, prefixOrMeta, maybeMeta),
  warn: (messageOrPayload, prefixOrMeta, maybeMeta) =>
    emit("warn", messageOrPayload, prefixOrMeta, maybeMeta),
  error: (messageOrPayload, prefixOrMeta, maybeMeta) =>
    emit("error", messageOrPayload, prefixOrMeta, maybeMeta),
  fatal: (messageOrPayload, prefixOrMeta, maybeMeta) =>
    emit("fatal", messageOrPayload, prefixOrMeta, maybeMeta),
};

module.exports = logger;
