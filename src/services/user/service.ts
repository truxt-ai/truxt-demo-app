import { db } from "../../shared/database";
import { NotFoundError } from "../../shared/errors";
import { hashPassword, comparePassword, generateToken } from "../../shared/crypto";

export interface User {
  id: string;
  email: string;
  name: string;
  role: "admin" | "member" | "viewer";
  created_at: Date;
  updated_at: Date;
}

export class UserService {
  async listUsers(): Promise<User[]> {
    const result = await db.query("SELECT id, email, name, role, created_at, updated_at FROM users ORDER BY created_at DESC");
    return result.rows;
  }

  async getUser(id: string): Promise<User> {
    const result = await db.query("SELECT id, email, name, role, created_at, updated_at FROM users WHERE id = $1", [id]);
    if (result.rows.length === 0) throw new NotFoundError(`User ${id} not found`);
    return result.rows[0];
  }

  async createUser(data: { email: string; name: string; password: string; role?: string }): Promise<User> {
    const hashedPassword = await hashPassword(data.password);
    const result = await db.query(
      "INSERT INTO users (email, name, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id, email, name, role, created_at, updated_at",
      [data.email, data.name, hashedPassword, data.role || "member"]
    );
    return result.rows[0];
  }

  async updateUser(id: string, data: Partial<{ email: string; name: string; role: string }>): Promise<User> {
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
    const result = await db.query(
      `UPDATE users SET ${fields.join(", ")}, updated_at = NOW() WHERE id = $${idx} RETURNING id, email, name, role, created_at, updated_at`,
      values
    );
    if (result.rows.length === 0) throw new NotFoundError(`User ${id} not found`);
    return result.rows[0];
  }

  async deleteUser(id: string): Promise<void> {
    const result = await db.query("DELETE FROM users WHERE id = $1", [id]);
    if (result.rowCount === 0) throw new NotFoundError(`User ${id} not found`);
  }

  async authenticate(email: string, password: string): Promise<string> {
    const result = await db.query("SELECT id, email, name, role, password_hash FROM users WHERE email = $1", [email]);
    if (result.rows.length === 0) throw new NotFoundError("Invalid credentials");

    const user = result.rows[0];
    const valid = await comparePassword(password, user.password_hash);
    if (!valid) throw new NotFoundError("Invalid credentials");

    return generateToken({ id: user.id, email: user.email, role: user.role });
  }
}
