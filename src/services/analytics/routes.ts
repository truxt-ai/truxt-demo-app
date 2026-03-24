import { Router } from "express";
import { AnalyticsService } from "./service";

const router = Router();
const analytics = new AnalyticsService();

router.post("/events", async (req, res) => {
  await analytics.trackEvent(req.body);
  res.status(202).json({ status: "accepted" });
});

router.get("/dashboard/:metric", async (req, res) => {
  const { metric } = req.params;
  const { from, to, granularity } = req.query;
  const data = await analytics.getDashboardMetric(metric, {
    from: from as string,
    to: to as string,
    granularity: (granularity as string) || "day",
  });
  res.json({ data });
});

router.get("/reports/summary", async (_req, res) => {
  const summary = await analytics.getWeeklySummary();
  res.json({ data: summary });
});

export { router as analyticsRouter };
