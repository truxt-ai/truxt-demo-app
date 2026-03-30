import { db } from "../../shared/database";
import { redis } from "../../shared/cache";
import { NotFoundError, ValidationError } from "../../shared/errors";
import { logger } from "../../shared/logger";
import { MetricAggregator } from "./aggregator";
import type { Dashboard, DashboardWidget, MetricSummary, TimeSeriesPoint } from "./types";

const CACHE_TTL = 300; // 5 minutes

export class MetricsService {
  private aggregator = new MetricAggregator();

  // --- Pre-built metrics ---

  async getUserGrowth(from: string, to: string, granularity: "day" | "week" | "month" = "day"): Promise<TimeSeriesPoint[]> {
    const cacheKey = `metrics:user_growth:${from}:${to}:${granularity}`;
    const cached = await redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const result = await this.aggregator.queryTimeSeries({
      table: "users",
      valueColumn: "id",
      timestampColumn: "created_at",
      from, to,
      granularity,
      aggregation: "count",
    });

    await redis.set(cacheKey, JSON.stringify(result), { EX: CACHE_TTL });
    return result;
  }

  async getActiveUsers(from: string, to: string, granularity: "day" | "week" = "day"): Promise<TimeSeriesPoint[]> {
    const result = await db.query(
      `SELECT date_trunc($1, timestamp) AS bucket, COUNT(DISTINCT user_id) AS value
       FROM analytics_events
       WHERE timestamp BETWEEN $2 AND $3
       GROUP BY bucket ORDER BY bucket`,
      [granularity, from, to]
    );
    return result.rows.map((r: any) => ({ timestamp: r.bucket, value: parseInt(r.value) }));
  }

  async getEventVolume(from: string, to: string, granularity: "hour" | "day" = "day"): Promise<TimeSeriesPoint[]> {
    return this.aggregator.queryTimeSeries({
      table: "analytics_events",
      valueColumn: "id",
      timestampColumn: "timestamp",
      from, to,
      granularity,
      aggregation: "count",
    });
  }

  async getEventsByType(from: string, to: string): Promise<{ label: string; value: number }[]> {
    return this.aggregator.getTopN({
      table: "analytics_events",
      groupColumn: "type",
      valueColumn: "id",
      timestampColumn: "timestamp",
      from, to,
      limit: 20,
    });
  }

  async getUserRetention(cohortDate: string, days: number = 30): Promise<{ day: number; retained: number; total: number; rate: number }[]> {
    const result = await db.query(
      `WITH cohort AS (
        SELECT id FROM users WHERE DATE(created_at) = $1
      ),
      activity AS (
        SELECT DISTINCT ae.user_id, (DATE(ae.timestamp) - $1::date) AS day_offset
        FROM analytics_events ae
        INNER JOIN cohort c ON ae.user_id = c.id
        WHERE ae.timestamp >= $1::date AND ae.timestamp < ($1::date + $2 * INTERVAL '1 day')
      )
      SELECT
        gs.day,
        COUNT(a.user_id) AS retained,
        (SELECT COUNT(*) FROM cohort) AS total
      FROM generate_series(0, $2 - 1) AS gs(day)
      LEFT JOIN activity a ON a.day_offset = gs.day
      GROUP BY gs.day
      ORDER BY gs.day`,
      [cohortDate, days]
    );

    return result.rows.map((r: any) => ({
      day: r.day,
      retained: parseInt(r.retained),
      total: parseInt(r.total),
      rate: r.total > 0 ? Math.round((parseInt(r.retained) / parseInt(r.total)) * 10000) / 100 : 0,
    }));
  }

