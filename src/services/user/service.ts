import { db } from "../../shared/database";
import { NotFoundError } from "../../shared/errors";
import { hashPassword, comparePassword, generateToken } from "../../shared/crypto";
import { logger } from "../../shared/logger";

export interface User {
  id: string;
  email: string;
  name: string;
  role: "admin" | "member" | "viewer";
  created_at: Date;
  updated_at: Date;
}

export class UserService {
  async listUsers(opts?: { page?: number; pageSize?: number }): Promise<{ users: User[]; total: number }> {
    const page = opts?.page || 1;
    const pageSize = opts?.pageSize || 20;
    const offset = (page - 1) * pageSize;

    const [dataResult, countResult] = await Promise.all([
      db.query(
        "SELECT id, email, name, role, created_at, updated_at FROM users ORDER BY created_at DESC LIMIT $1 OFFSET $2",
        [pageSize, offset]
      ),
      db.query("SELECT COUNT(*) FROM users"),
    ]);

    return { users: dataResult.rows, total: parseInt(countResult.rows[0].count) };
  }

  async getUser(id: string): Promise<User> {
    const result = await db.query(
      "SELECT id, email, name, role, created_at, updated_at FROM users WHERE id = $1",
      [id]
    );
    if (result.rows.length === 0) throw new NotFoundError(`User ${id} not found`);
    return result.rows[0];
  }

  async createUser(data: { email: string; name: string; password: string; role?: string }): Promise<User> {
    return db.transaction(async (client) => {
      // Check for duplicate email within transaction
      const existing = await client.query("SELECT id FROM users WHERE email = $1 FOR UPDATE", [data.email]);
      if (existing.rows.length > 0) {
        throw new Error(`User with email ${data.email} already exists`);
      }

      const hashedPassword = await hashPassword(data.password);
      const result = await client.query(
        "INSERT INTO users (email, name, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id, email, name, role, created_at, updated_at",
        [data.email, data.name, hashedPassword, data.role || "member"]
      );

      logger.info("User created", { userId: result.rows[0].id, email: data.email });
      return result.rows[0];
    });
  }

  async updateUser(id: string, data: Partial<{ email: string; name: string; role: string }>): Promise<User> {
    return db.transaction(async (client) => {
      // Lock the row
      const lock = await client.query("SELECT id FROM users WHERE id = $1 FOR UPDATE", [id]);
      if (lock.rows.length === 0) throw new NotFoundError(`User ${id} not found`);

      if (data.email) {
        const dup = await client.query("SELECT id FROM users WHERE email = $1 AND id != $2", [data.email, id]);
        if (dup.rows.length > 0) throw new Error(`Email ${data.email} already in use`);
      }

      const fields: string[] = [];
      const values: any[] = [];
      let idx = 1;

      for (const [key, value] of Object.entries(data)) {
        if (value !== undefined) {
          fields.push(`${key} = $${idx}`);
          values.push(value);
          idx++;
        }
      }

      if (fields.length === 0) throw new Error("No fields to update");

      values.push(id);
      const result = await client.query(
        `UPDATE users SET ${fields.join(", ")}, updated_at = NOW() WHERE id = $${idx} RETURNING id, email, name, role, created_at, updated_at`,
        values
      );

      logger.info("User updated", { userId: id, fields: Object.keys(data) });
      return result.rows[0];
    });
  }

  async deleteUser(id: string): Promise<void> {
    const result = await db.query("DELETE FROM users WHERE id = $1", [id]);
    if (result.rowCount === 0) throw new NotFoundError(`User ${id} not found`);
    logger.info("User deleted", { userId: id });
  }

  async authenticate(email: string, password: string): Promise<string> {
    const result = await db.query(
      "SELECT id, email, name, role, password_hash FROM users WHERE email = $1",
      [email]
    );
    if (result.rows.length === 0) throw new NotFoundError("Invalid credentials");

    const user = result.rows[0];
    const valid = await comparePassword(password, user.password_hash);
    if (!valid) throw new NotFoundError("Invalid credentials");

    logger.info("User authenticated", { userId: user.id });
    return generateToken({ id: user.id, email: user.email, role: user.role });
  }
}
