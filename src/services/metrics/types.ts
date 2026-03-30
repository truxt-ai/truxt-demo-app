export type MetricGranularity = "minute" | "hour" | "day" | "week" | "month";
export type MetricType = "counter" | "gauge" | "histogram" | "summary";

export interface MetricDefinition {
  name: string;
  type: MetricType;
  description: string;
  unit?: string;
  labels: string[];
}

export interface TimeSeriesPoint {
  timestamp: string;
  value: number;
  labels?: Record<string, string>;
}

export interface MetricQuery {
  metric: string;
  from: string;
  to: string;
  granularity: MetricGranularity;
  filters?: Record<string, string>;
  groupBy?: string[];
}

export interface DashboardWidget {
  id: string;
  title: string;
  type: "line" | "bar" | "stat" | "table" | "pie";
  query: MetricQuery;
  position: { x: number; y: number; w: number; h: number };
  options?: Record<string, any>;
}

export interface Dashboard {
  id: string;
  name: string;
  description: string;
  team_id: string;
  widgets: DashboardWidget[];
  created_by: string;
  is_default: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface MetricSummary {
  current: number;
  previous: number;
  change: number;
  changePercent: number;
  trend: "up" | "down" | "stable";
}
