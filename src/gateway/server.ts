import express from "express";
import { authMiddleware } from "./middleware/auth";
import { userRouter } from "../services/user/routes";
import { analyticsRouter } from "../services/analytics/routes";
import { teamRouter } from "../services/team/routes";
import { inviteRouter } from "../services/invite/routes";
import { errorHandler } from "../shared/errors";
import { logger } from "../shared/logger";
import { db } from "../shared/database";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "1mb" }));
app.use(authMiddleware);

app.use("/api/users", userRouter);
app.use("/api/analytics", analyticsRouter);
app.use("/api/teams", teamRouter);
app.use("/api/teams", inviteRouter);

app.get("/health", async (_req, res) => {
  const dbHealth = await db.healthCheck();
  res.json({
    status: dbHealth.healthy ? "ok" : "degraded",
    version: "1.3.0",
    database: dbHealth,
  });
});

app.use(errorHandler);

const server = app.listen(PORT, () => {
  logger.info(`Gateway listening on port ${PORT}`);
});

process.on("SIGTERM", async () => {
  logger.info("SIGTERM received, shutting down gracefully");
  server.close();
  await db.shutdown();
  process.exit(0);
});

export { app };
