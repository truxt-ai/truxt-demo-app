import express from "express";
import { authMiddleware } from "./middleware/auth";
import { userRouter } from "../services/user/routes";
import { rateLimiter } from "./middleware/rate-limit";
import { analyticsRouter } from "../services/analytics/routes";
import { errorHandler } from "../shared/errors";
import { logger } from "../shared/logger";
import { db } from "../shared/database";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(rateLimiter());
app.use(authMiddleware);

app.use("/api/users", userRouter);
app.use("/api/analytics", analyticsRouter);

app.get("/health", async (_req, res) => {
  const dbHealth = await db.healthCheck();
  res.json({
    status: dbHealth.healthy ? "ok" : "degraded",
    version: "1.2.0",
    database: dbHealth,
  });
});

app.use(errorHandler);

const server = app.listen(PORT, () => {
  logger.info(`Gateway listening on port ${PORT}`);
});

// Graceful shutdown
process.on("SIGTERM", async () => {
  logger.info("SIGTERM received, shutting down gracefully");
  server.close();
  await db.shutdown();
  process.exit(0);
});

export { app };
