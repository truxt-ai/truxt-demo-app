import { QueryBuilder } from "../../src/shared/query-builder";

describe("QueryBuilder", () => {
  it("builds simple SELECT", () => {
    const q = new QueryBuilder("users").build();
    expect(q.text).toBe("SELECT * FROM users");
    expect(q.values).toEqual([]);
  });

  it("supports select fields", () => {
    const q = new QueryBuilder("users").select("id", "name", "email").build();
    expect(q.text).toBe("SELECT id, name, email FROM users");
  });

  it("supports WHERE clause", () => {
    const q = new QueryBuilder("users").where("role", "=", "admin").build();
    expect(q.text).toBe("SELECT * FROM users WHERE role = $1");
    expect(q.values).toEqual(["admin"]);
  });

  it("supports multiple WHERE conditions", () => {
    const q = new QueryBuilder("users")
      .where("role", "=", "admin")
      .where("name", "LIKE", "%test%")
      .build();
    expect(q.text).toBe("SELECT * FROM users WHERE role = $1 AND name LIKE $2");
    expect(q.values).toEqual(["admin", "%test%"]);
  });

  it("supports IN operator", () => {
    const q = new QueryBuilder("users").where("role", "IN", ["admin", "member"]).build();
    expect(q.text).toBe("SELECT * FROM users WHERE role IN ($1, $2)");
    expect(q.values).toEqual(["admin", "member"]);
  });

  it("supports BETWEEN operator", () => {
    const q = new QueryBuilder("events")
      .where("created_at", "BETWEEN", ["2024-01-01", "2024-12-31"])
      .build();
    expect(q.text).toBe("SELECT * FROM events WHERE created_at BETWEEN $1 AND $2");
    expect(q.values).toEqual(["2024-01-01", "2024-12-31"]);
  });

  it("supports ORDER BY", () => {
    const q = new QueryBuilder("users").orderBy("created_at", "DESC").build();
    expect(q.text).toBe("SELECT * FROM users ORDER BY created_at DESC");
  });

  it("supports LIMIT and OFFSET", () => {
    const q = new QueryBuilder("users").limit(10).offset(20).build();
    expect(q.text).toBe("SELECT * FROM users LIMIT $1 OFFSET $2");
    expect(q.values).toEqual([10, 20]);
  });

  it("builds complex query", () => {
    const q = new QueryBuilder("analytics_events")
      .select("type", "COUNT(*) as count")
      .where("user_id", "=", "uuid-123")
      .where("created_at", ">=", "2024-01-01")
      .orderBy("count", "DESC")
      .limit(10)
      .build();
    expect(q.text).toBe(
      "SELECT type, COUNT(*) as count FROM analytics_events WHERE user_id = $1 AND created_at >= $2 ORDER BY count DESC LIMIT $3"
    );
    expect(q.values).toEqual(["uuid-123", "2024-01-01", 10]);
  });
});
