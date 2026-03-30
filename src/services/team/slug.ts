/**
 * Slug generation and validation for team URLs.
 *
 * Rules:
 * - Lowercase alphanumeric and hyphens only
 * - Must start with a letter
 * - 3-60 characters
 * - Cannot be a reserved word (API routes, system names)
 */

const RESERVED_SLUGS = new Set([
  // API routes that would conflict
  "api", "admin", "auth", "login", "logout", "signup", "register",
  "health", "status", "metrics", "docs", "openapi", "webhooks",
  // System / brand names
  "truxt", "axiom", "openclaw", "system", "support", "billing",
  "pricing", "enterprise", "legal", "privacy", "terms", "security",
  "blog", "careers", "about", "contact", "help",
  // Common squatting targets
  "test", "demo", "example", "sample", "placeholder",
]);

const SLUG_PATTERN = /^[a-z][a-z0-9-]{2,59}$/;
const CONSECUTIVE_HYPHENS = /--/;
const TRAILING_HYPHEN = /-$/;

export interface SlugValidationResult {
  valid: boolean;
  slug: string;
  error?: string;
}

export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")   // Remove non-alphanumeric (keep spaces and hyphens)
    .replace(/\s+/g, "-")            // Spaces to hyphens
    .replace(/-+/g, "-")             // Collapse consecutive hyphens
    .replace(/^-|-$/g, "")           // Trim leading/trailing hyphens
    .substring(0, 60);               // Enforce max length
}

export function validateSlug(slug: string): SlugValidationResult {
  if (!slug) {
    return { valid: false, slug, error: "Slug cannot be empty" };
  }

  if (!SLUG_PATTERN.test(slug)) {
    return {
      valid: false,
      slug,
      error: "Slug must be 3-60 characters, start with a letter, and contain only lowercase letters, numbers, and hyphens",
    };
  }

  if (CONSECUTIVE_HYPHENS.test(slug)) {
    return { valid: false, slug, error: "Slug cannot contain consecutive hyphens" };
  }

  if (TRAILING_HYPHEN.test(slug)) {
    return { valid: false, slug, error: "Slug cannot end with a hyphen" };
  }

  if (RESERVED_SLUGS.has(slug)) {
    return { valid: false, slug, error: `"${slug}" is a reserved name and cannot be used as a team slug` };
  }

  return { valid: true, slug };
}

export function suggestAlternativeSlugs(name: string, takenSlugs: string[] = []): string[] {
  const base = generateSlug(name);
  const candidates: string[] = [];

  // Try base slug
  if (validateSlug(base).valid && !takenSlugs.includes(base)) {
    candidates.push(base);
  }

  // Try with suffixes
  for (const suffix of ["-team", "-hq", "-eng", "-dev"]) {
    const candidate = (base + suffix).substring(0, 60);
    if (validateSlug(candidate).valid && !takenSlugs.includes(candidate)) {
      candidates.push(candidate);
    }
  }

  // Try with numbers
  for (let i = 2; i <= 5 && candidates.length < 3; i++) {
    const candidate = `${base}-${i}`;
    if (validateSlug(candidate).valid && !takenSlugs.includes(candidate)) {
      candidates.push(candidate);
    }
  }

  return candidates.slice(0, 3);
}
