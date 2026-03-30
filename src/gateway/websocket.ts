import { Server as HTTPServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import jwt from "jsonwebtoken";
import { redis } from "../shared/cache";
import { logger } from "../shared/logger";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";

interface AuthenticatedSocket extends WebSocket {
  userId: string;
  isAlive: boolean;
}

export function setupWebSocket(server: HTTPServer): void {
  const wss = new WebSocketServer({ server, path: "/ws" });
  const clients = new Map<string, Set<AuthenticatedSocket>>();

  wss.on("connection", (ws: AuthenticatedSocket, req) => {
    const url = new URL(req.url!, `http://${req.headers.host}`);
    const token = url.searchParams.get("token");

    if (!token) {
      ws.close(4001, "Missing authentication token");
      return;
    }

    try {
      const decoded = jwt.verify(token, JWT_SECRET) as any;
      ws.userId = decoded.id;
      ws.isAlive = true;

      if (!clients.has(decoded.id)) clients.set(decoded.id, new Set());
      clients.get(decoded.id)!.add(ws);

      logger.info("WebSocket connected", { userId: decoded.id });

      ws.on("pong", () => { ws.isAlive = true; });

      ws.on("message", (data) => {
        try {
          const msg = JSON.parse(data.toString());
          handleMessage(ws, msg);
        } catch {
          ws.send(JSON.stringify({ error: "Invalid message format" }));
        }
      });

      ws.on("close", () => {
        clients.get(ws.userId)?.delete(ws);
        if (clients.get(ws.userId)?.size === 0) clients.delete(ws.userId);
        logger.info("WebSocket disconnected", { userId: ws.userId });
      });

      ws.send(JSON.stringify({ type: "connected", userId: decoded.id }));
    } catch {
      ws.close(4003, "Invalid token");
    }
  });

  // Heartbeat check every 30s
  const heartbeat = setInterval(() => {
    wss.clients.forEach((ws) => {
      const socket = ws as AuthenticatedSocket;
      if (!socket.isAlive) return socket.terminate();
      socket.isAlive = false;
      socket.ping();
    });
  }, 30000);

  wss.on("close", () => clearInterval(heartbeat));

  // Subscribe to Redis notifications channel
  const subscriber = redis.duplicate();
  subscriber.connect().then(() => {
    subscriber.pSubscribe("notifications:*", (message, channel) => {
      const userId = channel.split(":")[1];
      const userClients = clients.get(userId);
      if (userClients) {
        const payload = JSON.stringify({ type: "notification", data: JSON.parse(message) });
        userClients.forEach((ws) => {
          if (ws.readyState === WebSocket.OPEN) ws.send(payload);
        });
      }
    });
  });

  logger.info("WebSocket server initialized on /ws");
}

function handleMessage(ws: AuthenticatedSocket, msg: any) {
  switch (msg.type) {
    case "ping":
      ws.send(JSON.stringify({ type: "pong", timestamp: Date.now() }));
      break;
    case "subscribe":
      logger.debug("WebSocket subscribe", { userId: ws.userId, channel: msg.channel });
      break;
    default:
      ws.send(JSON.stringify({ error: `Unknown message type: ${msg.type}` }));
  }
}
