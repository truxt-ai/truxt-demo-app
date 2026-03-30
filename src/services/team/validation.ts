import { z } from "zod";

export const createTeamSchema = z.object({
  name: z.string().min(2).max(50).regex(/^[a-zA-Z0-9\s\-_]+$/, "Name can only contain letters, numbers, spaces, hyphens, and underscores"),
  description: z.string().max(500).optional(),
  plan: z.enum(["free", "pro", "enterprise"]).optional(),
});

export const updateTeamSchema = z.object({
  name: z.string().min(2).max(50).regex(/^[a-zA-Z0-9\s\-_]+$/).optional(),
  description: z.string().max(500).optional(),
  avatar_url: z.string().url().optional(),
});

export const teamSettingsSchema = z.object({
  default_role: z.enum(["member", "guest"]).optional(),
  require_2fa: z.boolean().optional(),
  allowed_email_domains: z.array(z.string()).optional(),
  auto_join_domains: z.array(z.string()).optional(),
  ip_allowlist: z.array(z.string().ip()).optional(),
  sso_enabled: z.boolean().optional(),
  sso_provider: z.enum(["okta", "azure-ad", "google", "onelogin"]).optional(),
  notification_defaults: z.object({
    pr_reviews: z.boolean(),
    deployments: z.boolean(),
    incidents: z.boolean(),
    weekly_digest: z.boolean(),
  }).optional(),
});

export const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(["admin", "member", "guest"]).optional(),
});

export const updateRoleSchema = z.object({
  role: z.enum(["admin", "member", "guest"]),
});

export const transferOwnershipSchema = z.object({
  newOwnerId: z.string().uuid(),
});
