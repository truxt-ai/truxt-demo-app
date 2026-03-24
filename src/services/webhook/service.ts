import { db } from "../../shared/database";
import { redis } from "../../shared/cache";
import { NotFoundError, ValidationError, ConflictError } from "../../shared/errors";
import { logger } from "../../shared/logger";
import { WebhookSigner } from "./signer";
import type { WebhookRegistration, WebhookDelivery, WebhookEvent, WebhookPayload } from "./types";

const MAX_WEBHOOKS_PER_TEAM = 20;
const MAX_RETRY_ATTEMPTS = 5;
const RETRY_DELAYS = [0, 60, 300, 1800, 7200]; // seconds: immediate, 1m, 5m, 30m, 2h

export class WebhookService {
  // --- Registration ---

  async register(data: {
    team_id: string;
    url: string;
    events: WebhookEvent[];
    description?: string;
    headers?: Record<string, string>;
  }, userId: string): Promise<WebhookRegistration> {
    // Validate URL
    try { new URL(data.url); } catch { throw new ValidationError("Invalid webhook URL"); }
    if (!data.url.startsWith("https://")) throw new ValidationError("Webhook URL must use HTTPS");

    // Check limit
    const count = await db.query(
      "SELECT COUNT(*) FROM webhook_registrations WHERE team_id = $1",
      [data.team_id]
    );
    if (parseInt(count.rows[0].count) >= MAX_WEBHOOKS_PER_TEAM) {
      throw new ValidationError(`Maximum ${MAX_WEBHOOKS_PER_TEAM} webhooks per team`);
    }

    // Check for duplicate URL
    const existing = await db.query(
      "SELECT id FROM webhook_registrations WHERE team_id = $1 AND url = $2",
      [data.team_id, data.url]
    );
    if (existing.rows.length > 0) throw new ConflictError("Webhook already registered for this URL");

    const secret = WebhookSigner.generateSecret();

    const result = await db.query(
      `INSERT INTO webhook_registrations (team_id, url, secret, events, description, headers, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [data.team_id, data.url, secret, JSON.stringify(data.events), data.description, JSON.stringify(data.headers || {}), userId]
    );

    logger.info("Webhook registered", { teamId: data.team_id, url: data.url, events: data.events });
    return { ...result.rows[0], secret }; // Only return secret on creation
  }

  async getWebhook(webhookId: string): Promise<WebhookRegistration> {
    const result = await db.query(
      "SELECT id, team_id, url, events, active, description, headers, created_by, failure_count, last_triggered_at, last_status_code, created_at, updated_at FROM webhook_registrations WHERE id = $1",
      [webhookId]
    );
    if (result.rows.length === 0) throw new NotFoundError(`Webhook ${webhookId} not found`);
    return result.rows[0]; // Note: secret NOT returned
  }

  async listWebhooks(teamId: string): Promise<WebhookRegistration[]> {
    const result = await db.query(
      "SELECT id, team_id, url, events, active, description, failure_count, last_triggered_at, last_status_code, created_at FROM webhook_registrations WHERE team_id = $1 ORDER BY created_at DESC",
      [teamId]
    );
    return result.rows;
  }

  async updateWebhook(webhookId: string, data: Partial<Pick<WebhookRegistration, "url" | "events" | "active" | "description" | "headers">>): Promise<WebhookRegistration> {
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (data.url) {
      if (!data.url.startsWith("https://")) throw new ValidationError("Webhook URL must use HTTPS");
      fields.push(`url = $${idx++}`); values.push(data.url);
    }
    if (data.events) { fields.push(`events = $${idx++}`); values.push(JSON.stringify(data.events)); }
    if (data.active !== undefined) {
      fields.push(`active = $${idx++}`); values.push(data.active);
      if (data.active) { fields.push("failure_count = 0"); } // Reset on re-enable
    }
    if (data.description !== undefined) { fields.push(`description = $${idx++}`); values.push(data.description); }
    if (data.headers) { fields.push(`headers = $${idx++}`); values.push(JSON.stringify(data.headers)); }

    if (fields.length === 0) throw new ValidationError("No fields to update");

    values.push(webhookId);
    const result = await db.query(
      `UPDATE webhook_registrations SET ${fields.join(", ")}, updated_at = NOW() WHERE id = $${idx} RETURNING *`,
      values
    );
    if (result.rows.length === 0) throw new NotFoundError(`Webhook ${webhookId} not found`);
    return result.rows[0];
  }

  async deleteWebhook(webhookId: string): Promise<void> {
    const result = await db.query("DELETE FROM webhook_registrations WHERE id = $1", [webhookId]);
    if (result.rowCount === 0) throw new NotFoundError(`Webhook ${webhookId} not found`);
  }

  async rotateSecret(webhookId: string): Promise<{ secret: string }> {
    const newSecret = WebhookSigner.generateSecret();
    const result = await db.query(
      "UPDATE webhook_registrations SET secret = $1, updated_at = NOW() WHERE id = $2 RETURNING id",
      [newSecret, webhookId]
    );
    if (result.rows.length === 0) throw new NotFoundError(`Webhook ${webhookId} not found`);
    logger.info("Webhook secret rotated", { webhookId });
    return { secret: newSecret };
  }

  // --- Dispatch ---

  async dispatch(teamId: string, event: WebhookEvent, data: Record<string, any>, triggeredBy?: string): Promise<void> {
    const webhooks = await db.query(
      "SELECT * FROM webhook_registrations WHERE team_id = $1 AND active = true AND events @> $2::jsonb",
      [teamId, JSON.stringify([event])]
    );

    if (webhooks.rows.length === 0) return;

    const payload: WebhookPayload = {
      id: crypto.randomUUID(),
      event,
      timestamp: new Date().toISOString(),
      data,
      metadata: { team_id: teamId, triggered_by: triggeredBy, correlation_id: crypto.randomUUID() },
    };

    // Queue deliveries
    for (const webhook of webhooks.rows) {
      await redis.lPush("webhook:deliveries", JSON.stringify({
        webhookId: webhook.id,
        url: webhook.url,
        secret: webhook.secret,
        headers: typeof webhook.headers === "string" ? JSON.parse(webhook.headers) : webhook.headers,
        payload,
        attempt: 1,
        maxAttempts: MAX_RETRY_ATTEMPTS,
      }));
    }

    logger.info("Webhook dispatched", { teamId, event, recipientCount: webhooks.rows.length });
  }

  // --- Delivery history ---

  async getDeliveries(webhookId: string, opts?: { page?: number; pageSize?: number }): Promise<{ deliveries: WebhookDelivery[]; total: number }> {
    const page = opts?.page || 1;
    const pageSize = opts?.pageSize || 20;
    const offset = (page - 1) * pageSize;

    const [data, count] = await Promise.all([
      db.query(
        "SELECT * FROM webhook_deliveries WHERE webhook_id = $1 ORDER BY delivered_at DESC LIMIT $2 OFFSET $3",
        [webhookId, pageSize, offset]
      ),
      db.query("SELECT COUNT(*) FROM webhook_deliveries WHERE webhook_id = $1", [webhookId]),
    ]);

    return { deliveries: data.rows, total: parseInt(count.rows[0].count) };
  }

  async replayDelivery(deliveryId: string): Promise<void> {
    const delivery = await db.query("SELECT * FROM webhook_deliveries WHERE id = $1", [deliveryId]);
    if (delivery.rows.length === 0) throw new NotFoundError("Delivery not found");

    const d = delivery.rows[0];
    const webhook = await db.query("SELECT * FROM webhook_registrations WHERE id = $1", [d.webhook_id]);
    if (webhook.rows.length === 0) throw new NotFoundError("Webhook no longer exists");

    await redis.lPush("webhook:deliveries", JSON.stringify({
      webhookId: d.webhook_id,
      url: webhook.rows[0].url,
      secret: webhook.rows[0].secret,
      headers: webhook.rows[0].headers,
      payload: d.payload,
      attempt: 1,
      maxAttempts: 1,
      isReplay: true,
    }));

    logger.info("Webhook delivery replayed", { deliveryId, webhookId: d.webhook_id });
  }
}
