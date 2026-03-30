import { redis } from "../shared/cache";
import { logger } from "../shared/logger";
import nodemailer from "nodemailer";

interface EmailJob {
  userId: string;
  notification: {
    id: string;
    type: string;
    title: string;
    body: string;
  };
}

const QUEUE_KEY = "delivery:email";
const BATCH_SIZE = 10;
const POLL_INTERVAL = 5000;

class EmailWorker {
  private transporter: nodemailer.Transporter;
  private running = false;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || "localhost",
      port: parseInt(process.env.SMTP_PORT || "587"),
      secure: false,
      auth: process.env.SMTP_USER ? {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      } : undefined,
    });
  }

  async start(): Promise<void> {
    this.running = true;
    logger.info("Email worker started");

    while (this.running) {
      try {
        const jobs = await this.dequeue(BATCH_SIZE);
        if (jobs.length > 0) {
          await Promise.allSettled(jobs.map((job) => this.processJob(job)));
          logger.info(`Processed ${jobs.length} email jobs`);
        } else {
          await this.sleep(POLL_INTERVAL);
        }
      } catch (err: any) {
        logger.error("Email worker error", { error: err.message });
        await this.sleep(POLL_INTERVAL * 2);
      }
    }
  }

  async stop(): Promise<void> {
    this.running = false;
    logger.info("Email worker stopping");
  }

  private async dequeue(count: number): Promise<EmailJob[]> {
    const jobs: EmailJob[] = [];
    for (let i = 0; i < count; i++) {
      const raw = await redis.rPop(QUEUE_KEY);
      if (!raw) break;
      try {
        jobs.push(JSON.parse(raw));
      } catch {
        logger.warn("Invalid email job in queue", { raw });
      }
    }
    return jobs;
  }

  private async processJob(job: EmailJob): Promise<void> {
    const userEmail = await this.getUserEmail(job.userId);
    if (!userEmail) {
      logger.warn("No email found for user", { userId: job.userId });
      return;
    }

    await this.transporter.sendMail({
      from: process.env.SMTP_FROM || "noreply@truxt.ai",
      to: userEmail,
      subject: job.notification.title,
      html: this.renderTemplate(job.notification),
    });

    logger.debug("Email sent", { to: userEmail, notificationId: job.notification.id });
  }

  private async getUserEmail(userId: string): Promise<string | null> {
    const { db } = require("../shared/database");
    const result = await db.query("SELECT email FROM users WHERE id = $1", [userId]);
    return result.rows[0]?.email || null;
  }

  private renderTemplate(notification: { type: string; title: string; body: string }): string {
    return `
      <div style="font-family: -apple-system, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #1a1a2e; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
          <h2 style="margin: 0;">${notification.title}</h2>
          <span style="color: #888; font-size: 12px;">${notification.type}</span>
        </div>
        <div style="padding: 20px; background: #f8f9fa; border-radius: 0 0 8px 8px;">
          <p>${notification.body}</p>
        </div>
      </div>
    `;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Run standalone
if (require.main === module) {
  const worker = new EmailWorker();
  process.on("SIGTERM", () => worker.stop());
  process.on("SIGINT", () => worker.stop());
  worker.start();
}

export { EmailWorker };
