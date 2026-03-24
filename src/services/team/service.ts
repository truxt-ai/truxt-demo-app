import { db } from "../../shared/database";
import { NotFoundError, ForbiddenError, ConflictError, ValidationError } from "../../shared/errors";
import { logger } from "../../shared/logger";
import type { Team, TeamMember, TeamRole, TeamSettings, TeamActivity } from "./types";

const DEFAULT_SETTINGS: TeamSettings = {
  default_role: "member",
  require_2fa: false,
  allowed_email_domains: [],
  auto_join_domains: [],
  ip_allowlist: [],
  sso_enabled: false,
  notification_defaults: {
    pr_reviews: true,
    deployments: true,
    incidents: true,
    weekly_digest: true,
  },
};

export class TeamService {
  // --- Team CRUD ---

  async createTeam(data: { name: string; description?: string; plan?: string }, creatorId: string): Promise<Team> {
    const slug = this.slugify(data.name);

    const existing = await db.query("SELECT id FROM teams WHERE slug = $1", [slug]);
    if (existing.rows.length > 0) throw new ConflictError(`Team with slug "${slug}" already exists`);

    const maxMembers = data.plan === "enterprise" ? 500 : data.plan === "pro" ? 50 : 5;

    const result = await db.query(
      `INSERT INTO teams (name, slug, description, plan, max_members, settings, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [data.name, slug, data.description || "", data.plan || "free", maxMembers, JSON.stringify(DEFAULT_SETTINGS), creatorId]
    );

    const team = result.rows[0];

    // Add creator as owner
    await db.query(
      "INSERT INTO team_members (team_id, user_id, role) VALUES ($1, $2, 'owner')",
      [team.id, creatorId]
    );

    await this.logActivity(team.id, creatorId, "team.created", "team", team.id, { name: data.name, plan: data.plan });
    logger.info("Team created", { teamId: team.id, name: data.name, creator: creatorId });

    return team;
  }

  async getTeam(teamId: string): Promise<Team> {
    const result = await db.query("SELECT * FROM teams WHERE id = $1", [teamId]);
    if (result.rows.length === 0) throw new NotFoundError(`Team ${teamId} not found`);
    return result.rows[0];
  }

  async getTeamBySlug(slug: string): Promise<Team> {
    const result = await db.query("SELECT * FROM teams WHERE slug = $1", [slug]);
    if (result.rows.length === 0) throw new NotFoundError(`Team "${slug}" not found`);
    return result.rows[0];
  }

  async updateTeam(teamId: string, actorId: string, data: Partial<Pick<Team, "name" | "description" | "avatar_url">>): Promise<Team> {
    await this.requireRole(teamId, actorId, ["owner", "admin"]);

    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (data.name !== undefined) {
      fields.push(`name = $${idx}`, `slug = $${idx + 1}`);
      values.push(data.name, this.slugify(data.name));
      idx += 2;
    }
    if (data.description !== undefined) { fields.push(`description = $${idx++}`); values.push(data.description); }
    if (data.avatar_url !== undefined) { fields.push(`avatar_url = $${idx++}`); values.push(data.avatar_url); }

    if (fields.length === 0) throw new ValidationError("No fields to update");

    values.push(teamId);
    const result = await db.query(
      `UPDATE teams SET ${fields.join(", ")}, updated_at = NOW() WHERE id = $${idx} RETURNING *`,
      values
    );

    await this.logActivity(teamId, actorId, "team.updated", "team", teamId, data);
    return result.rows[0];
  }

  async deleteTeam(teamId: string, actorId: string): Promise<void> {
    await this.requireRole(teamId, actorId, ["owner"]);

    const memberCount = await db.query("SELECT COUNT(*) FROM team_members WHERE team_id = $1", [teamId]);
    if (parseInt(memberCount.rows[0].count) > 1) {
      throw new ValidationError("Cannot delete team with other members. Remove all members first.");
    }

    await db.query("DELETE FROM teams WHERE id = $1", [teamId]);
    logger.info("Team deleted", { teamId, deletedBy: actorId });
  }

  async listTeamsForUser(userId: string): Promise<(Team & { role: TeamRole })[]> {
    const result = await db.query(
      `SELECT t.*, tm.role FROM teams t
       INNER JOIN team_members tm ON t.id = tm.team_id
       WHERE tm.user_id = $1
       ORDER BY t.name`,
      [userId]
    );
    return result.rows;
  }

  async updateSettings(teamId: string, actorId: string, settings: Partial<TeamSettings>): Promise<TeamSettings> {
    await this.requireRole(teamId, actorId, ["owner", "admin"]);

    const team = await this.getTeam(teamId);
    const current = typeof team.settings === "string" ? JSON.parse(team.settings) : team.settings;
    const merged = { ...current, ...settings };

    // Validate SSO config
    if (settings.sso_enabled && !settings.sso_provider && !current.sso_provider) {
      throw new ValidationError("SSO provider must be specified when enabling SSO");
    }

    await db.query("UPDATE teams SET settings = $1, updated_at = NOW() WHERE id = $2", [JSON.stringify(merged), teamId]);
    await this.logActivity(teamId, actorId, "team.settings_updated", "team", teamId, { changed: Object.keys(settings) });

    return merged;
  }

  // --- Member management ---

  async addMember(teamId: string, userId: string, role: TeamRole, invitedBy: string): Promise<TeamMember> {
    await this.requireRole(teamId, invitedBy, ["owner", "admin"]);

    const team = await this.getTeam(teamId);
    const memberCount = await db.query("SELECT COUNT(*) FROM team_members WHERE team_id = $1", [teamId]);
    if (parseInt(memberCount.rows[0].count) >= team.max_members) {
      throw new ValidationError(`Team has reached maximum member limit (${team.max_members}). Upgrade your plan.`);
    }

    const existing = await db.query(
      "SELECT id FROM team_members WHERE team_id = $1 AND user_id = $2",
      [teamId, userId]
    );
    if (existing.rows.length > 0) throw new ConflictError("User is already a team member");

    if (role === "owner") throw new ForbiddenError("Cannot add a member as owner. Use transfer ownership.");

    const result = await db.query(
      `INSERT INTO team_members (team_id, user_id, role, invited_by) VALUES ($1, $2, $3, $4) RETURNING *`,
      [teamId, userId, role, invitedBy]
    );

    await this.logActivity(teamId, invitedBy, "member.added", "user", userId, { role });
    logger.info("Team member added", { teamId, userId, role, invitedBy });

    return result.rows[0];
  }

  async removeMember(teamId: string, userId: string, actorId: string): Promise<void> {
    const memberToRemove = await this.getMembership(teamId, userId);
    if (!memberToRemove) throw new NotFoundError("User is not a member of this team");

    if (memberToRemove.role === "owner") {
      throw new ForbiddenError("Cannot remove the team owner. Transfer ownership first.");
    }

    // Members can remove themselves, admins/owners can remove anyone
    if (userId !== actorId) {
      await this.requireRole(teamId, actorId, ["owner", "admin"]);
    }

    await db.query("DELETE FROM team_members WHERE team_id = $1 AND user_id = $2", [teamId, userId]);
    await this.logActivity(teamId, actorId, userId === actorId ? "member.left" : "member.removed", "user", userId, {});
    logger.info("Team member removed", { teamId, userId, removedBy: actorId });
  }

  async updateMemberRole(teamId: string, userId: string, newRole: TeamRole, actorId: string): Promise<TeamMember> {
    await this.requireRole(teamId, actorId, ["owner"]);

    if (newRole === "owner") throw new ForbiddenError("Use transfer ownership endpoint");

    const member = await this.getMembership(teamId, userId);
    if (!member) throw new NotFoundError("User is not a team member");
    if (member.role === "owner") throw new ForbiddenError("Cannot change owner's role");

    const result = await db.query(
      "UPDATE team_members SET role = $1 WHERE team_id = $2 AND user_id = $3 RETURNING *",
      [newRole, teamId, userId]
    );

    await this.logActivity(teamId, actorId, "member.role_changed", "user", userId, { from: member.role, to: newRole });
    return result.rows[0];
  }

  async listMembers(teamId: string, opts?: { role?: TeamRole; page?: number; pageSize?: number }): Promise<{ members: TeamMember[]; total: number }> {
    const conditions = ["tm.team_id = $1"];
    const params: any[] = [teamId];
    let idx = 2;

    if (opts?.role) {
      conditions.push(`tm.role = $${idx++}`);
      params.push(opts.role);
    }

    const page = opts?.page || 1;
    const pageSize = opts?.pageSize || 50;
    const offset = (page - 1) * pageSize;

    const [dataResult, countResult] = await Promise.all([
      db.query(
        `SELECT tm.*, u.name as user_name, u.email as user_email
         FROM team_members tm
         INNER JOIN users u ON tm.user_id = u.id
         WHERE ${conditions.join(" AND ")}
         ORDER BY CASE tm.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 WHEN 'member' THEN 2 ELSE 3 END, u.name
         LIMIT $${idx} OFFSET $${idx + 1}`,
        [...params, pageSize, offset]
      ),
      db.query(`SELECT COUNT(*) FROM team_members tm WHERE ${conditions.join(" AND ")}`, params),
    ]);

    const members = dataResult.rows.map((row: any) => ({
      ...row,
      user: { name: row.user_name, email: row.user_email },
    }));

    return { members, total: parseInt(countResult.rows[0].count) };
  }

  async transferOwnership(teamId: string, currentOwnerId: string, newOwnerId: string): Promise<void> {
    await this.requireRole(teamId, currentOwnerId, ["owner"]);

    const newOwner = await this.getMembership(teamId, newOwnerId);
    if (!newOwner) throw new NotFoundError("New owner must be an existing team member");

    await db.query("UPDATE team_members SET role = 'admin' WHERE team_id = $1 AND user_id = $2", [teamId, currentOwnerId]);
    await db.query("UPDATE team_members SET role = 'owner' WHERE team_id = $1 AND user_id = $2", [teamId, newOwnerId]);

    await this.logActivity(teamId, currentOwnerId, "team.ownership_transferred", "user", newOwnerId, {
      from: currentOwnerId,
      to: newOwnerId,
    });
    logger.info("Team ownership transferred", { teamId, from: currentOwnerId, to: newOwnerId });
  }

  // --- Activity log ---

  async getActivity(teamId: string, opts?: { page?: number; pageSize?: number; action?: string }): Promise<TeamActivity[]> {
    const conditions = ["team_id = $1"];
    const params: any[] = [teamId];
    let idx = 2;

    if (opts?.action) {
      conditions.push(`action LIKE $${idx++}`);
      params.push(`${opts.action}%`);
    }

    const page = opts?.page || 1;
    const pageSize = opts?.pageSize || 50;
    params.push(pageSize, (page - 1) * pageSize);

    const result = await db.query(
      `SELECT * FROM team_activity WHERE ${conditions.join(" AND ")} ORDER BY created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`,
      params
    );
    return result.rows;
  }

  // --- Helpers ---

  private async getMembership(teamId: string, userId: string): Promise<TeamMember | null> {
    const result = await db.query(
      "SELECT * FROM team_members WHERE team_id = $1 AND user_id = $2",
      [teamId, userId]
    );
    return result.rows[0] || null;
  }

  private async requireRole(teamId: string, userId: string, roles: TeamRole[]): Promise<void> {
    const membership = await this.getMembership(teamId, userId);
    if (!membership) throw new ForbiddenError("You are not a member of this team");
    if (!roles.includes(membership.role)) {
      throw new ForbiddenError(`Requires one of: ${roles.join(", ")}`);
    }
  }

  private async logActivity(teamId: string, actorId: string, action: string, targetType: string, targetId?: string, metadata?: Record<string, any>): Promise<void> {
    await db.query(
      "INSERT INTO team_activity (team_id, actor_id, action, target_type, target_id, metadata) VALUES ($1, $2, $3, $4, $5, $6)",
      [teamId, actorId, action, targetType, targetId, JSON.stringify(metadata || {})]
    ).catch((err: any) => logger.error("Failed to log team activity", { error: err.message }));
  }

  private slugify(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  }
}
