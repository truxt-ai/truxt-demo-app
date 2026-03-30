import { Router } from "express";
import { db } from "../shared/database";
import { redis } from "../shared/cache";
import { logger } from "../shared/logger";

const router = Router();

interface HealthStatus {
  status: "healthy" | "degraded" | "unhealthy";
  version: string;
  uptime: number;
  checks: Record<string, { status: string; latency?: number; details?: string }>;
}

const startTime = Date.now();

router.get("/health", async (_req, res) => {
  const checks: HealthStatus["checks"] = {};

  // Database check
  try {
    const start = Date.now();
    await db.query("SELECT 1");
    checks.database = { status: "ok", latency: Date.now() - start };
  } catch (err: any) {
    checks.database = { status: "error", details: err.message };
  }

  // Redis check
  try {
    const start = Date.now();
    await redis.ping();
    checks.redis = { status: "ok", latency: Date.now() - start };
  } catch (err: any) {
    checks.redis = { status: "error", details: err.message };
  }

  // Disk space (basic check)
  checks.memory = {
    status: "ok",
    details: `RSS: ${Math.round(process.memoryUsage().rss / 1024 / 1024)}MB, Heap: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`,
  };

  const hasErrors = Object.values(checks).some((c) => c.status === "error");
  const status: HealthStatus = {
    status: hasErrors ? "degraded" : "healthy",
    version: process.env.APP_VERSION || "1.2.0",
    uptime: Math.round((Date.now() - startTime) / 1000),
    checks,
  };

  res.status(hasErrors ? 503 : 200).json(status);
});

router.get("/ready", async (_req, res) => {
  try {
    await Promise.all([db.query("SELECT 1"), redis.ping()]);
    res.json({ ready: true });
  } catch {
    res.status(503).json({ ready: false });
  }
});

router.get("/live", (_req, res) => {
  res.json({ alive: true });
});

export { router as healthRouter };
