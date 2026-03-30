import { Router } from "express";
import { userRouter } from "../../services/user/routes";
import { analyticsRouter } from "../../services/analytics/routes";
import { notificationRouter } from "../../services/notification/routes";
import { auditRouter } from "../../services/audit/routes";

const v2Router = Router();

// v2 wraps all responses in a standard envelope
v2Router.use((req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = (body: any) => {
    return originalJson({
      apiVersion: "2.0",
      data: body?.data ?? body,
      meta: {
        requestId: req.headers["x-request-id"] || crypto.randomUUID(),
        timestamp: new Date().toISOString(),
      },
    });
  };
  next();
});

v2Router.use("/users", userRouter);
v2Router.use("/analytics", analyticsRouter);
v2Router.use("/notifications", notificationRouter);
v2Router.use("/audit", auditRouter);

export { v2Router };
