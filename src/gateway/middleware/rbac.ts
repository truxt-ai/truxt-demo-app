import { Request, Response, NextFunction } from "express";
import { ForbiddenError } from "../../shared/errors";

type Role = "admin" | "member" | "viewer";

const ROLE_HIERARCHY: Record<Role, number> = {
  admin: 3,
  member: 2,
  viewer: 1,
};

export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const user = (req as any).user;
    if (!user?.role) throw new ForbiddenError("No role assigned");
    if (!roles.includes(user.role)) {
      throw new ForbiddenError(`Requires one of: ${roles.join(", ")}`);
    }
    next();
  };
}

export function requireMinRole(minRole: Role) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const user = (req as any).user;
    if (!user?.role) throw new ForbiddenError("No role assigned");
    if (ROLE_HIERARCHY[user.role as Role] < ROLE_HIERARCHY[minRole]) {
      throw new ForbiddenError(`Requires at least ${minRole} role`);
    }
    next();
  };
}

export function requireSelfOrAdmin(paramKey: string = "id") {
  return (req: Request, _res: Response, next: NextFunction) => {
    const user = (req as any).user;
    const targetId = req.params[paramKey];
    if (user.role !== "admin" && user.id !== targetId) {
      throw new ForbiddenError("Can only access your own resources");
    }
    next();
  };
}
