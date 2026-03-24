import { Request, Response, NextFunction } from "express";
import { logger } from "../../shared/logger";

const DEPRECATION_DATE = "2026-06-01";
const SUNSET_DATE = "2026-09-01";

export function v1DeprecationMiddleware(req: Request, res: Response, next: NextFunction) {
  // Only apply to v1 routes
  if (!req.path.startsWith("/api/") || req.path.startsWith("/api/v2/")) {
    return next();
  }

  res.setHeader("Deprecation", `date="${DEPRECATION_DATE}"`);
  res.setHeader("Sunset", SUNSET_DATE);
  res.setHeader("Link", '</api/v2>; rel="successor-version"');

  logger.warn("v1 API access", {
    path: req.path,
    userId: (req as any).user?.id,
    userAgent: req.headers["user-agent"],
  });

  next();
}
