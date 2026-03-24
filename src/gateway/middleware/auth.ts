import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { UnauthorizedError } from "../../shared/errors";
import { logger } from "../../shared/logger";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";
const PUBLIC_PATHS = ["/health", "/api/users/login", "/api/users/register"];

// Token revocation list (in production, use Redis)
const revokedTokens = new Set<string>();

export function authMiddleware(req: Request, _res: Response, next: NextFunction) {
  if (PUBLIC_PATHS.includes(req.path)) return next();

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    throw new UnauthorizedError("Missing or malformed authorization header");
  }

  const token = authHeader.substring(7);
  
  // Check token revocation
  const tokenHash = hashToken(token);
  if (revokedTokens.has(tokenHash)) {
    logger.warn("Revoked token used", { ip: req.ip, path: req.path });
    throw new UnauthorizedError("Token has been revoked");
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET, {
      algorithms: ["HS256"],
      maxAge: "24h",
      issuer: "truxt-demo-app",
    }) as jwt.JwtPayload;

    // Validate required claims
    if (!decoded.id || !decoded.email || !decoded.role) {
      logger.warn("Token missing required claims", { claims: Object.keys(decoded) });
      throw new UnauthorizedError("Invalid token claims");
    }

    (req as any).user = {
      id: decoded.id,
      email: decoded.email,
      role: decoded.role,
    };

    next();
  } catch (err: any) {
    if (err instanceof UnauthorizedError) throw err;
    
    if (err.name === "TokenExpiredError") {
      throw new UnauthorizedError("Token expired");
    }
    if (err.name === "JsonWebTokenError") {
      logger.warn("Invalid JWT presented", { error: err.message, ip: req.ip });
      throw new UnauthorizedError("Invalid token");
    }
    throw new UnauthorizedError("Authentication failed");
  }
}

export function revokeToken(token: string): void {
  revokedTokens.add(hashToken(token));
}

function hashToken(token: string): string {
  const crypto = require("crypto");
  return crypto.createHash("sha256").update(token).digest("hex");
}
