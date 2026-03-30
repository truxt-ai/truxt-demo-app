import express from "express";
import { authMiddleware } from "./middleware/auth";
import { userRouter } from "../services/user/routes";
import { rateLimiter } from "./middleware/rate-limit";
import { analyticsRouter } from "../services/analytics/routes";
import { errorHandler } from "../shared/errors";
import { logger } from "../shared/logger";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(rateLimiter());
app.use(authMiddleware);

app.use("/api/users", userRouter);
app.use("/api/analytics", analyticsRouter);

app.get("/health", (_req, res) => {
  res.json({ status: "ok", version: "1.2.0" });
});

app.use(errorHandler);

app.listen(PORT, () => {
  logger.info(`Gateway listening on port ${PORT}`);
});

export { app };
