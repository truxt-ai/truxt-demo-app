import { Request, Response, NextFunction } from "express";
import { AuditService } from "../../services/audit/service";

const auditService = new AuditService();
const AUDIT_METHODS = ["POST", "PUT", "PATCH", "DELETE"];

export function auditMiddleware(req: Request, res: Response, next: NextFunction) {
  if (!AUDIT_METHODS.includes(req.method)) return next();

  const originalSend = res.send;
  res.send = function (body: any) {
    if (res.statusCode < 400) {
      const user = (req as any).user;
      if (user) {
        auditService.log({
          actorId: user.id,
          action: `${req.method} ${req.path}`,
          resourceType: req.path.split("/")[2] || "unknown",
          resourceId: req.params.id || "",
          details: { statusCode: res.statusCode },
          ipAddress: req.ip || "unknown",
        }).catch(() => {}); // Fire-and-forget
      }
    }
    return originalSend.call(this, body);
  };

  next();
}
