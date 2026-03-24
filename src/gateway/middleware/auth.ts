import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { UnauthorizedError } from "../../shared/errors";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";
const PUBLIC_PATHS = ["/health", "/api/users/login", "/api/users/register"];

export function authMiddleware(req: Request, _res: Response, next: NextFunction) {
  if (PUBLIC_PATHS.includes(req.path)) return next();

  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) throw new UnauthorizedError("Missing auth token");

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    (req as any).user = decoded;
    next();
  } catch {
    throw new UnauthorizedError("Invalid or expired token");
  }
}
