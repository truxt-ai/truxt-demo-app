import { Router } from "express";
import { MetricsService } from "./service";

const router = Router();
const metricsService = new MetricsService();

// --- Pre-built metrics ---

router.get("/overview", async (_req, res) => {
  const summary = await metricsService.getOverviewSummary();
  res.json({ data: summary });
});

router.get("/users/growth", async (req, res) => {
  const { from, to, granularity } = req.query;
  if (!from || !to) return res.status(400).json({ error: "from and to are required" });
  const data = await metricsService.getUserGrowth(from as string, to as string, granularity as any);
  res.json({ data });
});

router.get("/users/active", async (req, res) => {
  const { from, to, granularity } = req.query;
  if (!from || !to) return res.status(400).json({ error: "from and to are required" });
  const data = await metricsService.getActiveUsers(from as string, to as string, granularity as any);
  res.json({ data });
});

router.get("/users/retention", async (req, res) => {
  const { cohort, days } = req.query;
  if (!cohort) return res.status(400).json({ error: "cohort date is required" });
  const data = await metricsService.getUserRetention(cohort as string, parseInt(days as string) || 30);
  res.json({ data });
});

router.get("/events/volume", async (req, res) => {
  const { from, to, granularity } = req.query;
  if (!from || !to) return res.status(400).json({ error: "from and to are required" });
  const data = await metricsService.getEventVolume(from as string, to as string, granularity as any);
  res.json({ data });
});

router.get("/events/by-type", async (req, res) => {
  const { from, to } = req.query;
  if (!from || !to) return res.status(400).json({ error: "from and to are required" });
  const data = await metricsService.getEventsByType(from as string, to as string);
  res.json({ data });
});

// --- Dashboards ---

router.post("/dashboards", async (req, res) => {
  const dashboard = await metricsService.createDashboard(req.body, (req as any).user.id);
  res.status(201).json({ data: dashboard });
});

router.get("/dashboards", async (req, res) => {
  const teamId = req.query.teamId as string;
  if (!teamId) return res.status(400).json({ error: "teamId is required" });
  const dashboards = await metricsService.listDashboards(teamId);
  res.json({ data: dashboards });
});

router.get("/dashboards/:id", async (req, res) => {
  const dashboard = await metricsService.getDashboard(req.params.id);
  res.json({ data: dashboard });
});

router.put("/dashboards/:id", async (req, res) => {
  const dashboard = await metricsService.updateDashboard(req.params.id, req.body);
  res.json({ data: dashboard });
});

router.delete("/dashboards/:id", async (req, res) => {
  await metricsService.deleteDashboard(req.params.id);
  res.status(204).send();
});

export { router as metricsRouter };
