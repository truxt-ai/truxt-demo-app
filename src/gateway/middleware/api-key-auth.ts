import { Request, Response, NextFunction } from "express";
import { ApiKeyService } from "../../services/apikey/service";
import { UnauthorizedError, ForbiddenError } from "../../shared/errors";

const apiKeyService = new ApiKeyService();

/**
 * Middleware that authenticates requests using API keys.
 * Looks for keys in the Authorization header (Bearer trx_...) or X-API-Key header.
 * Falls through to next middleware if no API key is present (allows JWT auth to handle it).
 */
export function apiKeyAuthMiddleware(req: Request, _res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const apiKeyHeader = req.headers["x-api-key"] as string;

  let rawKey: string | null = null;

  if (apiKeyHeader?.startsWith("trx_")) {
    rawKey = apiKeyHeader;
  } else if (authHeader?.startsWith("Bearer trx_")) {
    rawKey = authHeader.substring(7);
  }

  if (!rawKey) return next(); // No API key, let JWT middleware handle it

  apiKeyService.validate(rawKey).then((result) => {
    if (!result) throw new UnauthorizedError("Invalid or expired API key");

    (req as any).user = {
      id: `apikey:${result.keyId}`,
      role: "service",
      teamId: result.teamId,
      scopes: result.scopes,
    };
    (req as any).authMethod = "api-key";

    next();
  }).catch(next);
}

/**
 * Middleware that checks if the authenticated API key has the required scope.
 */
export function requireScope(scope: string) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const user = (req as any).user;

    // JWT-authenticated users bypass scope checks
    if ((req as any).authMethod !== "api-key") return next();

    const scopes: string[] = user?.scopes || [];
    if (scopes.includes("admin") || scopes.includes(scope)) return next();

    throw new ForbiddenError(`Missing required scope: ${scope}`);
  };
}
