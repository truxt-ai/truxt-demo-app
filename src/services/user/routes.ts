import { Router } from "express";
import { UserService } from "./service";
import { createUserSchema, updateUserSchema } from "./validation";
import { validateBody } from "../../shared/validation";
import { requireRole, requireSelfOrAdmin } from "../../gateway/middleware/rbac";

const router = Router();
const userService = new UserService();

router.get("/", requireRole("admin"), async (_req, res) => {
  const result = await userService.listUsers();
  res.json({ data: result.users });
});

// Fixed: added requireSelfOrAdmin to prevent IDOR (closes #53)
router.get("/:id", requireSelfOrAdmin("id"), async (req, res) => {
  const user = await userService.getUser(req.params.id);
  res.json({ data: user });
});

router.post("/", validateBody(createUserSchema), async (req, res) => {
  const user = await userService.createUser(req.body);
  res.status(201).json({ data: user });
});

router.put("/:id", requireSelfOrAdmin("id"), validateBody(updateUserSchema), async (req, res) => {
  const user = await userService.updateUser(req.params.id, req.body);
  res.json({ data: user });
});

router.delete("/:id", requireRole("admin"), async (req, res) => {
  await userService.deleteUser(req.params.id);
  res.status(204).send();
});

router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  const token = await userService.authenticate(email, password);
  res.json({ data: { token } });
});

export { router as userRouter };
