import { db } from "../../shared/database";
import { redis } from "../../shared/cache";
import { logger } from "../../shared/logger";

export interface SystemStats {
  database: {
    total_users: number;
    total_events: number;
    total_teams: number;
    db_size_mb: number;
    active_connections: number;
  };
  cache: {
    connected: boolean;
    memory_used_mb: number;
    keys_count: number;
    hit_rate?: number;
  };
  application: {
    uptime_seconds: number;
    node_version: string;
    memory_rss_mb: number;
    memory_heap_mb: number;
    cpu_usage_percent: number;
  };
  activity: {
    users_last_24h: number;
    users_last_7d: number;
    events_last_24h: number;
    events_last_7d: number;
    api_keys_active: number;
  };
}

const startTime = Date.now();
let lastCpuUsage = process.cpuUsage();
let lastCpuTime = Date.now();

export class SystemStatsService {
  async getStats(): Promise<SystemStats> {
    const [database, cache, activity] = await Promise.all([
      this.getDatabaseStats(),
      this.getCacheStats(),
      this.getActivityStats(),
    ]);

    return {
      database,
      cache,
      application: this.getApplicationStats(),
      activity,
    };
  }

  private async getDatabaseStats(): Promise<SystemStats["database"]> {
    const queries = await Promise.all([
      db.query("SELECT COUNT(*) FROM users"),
      db.query("SELECT COUNT(*) FROM analytics_events"),
      db.query("SELECT COUNT(*) FROM teams").catch(() => ({ rows: [{ count: 0 }] })),
      db.query("SELECT pg_database_size(current_database()) AS size"),
      db.query("SELECT COUNT(*) FROM pg_stat_activity WHERE state = 'active'"),
    ]);

    return {
      total_users: parseInt(queries[0].rows[0].count),
      total_events: parseInt(queries[1].rows[0].count),
      total_teams: parseInt(queries[2].rows[0].count),
      db_size_mb: Math.round(parseInt(queries[3].rows[0].size) / 1024 / 1024 * 100) / 100,
      active_connections: parseInt(queries[4].rows[0].count),
    };
  }

  private async getCacheStats(): Promise<SystemStats["cache"]> {
    try {
      const info = await redis.info("memory");
      const keyspace = await redis.info("keyspace");
      const stats = await redis.info("stats");

      const memoryMatch = info.match(/used_memory:(\d+)/);
      const keysMatch = keyspace.match(/keys=(\d+)/);
      const hitsMatch = stats.match(/keyspace_hits:(\d+)/);
      const missesMatch = stats.match(/keyspace_misses:(\d+)/);

      const hits = hitsMatch ? parseInt(hitsMatch[1]) : 0;
      const misses = missesMatch ? parseInt(missesMatch[1]) : 0;
      const hitRate = hits + misses > 0 ? Math.round((hits / (hits + misses)) * 10000) / 100 : undefined;

      return {
        connected: true,
        memory_used_mb: memoryMatch ? Math.round(parseInt(memoryMatch[1]) / 1024 / 1024 * 100) / 100 : 0,
        keys_count: keysMatch ? parseInt(keysMatch[1]) : 0,
        hit_rate: hitRate,
      };
    } catch (err: any) {
      logger.warn("Failed to get cache stats", { error: err.message });
      return { connected: false, memory_used_mb: 0, keys_count: 0 };
    }
  }

  private getApplicationStats(): SystemStats["application"] {
    const mem = process.memoryUsage();
    const currentCpuUsage = process.cpuUsage();
    const now = Date.now();

    const userDiff = currentCpuUsage.user - lastCpuUsage.user;
    const systemDiff = currentCpuUsage.system - lastCpuUsage.system;
    const timeDiff = (now - lastCpuTime) * 1000;
    const cpuPercent = timeDiff > 0 ? Math.round(((userDiff + systemDiff) / timeDiff) * 10000) / 100 : 0;

    lastCpuUsage = currentCpuUsage;
    lastCpuTime = now;

    return {
      uptime_seconds: Math.round((Date.now() - startTime) / 1000),
      node_version: process.version,
      memory_rss_mb: Math.round(mem.rss / 1024 / 1024 * 100) / 100,
      memory_heap_mb: Math.round(mem.heapUsed / 1024 / 1024 * 100) / 100,
      cpu_usage_percent: cpuPercent,
    };
  }

  private async getActivityStats(): Promise<SystemStats["activity"]> {
    const queries = await Promise.all([
      db.query("SELECT COUNT(DISTINCT user_id) FROM analytics_events WHERE timestamp > NOW() - INTERVAL '24 hours'").catch(() => ({ rows: [{ count: 0 }] })),
      db.query("SELECT COUNT(DISTINCT user_id) FROM analytics_events WHERE timestamp > NOW() - INTERVAL '7 days'").catch(() => ({ rows: [{ count: 0 }] })),
      db.query("SELECT COUNT(*) FROM analytics_events WHERE timestamp > NOW() - INTERVAL '24 hours'").catch(() => ({ rows: [{ count: 0 }] })),
      db.query("SELECT COUNT(*) FROM analytics_events WHERE timestamp > NOW() - INTERVAL '7 days'").catch(() => ({ rows: [{ count: 0 }] })),
      db.query("SELECT COUNT(*) FROM api_keys WHERE revoked_at IS NULL AND (expires_at IS NULL OR expires_at > NOW())").catch(() => ({ rows: [{ count: 0 }] })),
    ]);

    return {
      users_last_24h: parseInt(queries[0].rows[0].count),
      users_last_7d: parseInt(queries[1].rows[0].count),
      events_last_24h: parseInt(queries[2].rows[0].count),
      events_last_7d: parseInt(queries[3].rows[0].count),
      api_keys_active: parseInt(queries[4].rows[0].count),
    };
  }
}
