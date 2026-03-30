import crypto from "crypto";
import { db } from "../../shared/database";
import { NotFoundError, ConflictError, ValidationError, ForbiddenError } from "../../shared/errors";
import { logger } from "../../shared/logger";
import type { TeamInvite, TeamRole } from "../team/types";

const INVITE_EXPIRY_HOURS = 72;

export class InviteService {
  async createInvite(teamId: string, email: string, role: TeamRole, invitedBy: string): Promise<TeamInvite> {
    // Check for existing pending invite
    const existing = await db.query(
      "SELECT id FROM team_invites WHERE team_id = $1 AND email = $2 AND accepted_at IS NULL AND expires_at > NOW()",
      [teamId, email]
    );
    if (existing.rows.length > 0) throw new ConflictError(`Pending invite already exists for ${email}`);

    // Check if user is already a member
    const userResult = await db.query("SELECT id FROM users WHERE email = $1", [email]);
    if (userResult.rows.length > 0) {
      const memberCheck = await db.query(
        "SELECT id FROM team_members WHERE team_id = $1 AND user_id = $2",
        [teamId, userResult.rows[0].id]
      );
      if (memberCheck.rows.length > 0) throw new ConflictError(`${email} is already a team member`);
    }

    // Check allowed email domains
    const teamResult = await db.query("SELECT settings FROM teams WHERE id = $1", [teamId]);
    const settings = typeof teamResult.rows[0]?.settings === "string"
      ? JSON.parse(teamResult.rows[0].settings)
      : teamResult.rows[0]?.settings;

    if (settings?.allowed_email_domains?.length > 0) {
      const domain = email.split("@")[1];
      if (!settings.allowed_email_domains.includes(domain)) {
        throw new ValidationError(`Email domain "${domain}" is not allowed for this team`);
      }
    }

    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + INVITE_EXPIRY_HOURS * 3600000);

    const result = await db.query(
      `INSERT INTO team_invites (team_id, email, role, token, invited_by, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [teamId, email, role, token, invitedBy, expiresAt]
    );

    logger.info("Team invite created", { teamId, email, role, invitedBy });
    return result.rows[0];
  }

  async acceptInvite(token: string, userId: string): Promise<{ teamId: string; role: TeamRole }> {
    const invite = await db.query(
      "SELECT * FROM team_invites WHERE token = $1 AND accepted_at IS NULL",
      [token]
    );
    if (invite.rows.length === 0) throw new NotFoundError("Invalid or already used invite");

    const inv = invite.rows[0];

    if (new Date(inv.expires_at) < new Date()) {
      throw new ValidationError("Invite has expired");
    }

    // Verify the accepting user's email matches the invite
    const user = await db.query("SELECT email FROM users WHERE id = $1", [userId]);
    if (user.rows[0]?.email !== inv.email) {
      throw new ForbiddenError("This invite was sent to a different email address");
    }

    // Add to team
    await db.query(
      "INSERT INTO team_members (team_id, user_id, role, invited_by) VALUES ($1, $2, $3, $4)",
      [inv.team_id, userId, inv.role, inv.invited_by]
    );

    // Mark invite as accepted
    await db.query("UPDATE team_invites SET accepted_at = NOW() WHERE id = $1", [inv.id]);

    logger.info("Team invite accepted", { teamId: inv.team_id, userId, role: inv.role });
    return { teamId: inv.team_id, role: inv.role };
  }

  async revokeInvite(teamId: string, inviteId: string, actorId: string): Promise<void> {
    const result = await db.query(
      "DELETE FROM team_invites WHERE id = $1 AND team_id = $2 AND accepted_at IS NULL RETURNING email",
      [inviteId, teamId]
    );
    if (result.rows.length === 0) throw new NotFoundError("Invite not found or already accepted");

    logger.info("Team invite revoked", { teamId, inviteId, revokedBy: actorId, email: result.rows[0].email });
  }

  async listPendingInvites(teamId: string): Promise<TeamInvite[]> {
    const result = await db.query(
      `SELECT ti.*, u.name as invited_by_name
       FROM team_invites ti
       LEFT JOIN users u ON ti.invited_by = u.id
       WHERE ti.team_id = $1 AND ti.accepted_at IS NULL AND ti.expires_at > NOW()
       ORDER BY ti.created_at DESC`,
      [teamId]
    );
    return result.rows;
  }

  async resendInvite(teamId: string, inviteId: string): Promise<TeamInvite> {
    const newToken = crypto.randomBytes(32).toString("hex");
    const newExpiry = new Date(Date.now() + INVITE_EXPIRY_HOURS * 3600000);

    const result = await db.query(
      `UPDATE team_invites SET token = $1, expires_at = $2
       WHERE id = $3 AND team_id = $4 AND accepted_at IS NULL
       RETURNING *`,
      [newToken, newExpiry, inviteId, teamId]
    );

    if (result.rows.length === 0) throw new NotFoundError("Invite not found or already accepted");

    logger.info("Team invite resent", { teamId, inviteId, email: result.rows[0].email });
    return result.rows[0];
  }

  async cleanupExpiredInvites(): Promise<number> {
    const result = await db.query(
      "DELETE FROM team_invites WHERE expires_at < NOW() AND accepted_at IS NULL"
    );
    const count = result.rowCount || 0;
    if (count > 0) logger.info(`Cleaned up ${count} expired invites`);
    return count;
  }
}
