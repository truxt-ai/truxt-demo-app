import { Request, Response, NextFunction } from "express";
import { sanitizeObject } from "../../shared/sanitize";

/**
 * Middleware that sanitizes request body by stripping HTML tags from all string fields.
 * Applied after body parsing but before route handlers.
 * Only processes JSON request bodies (Content-Type: application/json).
 */
export function sanitizeMiddleware(req: Request, _res: Response, next: NextFunction) {
  if (req.body && typeof req.body === "object" && req.is("application/json")) {
    req.body = sanitizeObject(req.body);
  }
  next();
}
