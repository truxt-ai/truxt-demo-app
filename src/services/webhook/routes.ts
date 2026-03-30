import { Router } from "express";
import { WebhookService } from "./service";

const router = Router();
const webhookService = new WebhookService();

// --- Registration ---

router.post("/", async (req, res) => {
  const webhook = await webhookService.register(req.body, (req as any).user.id);
  res.status(201).json({ data: webhook });
});

router.get("/", async (req, res) => {
  const teamId = req.query.teamId as string;
  if (!teamId) return res.status(400).json({ error: "teamId required" });
  const webhooks = await webhookService.listWebhooks(teamId);
  res.json({ data: webhooks });
});

router.get("/:id", async (req, res) => {
  const webhook = await webhookService.getWebhook(req.params.id);
  res.json({ data: webhook });
});

router.put("/:id", async (req, res) => {
  const webhook = await webhookService.updateWebhook(req.params.id, req.body);
  res.json({ data: webhook });
});

router.delete("/:id", async (req, res) => {
  await webhookService.deleteWebhook(req.params.id);
  res.status(204).send();
});

router.post("/:id/rotate-secret", async (req, res) => {
  const result = await webhookService.rotateSecret(req.params.id);
  res.json({ data: result });
});

// --- Delivery history ---

router.get("/:id/deliveries", async (req, res) => {
  const result = await webhookService.getDeliveries(req.params.id, {
    page: parseInt(req.query.page as string) || 1,
    pageSize: parseInt(req.query.pageSize as string) || 20,
  });
  res.json({ data: result.deliveries, pagination: { total: result.total } });
});

router.post("/deliveries/:deliveryId/replay", async (req, res) => {
  await webhookService.replayDelivery(req.params.deliveryId);
  res.json({ status: "queued" });
});

// --- Test endpoint ---

router.post("/:id/test", async (req, res) => {
  const webhook = await webhookService.getWebhook(req.params.id);
  await webhookService.dispatch(webhook.team_id, "user.created", {
    test: true,
    message: "This is a test webhook delivery",
    timestamp: new Date().toISOString(),
  }, (req as any).user.id);
  res.json({ status: "test event dispatched" });
});

export { router as webhookRouter };
