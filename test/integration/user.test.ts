import { UserService } from "../../src/services/user/service";
import { uniqueEmail } from "../fixtures/users";

describe("UserService Integration", () => {
  const userService = new UserService();
  let createdUserId: string;

  it("creates a user", async () => {
    const user = await userService.createUser({
      email: uniqueEmail("create"),
      name: "Integration Test User",
      password: "SecurePass123!",
    });
    expect(user.id).toBeDefined();
    expect(user.role).toBe("member");
    createdUserId = user.id;
  });

  it("retrieves a user by ID", async () => {
    const user = await userService.getUser(createdUserId);
    expect(user.name).toBe("Integration Test User");
  });

  it("updates a user", async () => {
    const updated = await userService.updateUser(createdUserId, { name: "Updated Name" });
    expect(updated.name).toBe("Updated Name");
  });

  it("lists users with pagination", async () => {
    const result = await userService.listUsers({ page: 1, pageSize: 10 });
    expect(result.users.length).toBeGreaterThan(0);
    expect(result.total).toBeGreaterThan(0);
  });

  it("authenticates with correct credentials", async () => {
    const email = uniqueEmail("auth");
    await userService.createUser({ email, name: "Auth Test", password: "TestPass123!" });
    const token = await userService.authenticate(email, "TestPass123!");
    expect(token).toBeDefined();
    expect(typeof token).toBe("string");
  });

  it("rejects wrong password", async () => {
    const email = uniqueEmail("wrongpass");
    await userService.createUser({ email, name: "Wrong Pass Test", password: "CorrectPass123!" });
    await expect(userService.authenticate(email, "WrongPass123!")).rejects.toThrow();
  });

  it("deletes a user", async () => {
    await userService.deleteUser(createdUserId);
    await expect(userService.getUser(createdUserId)).rejects.toThrow("not found");
  });
});
