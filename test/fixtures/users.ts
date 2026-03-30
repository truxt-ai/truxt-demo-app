export const testUsers = {
  admin: {
    email: "admin@test.com",
    name: "Test Admin",
    password: "SecurePass123!",
    role: "admin" as const,
  },
  member: {
    email: "member@test.com",
    name: "Test Member",
    password: "SecurePass123!",
    role: "member" as const,
  },
  viewer: {
    email: "viewer@test.com",
    name: "Test Viewer",
    password: "SecurePass123!",
    role: "viewer" as const,
  },
};

export function uniqueEmail(prefix: string = "test"): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.com`;
}
