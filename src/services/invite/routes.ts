import { Router } from "express";
import { InviteService } from "./service";

const router = Router();
const inviteService = new InviteService();

router.post("/:teamId/invites", async (req, res) => {
  const invite = await inviteService.createInvite(
    req.params.teamId,
    req.body.email,
    req.body.role || "member",
    (req as any).user.id
  );
  res.status(201).json({ data: invite });
});

router.get("/:teamId/invites", async (req, res) => {
  const invites = await inviteService.listPendingInvites(req.params.teamId);
  res.json({ data: invites });
});

router.post("/invites/:token/accept", async (req, res) => {
  const result = await inviteService.acceptInvite(req.params.token, (req as any).user.id);
  res.json({ data: result });
});

router.delete("/:teamId/invites/:inviteId", async (req, res) => {
  await inviteService.revokeInvite(req.params.teamId, req.params.inviteId, (req as any).user.id);
  res.status(204).send();
});

router.post("/:teamId/invites/:inviteId/resend", async (req, res) => {
  const invite = await inviteService.resendInvite(req.params.teamId, req.params.inviteId);
  res.json({ data: invite });
});

export { router as inviteRouter };
