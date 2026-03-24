import { getContext } from "./context";

const LOG_LEVEL = process.env.LOG_LEVEL || "info";
const levels: Record<string, number> = { debug: 0, info: 1, warn: 2, error: 3 };

function log(level: string, message: string, meta?: Record<string, any>) {
  if (levels[level] < levels[LOG_LEVEL]) return;

  const ctx = getContext();
  const entry: Record<string, any> = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...meta,
  };

  // Enrich with request context when available
  if (ctx) {
    entry.requestId = ctx.requestId;
    if (ctx.userId) entry.userId = ctx.userId;
  }

  console.log(JSON.stringify(entry));
}

export const logger = {
  debug: (msg: string, meta?: Record<string, any>) => log("debug", msg, meta),
  info: (msg: string, meta?: Record<string, any>) => log("info", msg, meta),
  warn: (msg: string, meta?: Record<string, any>) => log("warn", msg, meta),
  error: (msg: string, meta?: Record<string, any>) => log("error", msg, meta),
};
