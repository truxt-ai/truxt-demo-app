import { Pool, PoolClient, PoolConfig } from "pg";
import { logger } from "./logger";

interface DatabaseConfig extends PoolConfig {
  healthCheckIntervalMs?: number;
  retryAttempts?: number;
  retryDelayMs?: number;
}

const DEFAULT_CONFIG: DatabaseConfig = {
  connectionString: process.env.DATABASE_URL || "postgresql://localhost:5432/truxt_demo",
  max: 20,
  min: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  healthCheckIntervalMs: 30000,
  retryAttempts: 3,
  retryDelayMs: 1000,
};

class Database {
  private pool: Pool;
  private config: DatabaseConfig;
  private healthCheckTimer: NodeJS.Timer | null = null;
  private isHealthy = true;

  constructor(config: DatabaseConfig = DEFAULT_CONFIG) {
    this.config = config;
    this.pool = new Pool(config);

    this.pool.on("error", (err) => {
      logger.error("Unexpected database pool error", { error: err.message });
      this.isHealthy = false;
    });

    this.pool.on("connect", () => {
      logger.debug("New database connection established");
    });

    this.pool.on("remove", () => {
      logger.debug("Database connection removed from pool");
    });

    this.startHealthCheck();
  }

  private startHealthCheck() {
    const interval = this.config.healthCheckIntervalMs || 30000;
    this.healthCheckTimer = setInterval(async () => {
      try {
        await this.pool.query("SELECT 1");
        if (!this.isHealthy) {
          logger.info("Database connection recovered");
          this.isHealthy = true;
        }
      } catch (err: any) {
        logger.error("Database health check failed", { error: err.message });
        this.isHealthy = false;
      }
    }, interval);
  }

  async query(text: string, params?: any[]): Promise<any> {
    const attempts = this.config.retryAttempts || 3;
    const delay = this.config.retryDelayMs || 1000;

    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        const start = Date.now();
        const result = await this.pool.query(text, params);
        const duration = Date.now() - start;

        if (duration > 1000) {
          logger.warn("Slow query detected", { duration, query: text.substring(0, 100) });
        }

        return result;
      } catch (err: any) {
        if (attempt === attempts) throw err;
        if (this.isRetryableError(err)) {
          logger.warn(`Query failed (attempt ${attempt}/${attempts}), retrying...`, {
            error: err.message,
          });
          await this.sleep(delay * attempt);
        } else {
          throw err;
        }
      }
    }
  }

  async getClient(): Promise<PoolClient> {
    return this.pool.connect();
  }

  async transaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await fn(client);
      await client.query("COMMIT");
      return result;
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  async healthCheck(): Promise<{ healthy: boolean; poolSize: number; waitingCount: number }> {
    try {
      await this.pool.query("SELECT 1");
      return {
        healthy: true,
        poolSize: this.pool.totalCount,
        waitingCount: this.pool.waitingCount,
      };
    } catch {
      return { healthy: false, poolSize: 0, waitingCount: 0 };
    }
  }

  private isRetryableError(err: any): boolean {
    const retryableCodes = ["ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "57P01", "57P03"];
    return retryableCodes.includes(err.code);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async shutdown(): Promise<void> {
    if (this.healthCheckTimer) clearInterval(this.healthCheckTimer as any);
    await this.pool.end();
    logger.info("Database pool shut down");
  }
}

export const db = new Database();
