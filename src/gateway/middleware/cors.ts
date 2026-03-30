import { Request, Response, NextFunction } from "express";
import { logger } from "../../shared/logger";

interface CorsOptions {
  origins: string[];
  methods: string[];
  headers: string[];
  credentials: boolean;
  maxAge: number;
}

const DEFAULT_OPTIONS: CorsOptions = {
  origins: ["*"],
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  headers: ["Content-Type", "Authorization", "X-Request-Id"],
  credentials: true,
  maxAge: 86400,
};

export function corsMiddleware(opts: Partial<CorsOptions> = {}) {
  const config = { ...DEFAULT_OPTIONS, ...opts };

  return (req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin;

    if (origin && isAllowedOrigin(origin, config.origins)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Methods", config.methods.join(", "));
      res.setHeader("Access-Control-Allow-Headers", config.headers.join(", "));
      res.setHeader("Access-Control-Max-Age", config.maxAge.toString());

      if (config.credentials) {
        res.setHeader("Access-Control-Allow-Credentials", "true");
      }
    }

    if (req.method === "OPTIONS") {
      return res.status(204).end();
    }

    next();
  };
}

function isAllowedOrigin(origin: string, allowed: string[]): boolean {
  if (allowed.includes("*")) return true;
  return allowed.some((pattern) => {
    if (pattern.startsWith("*.")) {
      return origin.endsWith(pattern.slice(1));
    }
    return origin === pattern;
  });
}
