import { createUserSchema, updateUserSchema } from "../../src/services/user/validation";

describe("User Validation", () => {
  describe("createUserSchema", () => {
    it("accepts valid user data", () => {
      const result = createUserSchema.safeParse({
        email: "test@example.com",
        name: "Test User",
        password: "SecurePass123!",
      });
      expect(result.success).toBe(true);
    });

    it("rejects invalid email", () => {
      const result = createUserSchema.safeParse({
        email: "not-an-email",
        name: "Test",
        password: "SecurePass123!",
      });
      expect(result.success).toBe(false);
    });

    it("rejects short password", () => {
      const result = createUserSchema.safeParse({
        email: "test@example.com",
        name: "Test",
        password: "short",
      });
      expect(result.success).toBe(false);
    });

    it("rejects empty name", () => {
      const result = createUserSchema.safeParse({
        email: "test@example.com",
        name: "",
        password: "SecurePass123!",
      });
      expect(result.success).toBe(false);
    });

    it("accepts optional role", () => {
      const result = createUserSchema.safeParse({
        email: "test@example.com",
        name: "Test",
        password: "SecurePass123!",
        role: "admin",
      });
      expect(result.success).toBe(true);
      expect(result.data?.role).toBe("admin");
    });

    it("rejects invalid role", () => {
      const result = createUserSchema.safeParse({
        email: "test@example.com",
        name: "Test",
        password: "SecurePass123!",
        role: "superadmin",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("updateUserSchema", () => {
    it("accepts partial updates", () => {
      expect(updateUserSchema.safeParse({ name: "New Name" }).success).toBe(true);
      expect(updateUserSchema.safeParse({ email: "new@test.com" }).success).toBe(true);
      expect(updateUserSchema.safeParse({ role: "viewer" }).success).toBe(true);
    });

    it("accepts empty object", () => {
      expect(updateUserSchema.safeParse({}).success).toBe(true);
    });
  });
});
