import { Router, Request, Response } from "express";
import { redis } from "../shared/cache";
import { logger } from "../shared/logger";

const router = Router();

interface SSEClient {
  userId: string;
  res: Response;
  subscribedAt: Date;
}

const clients = new Map<string, Set<SSEClient>>();

/**
 * Server-Sent Events endpoint for real-time dashboard updates.
 * Lighter than WebSockets — HTTP/1.1 compatible, auto-reconnect,
 * no upgrade required.
 *
 * Usage: GET /api/stream?topics=notifications,metrics,activity
 */
router.get("/stream", (req: Request, res: Response) => {
  const user = (req as any).user;
  const topics = ((req.query.topics as string) || "notifications").split(",");

  // SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-store");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // Disable nginx buffering
  res.flushHeaders();

  // Send initial connection event
  sendEvent(res, "connected", { userId: user.id, topics, timestamp: new Date().toISOString() });

  const client: SSEClient = { userId: user.id, res, subscribedAt: new Date() };

  if (!clients.has(user.id)) clients.set(user.id, new Set());
  clients.get(user.id)!.add(client);

  logger.info("SSE client connected", { userId: user.id, topics });

  // Keepalive ping every 30s to prevent proxy timeouts
  const keepalive = setInterval(() => {
    if (res.writableEnded) {
      clearInterval(keepalive);
      return;
    }
    res.write(": keepalive\n\n");
  }, 30000);

  // Subscribe to Redis channels for requested topics
  const subscriber = redis.duplicate();
  subscriber.connect().then(() => {
    const channels = topics.map((t) => `${t}:${user.id}`);
    subscriber.subscribe(channels, (message, channel) => {
      const topic = channel.split(":")[0];
      try {
        sendEvent(res, topic, JSON.parse(message));
      } catch {
        sendEvent(res, topic, { raw: message });
      }
    });
  });

  // Cleanup on disconnect
  req.on("close", () => {
    clearInterval(keepalive);
    clients.get(user.id)?.delete(client);
    if (clients.get(user.id)?.size === 0) clients.delete(user.id);
    subscriber.quit().catch(() => {});
    logger.info("SSE client disconnected", { userId: user.id });
  });
});

/**
 * Push a real-time event to all SSE clients for a user.
 * Called from service layer when data changes.
 */
export function pushToUser(userId: string, topic: string, data: Record<string, any>): void {
  const userClients = clients.get(userId);
  if (!userClients?.size) return;

  const payload = JSON.stringify({ ...data, timestamp: new Date().toISOString() });
  userClients.forEach((client) => {
    if (!client.res.writableEnded) {
      sendEvent(client.res, topic, data);
    }
  });
}

/**
 * Broadcast a system-wide event to all connected clients.
 */
export function broadcast(topic: string, data: Record<string, any>): void {
  clients.forEach((userClients, userId) => {
    userClients.forEach((client) => {
      if (!client.res.writableEnded) {
        sendEvent(client.res, topic, { ...data, userId });
      }
    });
  });
}

export function getConnectedClientCount(): number {
  let count = 0;
  clients.forEach((set) => (count += set.size));
  return count;
}

function sendEvent(res: Response, event: string, data: Record<string, any>): void {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export { router as sseRouter };
