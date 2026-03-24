import { redis } from "./cache";
import { logger } from "./logger";

interface CacheOptions {
  ttl: number; // seconds
  prefix?: string;
  serialize?: (data: any) => string;
  deserialize?: (data: string) => any;
}

const DEFAULT_OPTIONS: CacheOptions = {
  ttl: 300,
  prefix: "cache",
  serialize: JSON.stringify,
  deserialize: JSON.parse,
};

export class CacheManager {
  private opts: CacheOptions;

  constructor(opts: Partial<CacheOptions> = {}) {
    this.opts = { ...DEFAULT_OPTIONS, ...opts };
  }

  private key(k: string): string {
    return `${this.opts.prefix}:${k}`;
  }

  async get<T>(key: string): Promise<T | null> {
    const cached = await redis.get(this.key(key));
    if (cached === null) return null;
    try {
      return this.opts.deserialize!(cached) as T;
    } catch {
      logger.warn("Cache deserialization failed", { key });
      await redis.del(this.key(key));
      return null;
    }
  }

  async set(key: string, data: any): Promise<void> {
    const serialized = this.opts.serialize!(data);
    await redis.set(this.key(key), serialized, { EX: this.opts.ttl });
  }

  async getOrFetch<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) return cached;

    const data = await fetcher();
    await this.set(key, data);
    return data;
  }

  async invalidate(key: string): Promise<void> {
    await redis.del(this.key(key));
  }

  async invalidatePattern(pattern: string): Promise<void> {
    const keys = await redis.keys(`${this.opts.prefix}:${pattern}`);
    if (keys.length > 0) {
      await redis.del(keys);
      logger.debug("Cache invalidated", { pattern, count: keys.length });
    }
  }
}
