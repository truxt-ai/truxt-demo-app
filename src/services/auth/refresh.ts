import crypto from "crypto";
import jwt from "jsonwebtoken";
import { db } from "../../shared/database";
import { redis } from "../../shared/cache";
import { UnauthorizedError, ValidationError } from "../../shared/errors";
import { logger } from "../../shared/logger";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";
const ACCESS_TOKEN_EXPIRY = "15m";
const REFRESH_TOKEN_EXPIRY_DAYS = 30;
const REFRESH_TOKEN_EXPIRY_SECONDS = REFRESH_TOKEN_EXPIRY_DAYS * 86400;

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;        // seconds
  tokenType: "Bearer";
}

export class TokenRefreshService {
  async issueTokenPair(userId: string, email: string, role: string): Promise<TokenPair> {
    const accessToken = jwt.sign(
      { id: userId, email, role },
      JWT_SECRET,
      { expiresIn: ACCESS_TOKEN_EXPIRY, algorithm: "HS256", issuer: "truxt-demo-app" }
    );

    const refreshToken = crypto.randomBytes(40).toString("hex");
    const hashedRefreshToken = this.hashToken(refreshToken);
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_SECONDS * 1000);

    await db.query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id) DO UPDATE SET token_hash = $2, expires_at = $3, created_at = NOW()`,
      [userId, hashedRefreshToken, expiresAt]
    );

    // Cache the refresh token for fast validation
    await redis.set(
      `refresh:${hashedRefreshToken}`,
      JSON.stringify({ userId, email, role }),
      { EX: REFRESH_TOKEN_EXPIRY_SECONDS }
    );

    logger.info("Token pair issued", { userId });

    return {
      accessToken,
      refreshToken,
      expiresIn: 900, // 15 minutes in seconds
      tokenType: "Bearer",
    };
  }

  async refresh(refreshToken: string): Promise<TokenPair> {
    if (!refreshToken) throw new ValidationError("Refresh token required");

    const hashedToken = this.hashToken(refreshToken);

    // Fast path: check Redis cache
    const cached = await redis.get(`refresh:${hashedToken}`);
    if (!cached) {
      // Slow path: check database (handles Redis cache miss)
      const dbResult = await db.query(
        `SELECT rt.user_id, rt.expires_at, u.email, u.role
         FROM refresh_tokens rt
         INNER JOIN users u ON rt.user_id = u.id
         WHERE rt.token_hash = $1`,
        [hashedToken]
      );

      if (dbResult.rows.length === 0) throw new UnauthorizedError("Invalid refresh token");

      const row = dbResult.rows[0];
      if (new Date(row.expires_at) < new Date()) {
        await this.revokeRefreshToken(row.user_id);
        throw new UnauthorizedError("Refresh token expired. Please log in again.");
      }

      return this.issueTokenPair(row.user_id, row.email, row.role);
    }

    const { userId, email, role } = JSON.parse(cached);

    // Rotate: revoke old, issue new
    await redis.del(`refresh:${hashedToken}`);
    return this.issueTokenPair(userId, email, role);
  }

  async revokeRefreshToken(userId: string): Promise<void> {
    const existing = await db.query(
      "SELECT token_hash FROM refresh_tokens WHERE user_id = $1",
      [userId]
    );

    if (existing.rows.length > 0) {
      await redis.del(`refresh:${existing.rows[0].token_hash}`);
      await db.query("DELETE FROM refresh_tokens WHERE user_id = $1", [userId]);
    }

    logger.info("Refresh token revoked", { userId });
  }

  async revokeAllTokens(userId: string): Promise<void> {
    await this.revokeRefreshToken(userId);
    // Add user to JWT denylist until current access tokens expire (15m)
    await redis.set(`denylist:${userId}`, "1", { EX: 900 });
    logger.info("All tokens revoked for user", { userId });
  }

  private hashToken(token: string): string {
    return crypto.createHash("sha256").update(token).digest("hex");
  }
}
