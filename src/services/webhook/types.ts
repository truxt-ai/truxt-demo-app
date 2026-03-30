export type WebhookEvent =
  | "user.created" | "user.updated" | "user.deleted"
  | "team.created" | "team.member_added" | "team.member_removed"
  | "notification.sent"
  | "analytics.threshold_exceeded"
  | "deployment.started" | "deployment.completed" | "deployment.failed";

export interface WebhookRegistration {
  id: string;
  team_id: string;
  url: string;
  secret: string;
  events: WebhookEvent[];
  active: boolean;
  description?: string;
  headers?: Record<string, string>;
  created_by: string;
  failure_count: number;
  last_triggered_at?: Date;
  last_status_code?: number;
  created_at: Date;
  updated_at: Date;
}

export interface WebhookDelivery {
  id: string;
  webhook_id: string;
  event: WebhookEvent;
  payload: Record<string, any>;
  request_headers: Record<string, string>;
  response_status?: number;
  response_body?: string;
  response_time_ms?: number;
  attempt: number;
  max_attempts: number;
  success: boolean;
  error?: string;
  delivered_at: Date;
}

export interface WebhookPayload {
  id: string;
  event: WebhookEvent;
  timestamp: string;
  data: Record<string, any>;
  metadata: {
    team_id: string;
    triggered_by?: string;
    correlation_id?: string;
  };
}
