import { db } from "./database";
import { logger } from "./logger";

/**
 * Startup checks run once when the application boots.
 * Validates database state before accepting traffic.
 */
export async function runStartupChecks(): Promise<void> {
  await checkCriticalIndexes();
}

async function checkCriticalIndexes(): Promise<void> {
  const criticalIndexes = [
    { table: "users", index: "idx_users_email" },
    { table: "analytics_events", index: "idx_events_timestamp" },
  ];

  const result = await db.query(
    "SELECT tablename, indexname FROM pg_indexes WHERE indexname = ANY($1)",
    [criticalIndexes.map((i) => i.index)]
  );

  const found = new Set(result.rows.map((r: any) => r.indexname));
  const missing = criticalIndexes.filter((i) => !found.has(i.index));

  if (missing.length > 0) {
    const names = missing.map((i) => i.index).join(", ");
    logger.error("Critical database indexes missing — performance will be degraded", { missing: names });
    // Don't crash, but alert loudly. The missing index migration should be run.
  } else {
    logger.info("Database index check passed", { checked: criticalIndexes.length });
  }
}
