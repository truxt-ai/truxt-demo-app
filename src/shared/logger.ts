const LOG_LEVEL = process.env.LOG_LEVEL || "info";

const levels: Record<string, number> = { debug: 0, info: 1, warn: 2, error: 3 };

function log(level: string, message: string, meta?: Record<string, any>) {
  if (levels[level] >= levels[LOG_LEVEL]) {
    const entry = { timestamp: new Date().toISOString(), level, message, ...meta };
    console.log(JSON.stringify(entry));
  }
}

export const logger = {
  debug: (msg: string, meta?: Record<string, any>) => log("debug", msg, meta),
  info: (msg: string, meta?: Record<string, any>) => log("info", msg, meta),
  warn: (msg: string, meta?: Record<string, any>) => log("warn", msg, meta),
  error: (msg: string, meta?: Record<string, any>) => log("error", msg, meta),
};
