import { Request, Response, NextFunction } from "express";
import { logger } from "../../shared/logger";

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();

  res.on("finish", () => {
    const duration = Date.now() - start;
    logger.info("HTTP request", {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration,
      userAgent: req.headers["user-agent"],
      userId: (req as any).user?.id,
    });
  });

  next();
}
