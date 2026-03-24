import { Router } from "express";
import { ApiKeyService } from "./service";

const router = Router();
const apiKeyService = new ApiKeyService();

router.post("/", async (req, res) => {
  const { apiKey, rawKey } = await apiKeyService.create(req.body, (req as any).user.id);
  res.status(201).json({
    data: {
      id: apiKey.id,
      name: apiKey.name,
      prefix: apiKey.prefix,
      scopes: apiKey.scopes,
      expires_at: apiKey.expires_at,
      created_at: apiKey.created_at,
      key: rawKey,
    },
  });
});

router.get("/", async (req, res) => {
  const teamId = req.query.teamId as string;
  if (!teamId) return res.status(400).json({ error: "teamId required" });
  const keys = await apiKeyService.list(teamId);
  res.json({ data: keys });
});

router.delete("/:id", async (req, res) => {
  const teamId = req.query.teamId as string;
  if (!teamId) return res.status(400).json({ error: "teamId required" });
  await apiKeyService.revoke(req.params.id, teamId);
  res.status(204).send();
});

export { router as apiKeyRouter };
