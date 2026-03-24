import { Router } from "express";
import { UserService } from "./service";
import { createUserSchema, updateUserSchema } from "./validation";
import { validateBody } from "../../shared/validation";

const router = Router();
const userService = new UserService();

router.get("/", async (_req, res) => {
  const users = await userService.listUsers();
  res.json({ data: users });
});

router.get("/:id", async (req, res) => {
  const user = await userService.getUser(req.params.id);
  res.json({ data: user });
});

router.post("/", validateBody(createUserSchema), async (req, res) => {
  const user = await userService.createUser(req.body);
  res.status(201).json({ data: user });
});

router.put("/:id", validateBody(updateUserSchema), async (req, res) => {
  const user = await userService.updateUser(req.params.id, req.body);
  res.json({ data: user });
});

router.delete("/:id", async (req, res) => {
  await userService.deleteUser(req.params.id);
  res.status(204).send();
});

router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  const token = await userService.authenticate(email, password);
  res.json({ data: { token } });
});

export { router as userRouter };
