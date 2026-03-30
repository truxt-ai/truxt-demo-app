import { Router } from "express";
import { TokenRefreshService } from "./refresh";

const router = Router();
const tokenService = new TokenRefreshService();

router.post("/refresh", async (req, res) => {
  const refreshToken = req.body.refreshToken || req.cookies?.refreshToken;
  if (!refreshToken) {
    return res.status(400).json({ error: "refreshToken required" });
  }

  const tokens = await tokenService.refresh(refreshToken);
  res.json({ data: tokens });
});

router.post("/logout", async (req, res) => {
  const userId = (req as any).user?.id;
  if (userId) {
    await tokenService.revokeRefreshToken(userId);
  }
  res.json({ status: "ok" });
});

router.post("/logout-all", async (req, res) => {
  const userId = (req as any).user?.id;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  await tokenService.revokeAllTokens(userId);
  res.json({ status: "ok", message: "All sessions terminated" });
});

export { router as authRouter };
