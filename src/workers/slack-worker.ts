import { redis } from "../shared/cache";
import { logger } from "../shared/logger";

interface SlackJob {
  userId: string;
  notification: {
    id: string;
    type: string;
    title: string;
    body: string;
    actionUrl?: string;
  };
}

const QUEUE_KEY = "delivery:slack";
const WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;

class SlackWorker {
  private running = false;

  async start(): Promise<void> {
    if (!WEBHOOK_URL) {
      logger.warn("Slack webhook URL not configured, worker disabled");
      return;
    }

    this.running = true;
    logger.info("Slack worker started");

    while (this.running) {
      const raw = await redis.rPop(QUEUE_KEY);
      if (!raw) {
        await new Promise((r) => setTimeout(r, 5000));
        continue;
      }

      try {
        const job: SlackJob = JSON.parse(raw);
        await this.send(job);
      } catch (err: any) {
        logger.error("Slack delivery failed", { error: err.message });
      }
    }
  }

  async stop(): Promise<void> {
    this.running = false;
  }

  private async send(job: SlackJob): Promise<void> {
    const blocks: any[] = [
      {
        type: "header",
        text: { type: "plain_text", text: job.notification.title },
      },
      {
        type: "section",
        text: { type: "mrkdwn", text: job.notification.body },
      },
      {
        type: "context",
        elements: [
          { type: "mrkdwn", text: `*Type:* ${job.notification.type} | *User:* ${job.userId}` },
        ],
      },
    ];

    if (job.notification.actionUrl) {
      blocks.push({
        type: "actions",
        elements: [
          {
            type: "button",
            text: { type: "plain_text", text: "View Details" },
            url: job.notification.actionUrl,
          },
        ],
      });
    }

    const resp = await fetch(WEBHOOK_URL!, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ blocks }),
    });

    if (!resp.ok) {
      throw new Error(`Slack API error: ${resp.status} ${await resp.text()}`);
    }

    logger.debug("Slack notification sent", { notificationId: job.notification.id });
  }
}

if (require.main === module) {
  const worker = new SlackWorker();
  process.on("SIGTERM", () => worker.stop());
  worker.start();
}

export { SlackWorker };
