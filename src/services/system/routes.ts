import { Router } from "express";
import { SystemStatsService } from "./stats";

const router = Router();
const statsService = new SystemStatsService();

router.get("/stats", async (req, res) => {
  const user = (req as any).user;
  if (user.role !== "admin" && (req as any).authMethod !== "api-key") {
    return res.status(403).json({ error: "Admin access required" });
  }

  const stats = await statsService.getStats();
  res.json({ data: stats });
});

router.get("/stats/database", async (req, res) => {
  const user = (req as any).user;
  if (user.role !== "admin") return res.status(403).json({ error: "Admin access required" });

  const stats = await statsService.getStats();
  res.json({ data: stats.database });
});

router.get("/stats/application", async (_req, res) => {
  const stats = await statsService.getStats();
  res.json({
    data: {
      uptime_seconds: stats.application.uptime_seconds,
      node_version: stats.application.node_version,
    },
  });
});

export { router as systemRouter };
