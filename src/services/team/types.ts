export type TeamRole = "owner" | "admin" | "member" | "guest";

export interface Team {
  id: string;
  name: string;
  slug: string;
  description: string;
  avatar_url?: string;
  plan: "free" | "pro" | "enterprise";
  max_members: number;
  settings: TeamSettings;
  created_by: string;
  created_at: Date;
  updated_at: Date;
}

export interface TeamSettings {
  default_role: TeamRole;
  require_2fa: boolean;
  allowed_email_domains: string[];
  auto_join_domains: string[];
  ip_allowlist: string[];
  sso_enabled: boolean;
  sso_provider?: string;
  sso_config?: Record<string, string>;
  notification_defaults: {
    pr_reviews: boolean;
    deployments: boolean;
    incidents: boolean;
    weekly_digest: boolean;
  };
}

export interface TeamMember {
  id: string;
  team_id: string;
  user_id: string;
  role: TeamRole;
  joined_at: Date;
  invited_by?: string;
  user?: {
    name: string;
    email: string;
    avatar_url?: string;
    last_active_at?: Date;
  };
}

export interface TeamInvite {
  id: string;
  team_id: string;
  email: string;
  role: TeamRole;
  token: string;
  invited_by: string;
  expires_at: Date;
  accepted_at?: Date;
  created_at: Date;
}

export interface TeamActivity {
  id: number;
  team_id: string;
  actor_id: string;
  action: string;
  target_type: string;
  target_id?: string;
  metadata: Record<string, any>;
  created_at: Date;
}
