import { db } from "../../shared/database";
import type { User } from "./service";

export interface UserSearchOptions {
  query?: string;
  role?: "admin" | "member" | "viewer";
  createdAfter?: string;
  createdBefore?: string;
  page?: number;
  pageSize?: number;
  sortBy?: "name" | "email" | "created_at";
  sortOrder?: "ASC" | "DESC";
}

export interface UserSearchResult {
  users: User[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export class UserSearchService {
  async search(opts: UserSearchOptions): Promise<UserSearchResult> {
    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (opts.query) {
      conditions.push(`(name ILIKE $${idx} OR email ILIKE $${idx})`);
      params.push(`%${opts.query}%`);
      idx++;
    }

    if (opts.role) {
      conditions.push(`role = $${idx++}`);
      params.push(opts.role);
    }

    if (opts.createdAfter) {
      conditions.push(`created_at >= $${idx++}`);
      params.push(opts.createdAfter);
    }

    if (opts.createdBefore) {
      conditions.push(`created_at <= $${idx++}`);
      params.push(opts.createdBefore);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const allowedSortColumns = { name: "name", email: "email", created_at: "created_at" };
    const sortCol = allowedSortColumns[opts.sortBy || "created_at"];
    const sortDir = opts.sortOrder === "ASC" ? "ASC" : "DESC";

    const page = Math.max(1, opts.page || 1);
    const pageSize = Math.min(100, Math.max(1, opts.pageSize || 20));
    const offset = (page - 1) * pageSize;

    const [dataResult, countResult] = await Promise.all([
      db.query(
        `SELECT id, email, name, role, created_at, updated_at
         FROM users ${where}
         ORDER BY ${sortCol} ${sortDir}
         LIMIT $${idx} OFFSET $${idx + 1}`,
        [...params, pageSize, offset]
      ),
      db.query(`SELECT COUNT(*) FROM users ${where}`, params),
    ]);

    const total = parseInt(countResult.rows[0].count);

    return {
      users: dataResult.rows,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async suggest(query: string, limit: number = 5): Promise<Pick<User, "id" | "name" | "email" | "role">[]> {
    if (!query || query.length < 2) return [];

    const result = await db.query(
      `SELECT id, name, email, role FROM users
       WHERE name ILIKE $1 OR email ILIKE $1
       ORDER BY
         CASE WHEN name ILIKE $2 THEN 0 ELSE 1 END,
         name
       LIMIT $3`,
      [`%${query}%`, `${query}%`, limit]
    );

    return result.rows;
  }
}
