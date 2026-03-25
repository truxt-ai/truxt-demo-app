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

// Search and autocomplete — added via feature/user-search
import { UserSearchService } from "./search";
const searchService = new UserSearchService();

router.get("/search", async (req, res) => {
  const { q, role, createdAfter, createdBefore, page, pageSize, sortBy, sortOrder } = req.query;

  const result = await searchService.search({
    query: q as string,
    role: role as any,
    createdAfter: createdAfter as string,
    createdBefore: createdBefore as string,
    page: parseInt(page as string) || 1,
    pageSize: parseInt(pageSize as string) || 20,
    sortBy: sortBy as any,
    sortOrder: sortOrder as any,
  });

  res.json({ data: result });
});

router.get("/suggest", async (req, res) => {
  const { q, limit } = req.query;
  const suggestions = await searchService.suggest(q as string, parseInt(limit as string) || 5);
  res.json({ data: suggestions });
});
