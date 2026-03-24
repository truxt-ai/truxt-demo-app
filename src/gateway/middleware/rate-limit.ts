import { Request, Response, NextFunction } from "express";
import { redis } from "../../shared/cache";

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

const DEFAULT_CONFIG: RateLimitConfig = {
  windowMs: 60000,
  maxRequests: 100,
};

export function rateLimiter(config: RateLimitConfig = DEFAULT_CONFIG) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const key = `rate:${(req as any).user?.id || req.ip}`;
    const current = await redis.incr(key);

    if (current === 1) {
      await redis.expire(key, Math.ceil(config.windowMs / 1000));
    }

    res.setHeader("X-RateLimit-Limit", config.maxRequests);
    res.setHeader("X-RateLimit-Remaining", Math.max(0, config.maxRequests - current));

    if (current > config.maxRequests) {
      return res.status(429).json({
        error: "Too many requests",
        retryAfter: Math.ceil(config.windowMs / 1000),
      });
    }

    next();
  };
}
