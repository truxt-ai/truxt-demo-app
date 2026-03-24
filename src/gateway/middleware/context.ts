import { Request, Response, NextFunction } from "express";
import { createContext, runWithContext } from "../../shared/context";

/**
 * Middleware that creates a request-scoped context using AsyncLocalStorage.
 * Downstream code can call getContext() or getRequestId() without
 * passing the request object through every function.
 */
export function contextMiddleware(req: Request, res: Response, next: NextFunction) {
  const ctx = createContext({
    headers: req.headers as Record<string, string>,
    ip: req.ip,
    method: req.method,
    path: req.path,
    user: (req as any).user,
  });

  // Attach request ID to response headers
  res.setHeader("X-Request-Id", ctx.requestId);

  runWithContext(ctx, () => next());
}