  async getOverviewSummary(): Promise<Record<string, MetricSummary>> {
    const now = new Date();
    const currentStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7).toISOString();
    const currentEnd = now.toISOString();
    const previousStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 14).toISOString();
    const previousEnd = currentStart;

    const [users, events, activeUsers] = await Promise.all([
      this.aggregator.computeSummary({
        table: "users",
        valueColumn: "id",
        timestampColumn: "created_at",
        currentPeriodStart: currentStart,
        currentPeriodEnd: currentEnd,
        previousPeriodStart: previousStart,
        previousPeriodEnd: previousEnd,
      }),
      this.aggregator.computeSummary({
        table: "analytics_events",
        valueColumn: "id",
        timestampColumn: "timestamp",
        currentPeriodStart: currentStart,
        currentPeriodEnd: currentEnd,
        previousPeriodStart: previousStart,
        previousPeriodEnd: previousEnd,
      }),
      this.computeActiveUserSummary(currentStart, currentEnd, previousStart, previousEnd),
    ]);

    return { newUsers: users, totalEvents: events, activeUsers };
  }

  private async computeActiveUserSummary(cs: string, ce: string, ps: string, pe: string): Promise<MetricSummary> {
    const result = await db.query(
      `SELECT
        (SELECT COUNT(DISTINCT user_id) FROM analytics_events WHERE timestamp BETWEEN $1 AND $2) AS current_value,
        (SELECT COUNT(DISTINCT user_id) FROM analytics_events WHERE timestamp BETWEEN $3 AND $4) AS previous_value`,
      [cs, ce, ps, pe]
    );

    const current = parseInt(result.rows[0].current_value);
    const previous = parseInt(result.rows[0].previous_value);
    const change = current - previous;
    const changePercent = previous !== 0 ? (change / previous) * 100 : 0;

    return {
      current, previous, change,
      changePercent: Math.round(changePercent * 100) / 100,
      trend: Math.abs(changePercent) < 5 ? "stable" : change > 0 ? "up" : "down",
    };
  }

  // --- Dashboard CRUD ---

  async createDashboard(data: { name: string; description?: string; team_id: string; widgets?: DashboardWidget[] }, userId: string): Promise<Dashboard> {
    const result = await db.query(
      `INSERT INTO dashboards (name, description, team_id, widgets, created_by)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [data.name, data.description || "", data.team_id, JSON.stringify(data.widgets || []), userId]
    );
    logger.info("Dashboard created", { id: result.rows[0].id, name: data.name });
    return result.rows[0];
  }

  async getDashboard(dashboardId: string): Promise<Dashboard> {
    const result = await db.query("SELECT * FROM dashboards WHERE id = $1", [dashboardId]);
    if (result.rows.length === 0) throw new NotFoundError(`Dashboard ${dashboardId} not found`);
    return result.rows[0];
  }

  async listDashboards(teamId: string): Promise<Dashboard[]> {
    const result = await db.query(
      "SELECT * FROM dashboards WHERE team_id = $1 ORDER BY is_default DESC, name ASC",
      [teamId]
    );
    return result.rows;
  }

  async updateDashboard(dashboardId: string, data: Partial<Pick<Dashboard, "name" | "description" | "widgets">>): Promise<Dashboard> {
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (data.name) { fields.push(`name = $${idx++}`); values.push(data.name); }
    if (data.description !== undefined) { fields.push(`description = $${idx++}`); values.push(data.description); }
    if (data.widgets) { fields.push(`widgets = $${idx++}`); values.push(JSON.stringify(data.widgets)); }

    if (fields.length === 0) throw new ValidationError("No fields to update");

    values.push(dashboardId);
    const result = await db.query(
      `UPDATE dashboards SET ${fields.join(", ")}, updated_at = NOW() WHERE id = $${idx} RETURNING *`,
      values
    );
    if (result.rows.length === 0) throw new NotFoundError(`Dashboard ${dashboardId} not found`);
    return result.rows[0];
  }

  async deleteDashboard(dashboardId: string): Promise<void> {
    const result = await db.query("DELETE FROM dashboards WHERE id = $1 AND is_default = false", [dashboardId]);
    if (result.rowCount === 0) throw new ValidationError("Cannot delete default dashboard");
  }
}
