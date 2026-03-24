import { db } from "../../shared/database";
import { redis } from "../../shared/cache";

export interface AnalyticsEvent {
  type: string;
  userId: string;
  metadata?: Record<string, any>;
  timestamp?: string;
}

export class AnalyticsService {
  async trackEvent(event: AnalyticsEvent): Promise<void> {
    await db.query(
      "INSERT INTO analytics_events (type, user_id, metadata, timestamp) VALUES ($1, $2, $3, $4)",
      [event.type, event.userId, JSON.stringify(event.metadata || {}), event.timestamp || new Date().toISOString()]
    );

    // Increment real-time counter
    const key = `analytics:${event.type}:${new Date().toISOString().split("T")[0]}`;
    await redis.incr(key);
    await redis.expire(key, 86400 * 30);
  }

  async getDashboardMetric(
    metric: string,
    opts: { from: string; to: string; granularity: string }
  ): Promise<any[]> {
    const query = `
      SELECT
        date_trunc($1, timestamp) AS bucket,
        COUNT(*) AS count,
        COUNT(DISTINCT user_id) AS unique_users
      FROM analytics_events
      WHERE type = $2
        AND timestamp BETWEEN $3 AND $4
      GROUP BY bucket
      ORDER BY bucket
    `;
    const result = await db.query(query, [opts.granularity, metric, opts.from, opts.to]);
    return result.rows;
  }

  async getWeeklySummary(): Promise<Record<string, number>> {
    const result = await db.query(`
      SELECT type, COUNT(*) as count
      FROM analytics_events
      WHERE timestamp > NOW() - INTERVAL '7 days'
      GROUP BY type
      ORDER BY count DESC
    `);
    return Object.fromEntries(result.rows.map((r: any) => [r.type, parseInt(r.count)]));
  }
}
