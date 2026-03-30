import { db } from "../../shared/database";
import { redis } from "../../shared/cache";
import { logger } from "../../shared/logger";

export interface Notification {
  id: string;
  userId: string;
  type: "pr_review" | "mention" | "deploy" | "alert" | "system";
  title: string;
  body: string;
  read: boolean;
  actionUrl?: string;
  created_at: Date;
}

export interface NotificationPreferences {
  email: boolean;
  slack: boolean;
  inApp: boolean;
  digestFrequency: "immediate" | "hourly" | "daily";
  mutedTypes: string[];
}

export class NotificationService {
  async send(userId: string, notification: Omit<Notification, "id" | "read" | "created_at">): Promise<Notification> {
    // Check user preferences
    const prefs = await this.getPreferences(userId);
    if (prefs.mutedTypes.includes(notification.type)) {
      logger.debug("Notification muted by user preference", { userId, type: notification.type });
      return {} as Notification;
    }

    const result = await db.query(
      `INSERT INTO notifications (user_id, type, title, body, action_url)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [userId, notification.type, notification.title, notification.body, notification.actionUrl]
    );

    const saved = result.rows[0];

    // Real-time push via Redis pub/sub
    if (prefs.inApp) {
      await redis.publish(`notifications:${userId}`, JSON.stringify(saved));
    }

    // Queue email/slack delivery
    if (prefs.email && prefs.digestFrequency === "immediate") {
      await this.queueDelivery("email", userId, saved);
    }
    if (prefs.slack) {
      await this.queueDelivery("slack", userId, saved);
    }

    logger.info("Notification sent", { userId, type: notification.type, id: saved.id });
    return saved;
  }

  async listForUser(userId: string, opts?: { unreadOnly?: boolean; limit?: number }): Promise<Notification[]> {
    const conditions = ["user_id = $1"];
    const params: any[] = [userId];

    if (opts?.unreadOnly) {
      conditions.push("read = false");
    }

    const limit = opts?.limit || 50;
    const result = await db.query(
      `SELECT * FROM notifications WHERE ${conditions.join(" AND ")} ORDER BY created_at DESC LIMIT $${params.length + 1}`,
      [...params, limit]
    );
    return result.rows;
  }

  async markRead(userId: string, notificationIds: string[]): Promise<void> {
    await db.query(
      "UPDATE notifications SET read = true WHERE user_id = $1 AND id = ANY($2)",
      [userId, notificationIds]
    );

    // Update unread count cache
    const countResult = await db.query(
      "SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND read = false",
      [userId]
    );
    await redis.set(`unread:${userId}`, countResult.rows[0].count, { EX: 3600 });
  }

  async getUnreadCount(userId: string): Promise<number> {
    // Try cache first
    const cached = await redis.get(`unread:${userId}`);
    if (cached !== null) return parseInt(cached);

    const result = await db.query(
      "SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND read = false",
      [userId]
    );
    const count = parseInt(result.rows[0].count);
    await redis.set(`unread:${userId}`, count.toString(), { EX: 3600 });
    return count;
  }

  async getPreferences(userId: string): Promise<NotificationPreferences> {
    const result = await db.query(
      "SELECT preferences FROM notification_preferences WHERE user_id = $1",
      [userId]
    );
    if (result.rows.length === 0) {
      return { email: true, slack: false, inApp: true, digestFrequency: "immediate", mutedTypes: [] };
    }
    return result.rows[0].preferences;
  }

  async updatePreferences(userId: string, prefs: Partial<NotificationPreferences>): Promise<void> {
    const current = await this.getPreferences(userId);
    const merged = { ...current, ...prefs };
    await db.query(
      `INSERT INTO notification_preferences (user_id, preferences)
       VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE SET preferences = $2`,
      [userId, JSON.stringify(merged)]
    );
  }

  private async queueDelivery(channel: string, userId: string, notification: Notification): Promise<void> {
    await redis.lPush(`delivery:${channel}`, JSON.stringify({ userId, notification }));
    logger.debug("Notification queued for delivery", { channel, userId, notificationId: notification.id });
  }
}
