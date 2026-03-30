import { Request, Response, NextFunction } from "express";
import { logger } from "./logger";

export class AppError extends Error {
  constructor(
    public message: string,
    public statusCode: number = 500,
    public code?: string
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      error: {
        message: this.message,
        code: this.code || this.name,
        status: this.statusCode,
      },
    };
  }
}

export class NotFoundError extends AppError {
  constructor(message: string) { super(message, 404, "NOT_FOUND"); }
}

export class UnauthorizedError extends AppError {
  constructor(message: string) { super(message, 401, "UNAUTHORIZED"); }
}

export class ForbiddenError extends AppError {
  constructor(message: string) { super(message, 403, "FORBIDDEN"); }
}

export class ValidationError extends AppError {
  constructor(message: string) { super(message, 400, "VALIDATION_ERROR"); }
}

export class ConflictError extends AppError {
  constructor(message: string) { super(message, 409, "CONFLICT"); }
}

export class RateLimitError extends AppError {
  constructor(retryAfter: number) {
    super("Too many requests", 429, "RATE_LIMITED");
    (this as any).retryAfter = retryAfter;
  }
}

export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction) {
  const requestId = req.headers["x-request-id"];

  if (err instanceof AppError) {
    logger.warn(err.message, {
      code: err.code,
      status: err.statusCode,
      path: req.path,
      requestId,
    });
    return res.status(err.statusCode).json(err.toJSON());
  }

  logger.error("Unhandled error", {
    message: err.message,
    stack: err.stack,
    path: req.path,
    requestId,
  });

  res.status(500).json({
    error: {
      message: "Internal server error",
      code: "INTERNAL_ERROR",
      status: 500,
      requestId,
    },
  });
}
