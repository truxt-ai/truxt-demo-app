import { z } from "zod";
import { logger } from "./logger";

const configSchema = z.object({
  NODE_ENV: z.enum(["development", "staging", "production"]).default("development"),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url().default("redis://localhost:6379"),
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRY: z.string().default("24h"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  CORS_ORIGINS: z.string().transform((s) => s.split(",")).default("*"),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60000),
  RATE_LIMIT_MAX: z.coerce.number().default(100),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SLACK_WEBHOOK_URL: z.string().url().optional(),
  SENTRY_DSN: z.string().url().optional(),
  OTEL_ENDPOINT: z.string().url().optional(),
});

export type AppConfig = z.infer<typeof configSchema>;

let _config: AppConfig | null = null;

export function loadConfig(): AppConfig {
  if (_config) return _config;

  const result = configSchema.safeParse(process.env);
  if (!result.success) {
    const missing = result.error.errors.map((e) => `  ${e.path.join(".")}: ${e.message}`).join("\n");
    logger.error(`Configuration validation failed:\n${missing}`);
    throw new Error(`Invalid configuration:\n${missing}`);
  }

  _config = result.data;
  logger.info("Configuration loaded", {
    env: _config.NODE_ENV,
    port: _config.PORT,
    logLevel: _config.LOG_LEVEL,
  });

  return _config;
}

export function getConfig(): AppConfig {
  if (!_config) return loadConfig();
  return _config;
}
