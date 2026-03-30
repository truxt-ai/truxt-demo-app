import crypto from "crypto";
import { db } from "../../shared/database";
import { NotFoundError, ValidationError } from "../../shared/errors";
import { logger } from "../../shared/logger";

export interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  key_hash: string;
  scopes: string[];
  team_id: string;
  created_by: string;
  last_used_at?: Date;
  expires_at?: Date;
  revoked_at?: Date;
  created_at: Date;
}

const KEY_PREFIX_LENGTH = 8;
const KEY_LENGTH = 32;
const VALID_SCOPES = [
  "read:metrics", "read:users", "write:users",
  "read:teams", "write:teams",
  "read:webhooks", "write:webhooks",
  "admin",
];

export class ApiKeyService {
  async create(data: {
    name: string;
    scopes: string[];
    team_id: string;
    expires_in_days?: number;
  }, userId: string): Promise<{ apiKey: ApiKey; rawKey: string }> {
    if (!data.name || data.name.length > 100) {
      throw new ValidationError("Name must be between 1 and 100 characters");
    }
    if (!data.scopes.length) {
      throw new ValidationError("At least one scope is required");
    }

    const invalidScopes = data.scopes.filter((s) => !VALID_SCOPES.includes(s));
    if (invalidScopes.length > 0) {
      throw new ValidationError(`Invalid scopes: ${invalidScopes.join(", ")}`);
    }

    const rawKey = crypto.randomBytes(KEY_LENGTH).toString("base64url");
    const prefix = rawKey.substring(0, KEY_PREFIX_LENGTH);
    const keyHash = crypto.createHash("sha256").update(rawKey).digest("hex");

    const expiresAt = data.expires_in_days
      ? new Date(Date.now() + data.expires_in_days * 86400000)
      : null;

    const result = await db.query(
      `INSERT INTO api_keys (name, prefix, key_hash, scopes, team_id, created_by, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [data.name, prefix, keyHash, JSON.stringify(data.scopes), data.team_id, userId, expiresAt]
    );

    logger.info("API key created", { name: data.name, prefix, teamId: data.team_id });
    return { apiKey: result.rows[0], rawKey: `trx_${rawKey}` };
  }

  async validate(rawKey: string): Promise<{ teamId: string; scopes: string[]; keyId: string } | null> {
    if (!rawKey.startsWith("trx_")) return null;

    const keyBody = rawKey.substring(4);
    const prefix = keyBody.substring(0, KEY_PREFIX_LENGTH);
    const keyHash = crypto.createHash("sha256").update(keyBody).digest("hex");

    const result = await db.query(
      `SELECT id, team_id, scopes, expires_at, revoked_at
       FROM api_keys WHERE prefix = $1 AND key_hash = $2`,
      [prefix, keyHash]
    );

    if (result.rows.length === 0) return null;

    const key = result.rows[0];
    if (key.revoked_at) return null;
    if (key.expires_at && new Date(key.expires_at) < new Date()) return null;

    db.query("UPDATE api_keys SET last_used_at = NOW() WHERE id = $1", [key.id]).catch(() => {});

    const scopes = typeof key.scopes === "string" ? JSON.parse(key.scopes) : key.scopes;
    return { teamId: key.team_id, scopes, keyId: key.id };
  }

  async list(teamId: string): Promise<Omit<ApiKey, "key_hash">[]> {
    const result = await db.query(
      `SELECT id, name, prefix, scopes, team_id, created_by, last_used_at, expires_at, revoked_at, created_at
       FROM api_keys WHERE team_id = $1 ORDER BY created_at DESC`,
      [teamId]
    );
    return result.rows;
  }

  async revoke(keyId: string, teamId: string): Promise<void> {
    const result = await db.query(
      "UPDATE api_keys SET revoked_at = NOW() WHERE id = $1 AND team_id = $2 AND revoked_at IS NULL RETURNING prefix",
      [keyId, teamId]
    );
    if (result.rows.length === 0) throw new NotFoundError("API key not found or already revoked");
    logger.info("API key revoked", { keyId, prefix: result.rows[0].prefix });
  }
}
