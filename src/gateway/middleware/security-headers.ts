import { Request, Response, NextFunction } from "express";

/**
 * Sets security-related HTTP headers on all responses.
 * Implements OWASP recommended headers without requiring helmet dependency.
 */
export function securityHeaders(_req: Request, res: Response, next: NextFunction) {
  // Prevent MIME type sniffing
  res.setHeader("X-Content-Type-Options", "nosniff");

  // Prevent clickjacking
  res.setHeader("X-Frame-Options", "DENY");

  // XSS protection (legacy browsers)
  res.setHeader("X-XSS-Protection", "0");

  // Control referrer information
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");

  // Strict Transport Security (1 year, include subdomains)
  res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");

  // Content Security Policy for API responses
  res.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");

  // Prevent caching of authenticated responses
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.setHeader("Pragma", "no-cache");

  // Remove server identification
  res.removeHeader("X-Powered-By");

  next();
}
