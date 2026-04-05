const { format } = require("date-fns");

/**
 * logger.js
 *
 * Professional logging utility with timestamps, log levels, and ANSI colors.
 */

const COLORS = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  underscore: "\x1b[4m",
  blink: "\x1b[5m",
  reverse: "\x1b[7m",
  hidden: "\x1b[8m",

  fg: {
    black: "\x1b[30m",
    red: "\x1b[31m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    blue: "\x1b[34m",
    magenta: "\x1b[35m",
    cyan: "\x1b[36m",
    white: "\x1b[37m",
    crimson: "\x1b[38m",
    gray: "\x1b[90m",
  },
  bg: {
    black: "\x1b[40m",
    red: "\x1b[41m",
    green: "\x1b[42m",
    yellow: "\x1b[43m",
    blue: "\x1b[44m",
    magenta: "\x1b[45m",
    cyan: "\x1b[46m",
    white: "\x1b[47m",
    crimson: "\x1b[48m",
  },
};

const getTimestamp = () => {
  return format(new Date(), "yyyy-MM-dd HH:mm:ss");
};

const formatMessage = (level, message, prefix = "") => {
  const ts = `${COLORS.fg.gray}[${getTimestamp()}]${COLORS.reset}`;
  const lvl = `${level.color}[${level.name}]${COLORS.reset}`;
  const pre = prefix ? `${COLORS.fg.cyan}[${prefix}]${COLORS.reset} ` : "";
  return `${ts} ${lvl} ${pre}${message}`;
};

const levels = {
  info: { name: "INFO ", color: COLORS.fg.blue },
  success: { name: "SUCCESS", color: COLORS.fg.green },
  warn: { name: "WARN ", color: COLORS.fg.yellow },
  error: { name: "ERROR", color: COLORS.fg.red },
  debug: { name: "DEBUG", color: COLORS.fg.magenta },
};

const logger = {
  info: (message, prefix) => console.log(formatMessage(levels.info, message, prefix)),
  success: (message, prefix) => console.log(formatMessage(levels.success, message, prefix)),
  warn: (message, prefix) => console.warn(formatMessage(levels.warn, message, prefix)),
  error: (message, prefix) => console.error(formatMessage(levels.error, message, prefix)),
  debug: (message, prefix) => {
    if (process.env.NODE_ENV !== "production") {
      console.log(formatMessage(levels.debug, message, prefix));
    }
  },
};

module.exports = logger;
