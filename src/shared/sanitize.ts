/**
 * Input sanitization utilities.
 * Applied at the boundary layer before data reaches service logic.
 */

/**
 * Strips HTML tags from a string to prevent stored XSS.
 * Preserves the text content between tags.
 */
export function stripHtml(input: string): string {
  return input.replace(/<[^>]*>/g, "");
}

/**
 * Sanitizes an object by stripping HTML from all string values (recursive).
 * Useful for sanitizing entire request bodies.
 */
export function sanitizeObject<T extends Record<string, any>>(obj: T): T {
  const result: any = {};

  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === "string") {
      result[key] = stripHtml(value);
    } else if (Array.isArray(value)) {
      result[key] = value.map((item) =>
        typeof item === "string" ? stripHtml(item) : typeof item === "object" && item !== null ? sanitizeObject(item) : item
      );
    } else if (typeof value === "object" && value !== null && !(value instanceof Date)) {
      result[key] = sanitizeObject(value);
    } else {
      result[key] = value;
    }
  }

  return result as T;
}

/**
 * Validates and sanitizes a string for use in log entries.
 * Prevents log injection by removing control characters and newlines.
 */
export function sanitizeForLog(input: string, maxLength: number = 500): string {
  return input
    .replace(/[\x00-\x1f\x7f]/g, "") // Remove control characters
    .replace(/\r?\n/g, " ")            // Replace newlines with spaces
    .substring(0, maxLength);
}

/**
 * Validates that a string is a safe identifier (alphanumeric + hyphens + underscores).
 * Useful for preventing injection in dynamic query building.
 */
export function isSafeIdentifier(input: string): boolean {
  return /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(input);
}

/**
 * Normalizes email addresses for consistent storage and lookup.
 */
export function normalizeEmail(email: string): string {
  const [localPart, domain] = email.trim().split("@");
  if (!localPart || !domain) return email.trim().toLowerCase();

  // Lowercase the domain (RFC 5321)
  // Keep local part case (RFC 5321 says it's case-sensitive, but lowercase is common)
  return `${localPart.toLowerCase()}@${domain.toLowerCase()}`;
}

/**
 * Truncates a string to a maximum length with an ellipsis indicator.
 */
export function truncate(input: string, maxLength: number): string {
  if (input.length <= maxLength) return input;
  return input.substring(0, maxLength - 3) + "...";
}
