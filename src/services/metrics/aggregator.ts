import { db } from "../../shared/database";
import { logger } from "../../shared/logger";
import type { MetricGranularity, TimeSeriesPoint, MetricSummary } from "./types";

export class MetricAggregator {
  async queryTimeSeries(opts: {
    table: string;
    valueColumn: string;
    timestampColumn: string;
    from: string;
    to: string;
    granularity: MetricGranularity;
    filters?: Record<string, string>;
    groupBy?: string[];
    aggregation?: "count" | "sum" | "avg" | "min" | "max" | "p50" | "p95" | "p99";
  }): Promise<TimeSeriesPoint[]> {
    const conditions = [`${opts.timestampColumn} BETWEEN $1 AND $2`];
    const params: any[] = [opts.from, opts.to];
    let idx = 3;

    if (opts.filters) {
      for (const [key, value] of Object.entries(opts.filters)) {
        conditions.push(`${key} = $${idx++}`);
        params.push(value);
      }
    }

    const aggFunc = this.getAggregationFunction(opts.aggregation || "count", opts.valueColumn);
    const groupByFields = opts.groupBy?.length ? `, ${opts.groupBy.join(", ")}` : "";
    const selectGroupBy = opts.groupBy?.length ? `, ${opts.groupBy.join(", ")}` : "";

    const query = `
      SELECT
        date_trunc('${opts.granularity}', ${opts.timestampColumn}) AS bucket,
        ${aggFunc} AS value
        ${selectGroupBy}
      FROM ${opts.table}
      WHERE ${conditions.join(" AND ")}
      GROUP BY bucket ${groupByFields}
      ORDER BY bucket ASC
    `;

    const result = await db.query(query, params);

    return result.rows.map((row: any) => ({
      timestamp: row.bucket,
      value: parseFloat(row.value),
      labels: opts.groupBy?.reduce((acc: any, key: string) => {
        acc[key] = row[key];
        return acc;
      }, {}),
    }));
  }

  async computeSummary(opts: {
    table: string;
    valueColumn: string;
    timestampColumn: string;
    currentPeriodStart: string;
    currentPeriodEnd: string;
    previousPeriodStart: string;
    previousPeriodEnd: string;
    aggregation?: "count" | "sum" | "avg";
    filters?: Record<string, string>;
  }): Promise<MetricSummary> {
    const filterConditions: string[] = [];
    const filterParams: any[] = [];
    let idx = 5;

    if (opts.filters) {
      for (const [key, value] of Object.entries(opts.filters)) {
        filterConditions.push(`AND ${key} = $${idx++}`);
        filterParams.push(value);
      }
    }

    const aggFunc = opts.aggregation === "sum"
      ? `COALESCE(SUM(${opts.valueColumn}), 0)`
      : opts.aggregation === "avg"
        ? `COALESCE(AVG(${opts.valueColumn}), 0)`
        : "COUNT(*)";

    const query = `
      SELECT
        (SELECT ${aggFunc} FROM ${opts.table}
         WHERE ${opts.timestampColumn} BETWEEN $1 AND $2 ${filterConditions.join(" ")}) AS current_value,
        (SELECT ${aggFunc} FROM ${opts.table}
         WHERE ${opts.timestampColumn} BETWEEN $3 AND $4 ${filterConditions.join(" ")}) AS previous_value
    `;

    const result = await db.query(query, [
      opts.currentPeriodStart, opts.currentPeriodEnd,
      opts.previousPeriodStart, opts.previousPeriodEnd,
      ...filterParams, ...filterParams,
    ]);

    const current = parseFloat(result.rows[0].current_value);
    const previous = parseFloat(result.rows[0].previous_value);
    const change = current - previous;
    const changePercent = previous !== 0 ? (change / previous) * 100 : current > 0 ? 100 : 0;

    return {
      current,
      previous,
      change,
      changePercent: Math.round(changePercent * 100) / 100,
      trend: Math.abs(changePercent) < 5 ? "stable" : change > 0 ? "up" : "down",
    };
  }

  async getTopN(opts: {
    table: string;
    groupColumn: string;
    valueColumn: string;
    timestampColumn: string;
    from: string;
    to: string;
    limit: number;
    aggregation?: "count" | "sum";
    order?: "ASC" | "DESC";
  }): Promise<{ label: string; value: number }[]> {
    const aggFunc = opts.aggregation === "sum"
      ? `SUM(${opts.valueColumn})`
      : "COUNT(*)";

    const result = await db.query(
      `SELECT ${opts.groupColumn} AS label, ${aggFunc} AS value
       FROM ${opts.table}
       WHERE ${opts.timestampColumn} BETWEEN $1 AND $2
       GROUP BY ${opts.groupColumn}
       ORDER BY value ${opts.order || "DESC"}
       LIMIT $3`,
      [opts.from, opts.to, opts.limit]
    );

    return result.rows.map((r: any) => ({ label: r.label, value: parseFloat(r.value) }));
  }

  async getDistribution(opts: {
    table: string;
    valueColumn: string;
    timestampColumn: string;
    from: string;
    to: string;
    buckets: number[];
  }): Promise<{ range: string; count: number }[]> {
    const caseStatements = opts.buckets.map((bucket, i) => {
      if (i === 0) return `WHEN ${opts.valueColumn} < ${bucket} THEN '<${bucket}'`;
      if (i === opts.buckets.length - 1) return `ELSE '>=${bucket}'`;
      return `WHEN ${opts.valueColumn} >= ${opts.buckets[i - 1]} AND ${opts.valueColumn} < ${bucket} THEN '${opts.buckets[i - 1]}-${bucket}'`;
    });

    const result = await db.query(
      `SELECT
        CASE ${caseStatements.join(" ")} END AS range,
        COUNT(*) AS count
       FROM ${opts.table}
       WHERE ${opts.timestampColumn} BETWEEN $1 AND $2
       GROUP BY range
       ORDER BY MIN(${opts.valueColumn})`,
      [opts.from, opts.to]
    );

    return result.rows;
  }

  private getAggregationFunction(agg: string, column: string): string {
    switch (agg) {
      case "count": return "COUNT(*)";
      case "sum": return `SUM(${column})`;
      case "avg": return `ROUND(AVG(${column})::numeric, 2)`;
      case "min": return `MIN(${column})`;
      case "max": return `MAX(${column})`;
      case "p50": return `PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ${column})`;
      case "p95": return `PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY ${column})`;
      case "p99": return `PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY ${column})`;
      default: return "COUNT(*)";
    }
  }
}
