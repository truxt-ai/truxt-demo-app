import { Router } from "express";
import { NotificationService } from "./service";

const router = Router();
const notificationService = new NotificationService();

router.get("/", async (req, res) => {
  const userId = (req as any).user.id;
  const unreadOnly = req.query.unread === "true";
  const notifications = await notificationService.listForUser(userId, { unreadOnly });
  res.json({ data: notifications });
});

router.get("/count", async (req, res) => {
  const userId = (req as any).user.id;
  const count = await notificationService.getUnreadCount(userId);
  res.json({ data: { unread: count } });
});

router.post("/read", async (req, res) => {
  const userId = (req as any).user.id;
  const { ids } = req.body;
  await notificationService.markRead(userId, ids);
  res.json({ status: "ok" });
});

router.get("/preferences", async (req, res) => {
  const userId = (req as any).user.id;
  const prefs = await notificationService.getPreferences(userId);
  res.json({ data: prefs });
});

router.put("/preferences", async (req, res) => {
  const userId = (req as any).user.id;
  await notificationService.updatePreferences(userId, req.body);
  res.json({ status: "ok" });
});

export { router as notificationRouter };
