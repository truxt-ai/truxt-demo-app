import { Router } from "express";
import { TeamService } from "./service";
import { requireMinRole } from "../../gateway/middleware/rbac";

const router = Router();
const teamService = new TeamService();

// --- Teams ---

router.post("/", async (req, res) => {
  const team = await teamService.createTeam(req.body, (req as any).user.id);
  res.status(201).json({ data: team });
});

router.get("/", async (req, res) => {
  const teams = await teamService.listTeamsForUser((req as any).user.id);
  res.json({ data: teams });
});

router.get("/:teamId", async (req, res) => {
  const team = await teamService.getTeam(req.params.teamId);
  res.json({ data: team });
});

router.get("/by-slug/:slug", async (req, res) => {
  const team = await teamService.getTeamBySlug(req.params.slug);
  res.json({ data: team });
});

router.put("/:teamId", async (req, res) => {
  const team = await teamService.updateTeam(req.params.teamId, (req as any).user.id, req.body);
  res.json({ data: team });
});

router.delete("/:teamId", async (req, res) => {
  await teamService.deleteTeam(req.params.teamId, (req as any).user.id);
  res.status(204).send();
});

router.put("/:teamId/settings", async (req, res) => {
  const settings = await teamService.updateSettings(req.params.teamId, (req as any).user.id, req.body);
  res.json({ data: settings });
});

// --- Members ---

router.get("/:teamId/members", async (req, res) => {
  const { role, page, pageSize } = req.query;
  const result = await teamService.listMembers(req.params.teamId, {
    role: role as any,
    page: parseInt(page as string) || 1,
    pageSize: parseInt(pageSize as string) || 50,
  });
  res.json({ data: result.members, pagination: { total: result.total } });
});

router.post("/:teamId/members", async (req, res) => {
  const member = await teamService.addMember(
    req.params.teamId,
    req.body.userId,
    req.body.role || "member",
    (req as any).user.id
  );
  res.status(201).json({ data: member });
});

router.delete("/:teamId/members/:userId", async (req, res) => {
  await teamService.removeMember(req.params.teamId, req.params.userId, (req as any).user.id);
  res.status(204).send();
});

router.put("/:teamId/members/:userId/role", async (req, res) => {
  const member = await teamService.updateMemberRole(
    req.params.teamId,
    req.params.userId,
    req.body.role,
    (req as any).user.id
  );
  res.json({ data: member });
});

router.post("/:teamId/transfer-ownership", async (req, res) => {
  await teamService.transferOwnership(req.params.teamId, (req as any).user.id, req.body.newOwnerId);
  res.json({ status: "ok" });
});

// --- Activity ---

router.get("/:teamId/activity", async (req, res) => {
  const activity = await teamService.getActivity(req.params.teamId, {
    page: parseInt(req.query.page as string) || 1,
    pageSize: parseInt(req.query.pageSize as string) || 50,
    action: req.query.action as string,
  });
  res.json({ data: activity });
});

export { router as teamRouter };
