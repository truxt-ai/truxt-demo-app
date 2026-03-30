import { db } from "../shared/database";
import { redis } from "../shared/cache";
import { logger } from "../shared/logger";

interface DigestEntry {
  userId: string;
  email: string;
  notifications: Array<{
    type: string;
    title: string;
    body: string;
    created_at: Date;
  }>;
}

const DIGEST_FREQUENCIES = {
  hourly: "1 hour",
  daily: "24 hours",
} as const;

type DigestFrequency = keyof typeof DIGEST_FREQUENCIES;

export class DigestWorker {
  async run(frequency: DigestFrequency): Promise<void> {
    const interval = DIGEST_FREQUENCIES[frequency];
    const lockKey = `digest:lock:${frequency}`;

    // Distributed lock to prevent duplicate runs across instances
    const acquired = await redis.set(lockKey, "1", { NX: true, EX: 3600 });
    if (!acquired) {
      logger.info(`Digest lock already held, skipping ${frequency} run`);
      return;
    }

    try {
      logger.info(`Starting ${frequency} digest run`);
      const digests = await this.buildDigests(interval, frequency);

      let sent = 0;
      for (const digest of digests) {
        if (digest.notifications.length === 0) continue;
        await this.queueDigestEmail(digest, frequency);
        await this.markDigestSent(digest.userId, frequency);
        sent++;
      }

      logger.info(`${frequency} digest complete`, { usersNotified: sent, totalUsers: digests.length });
    } finally {
      await redis.del(lockKey);
    }
  }

  private async buildDigests(interval: string, frequency: DigestFrequency): Promise<DigestEntry[]> {
    // Find users who have digest enabled and have unread notifications
    const result = await db.query(
      `SELECT
         u.id AS user_id,
         u.email,
         json_agg(
           json_build_object(
             'type', n.type,
             'title', n.title,
             'body', n.body,
             'created_at', n.created_at
           ) ORDER BY n.created_at DESC
         ) AS notifications
       FROM users u
       INNER JOIN notification_preferences np ON u.id = np.user_id
       INNER JOIN notifications n ON u.id = n.user_id
       WHERE (np.preferences->>'digestFrequency') = $1
         AND n.read = false
         AND n.created_at > NOW() - $2::interval
         AND NOT EXISTS (
           SELECT 1 FROM digest_sends ds
           WHERE ds.user_id = u.id
             AND ds.frequency = $1
             AND ds.sent_at > NOW() - $2::interval
         )
       GROUP BY u.id, u.email`,
      [frequency, interval]
    );

    return result.rows.map((row: any) => ({
      userId: row.user_id,
      email: row.email,
      notifications: row.notifications || [],
    }));
  }

  private async queueDigestEmail(digest: DigestEntry, frequency: DigestFrequency): Promise<void> {
    const subject = frequency === "hourly"
      ? `You have ${digest.notifications.length} unread notification${digest.notifications.length > 1 ? "s" : ""}`
      : `Your daily summary — ${digest.notifications.length} notification${digest.notifications.length > 1 ? "s" : ""}`;

    await redis.lPush("delivery:email", JSON.stringify({
      userId: digest.userId,
      notification: {
        id: `digest-${Date.now()}`,
        type: "digest",
        title: subject,
        body: JSON.stringify(digest.notifications), // email worker renders this
      },
    }));
  }

  private async markDigestSent(userId: string, frequency: DigestFrequency): Promise<void> {
    await db.query(
      `INSERT INTO digest_sends (user_id, frequency, sent_at) VALUES ($1, $2, NOW())
       ON CONFLICT (user_id, frequency) DO UPDATE SET sent_at = NOW()`,
      [userId, frequency]
    ).catch((err: any) => {
      // Table may not exist yet — log but don't fail
      logger.warn("Could not record digest send", { error: err.message });
    });
  }
}

// Entry point for cron invocation
// Usage: node dist/workers/digest-worker.js hourly
if (require.main === module) {
  const frequency = (process.argv[2] || "daily") as DigestFrequency;
  const worker = new DigestWorker();
  worker.run(frequency)
    .then(() => process.exit(0))
    .catch((err) => { logger.error("Digest worker failed", { error: err.message }); process.exit(1); });
}

export default DigestWorker;
