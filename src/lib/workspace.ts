import "server-only";
import { id, one, query, transaction } from "./db";
import { appUrl } from "./appurl";
import { audit } from "./audit";
import { emailShell, sendSystemEmail } from "./integrations/email";
import { hashToken, randomToken } from "./auth/tokens";
import { EMAIL_RE, normaliseEmail } from "./auth/accounts";
import { isFinal } from "./rbac";
import { SUNWAY_SOP } from "./sop-default";
import { ROLE_LABEL, type Role, type User } from "./types";

export const ROLES: Role[] = ["president", "vp", "director", "committee", "faculty_advisor"];
const INVITE_DAYS = 14;

export type Workspace = { society_id: string; name: string; university: string; role: Role; department: string | null };

export function listWorkspaces(userId: string) {
  return query<Workspace>(
    `SELECT m.society_id, s.name, u.short_name AS university, m.role, m.department
     FROM memberships m JOIN societies s ON s.id = m.society_id JOIN universities u ON u.id = s.university_id
     WHERE m.user_id = $1 ORDER BY s.name`,
    [userId],
  );
}

/** Make a membership the active workspace (users.society_id/role/department mirror it). */
export async function switchWorkspace(userId: string, societyId: string) {
  // One statement: the switch only happens if the membership exists right now.
  const r = await one(
    `UPDATE users u SET society_id = m.society_id, role = m.role, department = m.department
     FROM memberships m WHERE u.id = $1 AND m.user_id = u.id AND m.society_id = $2 RETURNING u.id`,
    [userId, societyId],
  );
  if (!r) throw new Error("You are not a member of that society");
}

/** After a membership changes or goes away, keep the active workspace valid. */
async function resyncActive(userId: string) {
  const u = await one<{ society_id: string | null }>("SELECT society_id FROM users WHERE id = $1", [userId]);
  const current = u?.society_id ? await one("SELECT 1 FROM memberships WHERE user_id = $1 AND society_id = $2", [userId, u.society_id]) : null;
  if (current && u?.society_id) return switchWorkspace(userId, u.society_id);
  const next = await one<{ society_id: string }>("SELECT society_id FROM memberships WHERE user_id = $1 ORDER BY created_at LIMIT 1", [userId]);
  if (next) return switchWorkspace(userId, next.society_id);
  await query("UPDATE users SET society_id = NULL, role = 'committee', department = NULL WHERE id = $1", [userId]);
}

/**
 * A new society, with its creator as President. With `newUniversity` the
 * university is created too, starting from the template SOP (the President
 * uploads the real one afterwards).
 */
export async function createSociety(user: User, input: { name: string; universityId: string; newUniversity?: { name: string; short: string } }) {
  const name = input.name.trim();
  if (name.length < 2 || name.length > 120) throw new Error("Give your society a name (2 to 120 characters).");
  const sid = id("soc");
  await transaction(async () => {
    let uniId = input.universityId;
    if (input.newUniversity) {
      const uName = input.newUniversity.name.trim().slice(0, 160);
      const uShort = (input.newUniversity.short.trim() || uName).slice(0, 40);
      if (uName.length < 3) throw new Error("Enter your university's name.");
      const existing = await one<{ id: string }>("SELECT id FROM universities WHERE lower(name) = lower($1)", [uName]);
      uniId = existing?.id ?? `uni_${uShort.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 20) || "u"}_${id("x").slice(2, 8)}`;
      if (!existing) await query("INSERT INTO universities (id, name, short_name, sop, created_by_society) VALUES ($1, $2, $3, $4, $5)", [uniId, uName, uShort, JSON.stringify({ ...SUNWAY_SOP, version: "template" }), sid]);
    }
    const uni = await one<{ id: string }>("SELECT id FROM universities WHERE id = $1", [uniId]);
    if (!uni) throw new Error("Pick your university.");
    await query("INSERT INTO societies (id, university_id, name, created_by) VALUES ($1, $2, $3, $4)", [sid, uni.id, name, user.id]);
    await query("INSERT INTO memberships (society_id, user_id, role, department) VALUES ($1, $2, 'president', 'Executive')", [sid, user.id]);
    await switchWorkspace(user.id, sid);
  });
  await audit(user, "society.created", { name }, { societyId: sid });
  return sid;
}

function assertAdmin(actor: User) {
  if (!actor.society_id || !isFinal(actor)) throw new Error("Only the President or VP can manage members.");
}

export async function inviteMember(actor: User, input: { email: string; role: Role; department?: string | null }) {
  assertAdmin(actor);
  const email = normaliseEmail(input.email);
  if (!EMAIL_RE.test(email)) throw new Error("Enter a valid email address.");
  if (!ROLES.includes(input.role)) throw new Error("Pick a role.");
  if (input.role === "president" && actor.role !== "president") throw new Error("Only a President can invite a President.");
  const existing = await one(
    "SELECT 1 FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.society_id = $1 AND lower(u.email) = $2",
    [actor.society_id, email],
  );
  if (existing) throw new Error("That person is already a member.");
  const token = randomToken();
  await query("UPDATE invites SET revoked_at = now() WHERE society_id = $1 AND lower(email) = $2 AND accepted_at IS NULL AND revoked_at IS NULL", [actor.society_id, email]);
  await query(
    `INSERT INTO invites (id, society_id, email, role, department, token_hash, invited_by, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, now() + interval '${INVITE_DAYS} days')`,
    [id("inv"), actor.society_id, email, input.role, input.department?.trim() || null, hashToken(token), actor.id],
  );
  const society = await one<{ name: string }>("SELECT name FROM societies WHERE id = $1", [actor.society_id]);
  const link = `${appUrl()}/invite/${encodeURIComponent(token)}`;
  await sendSystemEmail(
    email,
    `${actor.name} invited you to ${society?.name ?? "their society"} on Movents`,
    emailShell(
      "You're invited",
      `<p>${esc(actor.name)} invited you to join <b>${esc(society?.name ?? "their society")}</b> on Movents as <b>${ROLE_LABEL[input.role]}</b>.</p>
<p style="margin:24px 0"><a href="${link}" style="background:#161514;color:#fff;padding:12px 20px;border-radius:999px;text-decoration:none;font-weight:600">Accept invite</a></p>
<p style="font-size:13px;color:#60646c">The invite expires in ${INVITE_DAYS} days.</p>`,
    ),
    link,
  );
  await audit(actor, "member.invited", { email, role: input.role });
}

export type InviteView = { id: string; society_id: string; society: string; email: string; role: Role; department: string | null; expired: boolean; used: boolean };

export function inviteByToken(token: string) {
  return one<InviteView>(
    `SELECT i.id, i.society_id, s.name AS society, i.email, i.role, i.department,
       (i.expires_at < now()) AS expired, (i.accepted_at IS NOT NULL OR i.revoked_at IS NOT NULL) AS used
     FROM invites i JOIN societies s ON s.id = i.society_id WHERE i.token_hash = $1`,
    [hashToken(token)],
  );
}

/** Join through an invite. The signed-in email must match the invited one. */
export async function acceptInvite(user: User, token: string) {
  const inv = await inviteByToken(token);
  if (!inv || inv.expired || inv.used) throw new Error("This invite is no longer valid. Ask for a new one.");
  if (normaliseEmail(inv.email) !== normaliseEmail(user.email)) throw new Error(`This invite was sent to ${inv.email}. Sign in with that email to accept it.`);
  await transaction(async () => {
    const claimed = await one("UPDATE invites SET accepted_at = now() WHERE id = $1 AND accepted_at IS NULL AND revoked_at IS NULL RETURNING id", [inv.id]);
    if (!claimed) throw new Error("This invite was already used.");
    await query(
      "INSERT INTO memberships (society_id, user_id, role, department) VALUES ($1, $2, $3, $4) ON CONFLICT (society_id, user_id) DO NOTHING",
      [inv.society_id, user.id, inv.role, inv.department],
    );
    await switchWorkspace(user.id, inv.society_id);
  });
  await audit(user, "member.joined", { role: inv.role }, { societyId: inv.society_id });
  return inv.society_id;
}

/** Invites waiting for this email address, shown on onboarding. */
export function pendingInvitesFor(email: string) {
  return query<{ id: string; society: string; role: Role }>(
    `SELECT i.id, s.name AS society, i.role FROM invites i JOIN societies s ON s.id = i.society_id
     WHERE lower(i.email) = $1 AND i.accepted_at IS NULL AND i.revoked_at IS NULL AND i.expires_at > now()`,
    [normaliseEmail(email)],
  );
}

/** Accept a pending invite by id for a signed-in user whose email matches. */
export async function acceptInviteById(user: User, inviteId: string) {
  const inv = await one<{ society_id: string; role: Role; department: string | null; email: string }>(
    "SELECT society_id, role, department, email FROM invites WHERE id = $1 AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > now()",
    [inviteId],
  );
  if (!inv || normaliseEmail(inv.email) !== normaliseEmail(user.email)) throw new Error("This invite is no longer valid.");
  await transaction(async () => {
    await query("UPDATE invites SET accepted_at = now() WHERE id = $1", [inviteId]);
    await query("INSERT INTO memberships (society_id, user_id, role, department) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING", [inv.society_id, user.id, inv.role, inv.department]);
    await switchWorkspace(user.id, inv.society_id);
  });
  await audit(user, "member.joined", { role: inv.role }, { societyId: inv.society_id });
}

export async function revokeInvite(actor: User, inviteId: string) {
  assertAdmin(actor);
  await query("UPDATE invites SET revoked_at = now() WHERE id = $1 AND society_id = $2", [inviteId, actor.society_id]);
}

export function listPeople(societyId: string) {
  return query<{ id: string; name: string; email: string; role: Role; department: string | null; joined: string }>(
    `SELECT u.id, u.name, u.email, m.role, m.department, m.created_at AS joined
     FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.society_id = $1
     ORDER BY CASE m.role WHEN 'president' THEN 0 WHEN 'vp' THEN 1 WHEN 'director' THEN 2 WHEN 'committee' THEN 3 ELSE 4 END, u.name`,
    [societyId],
  );
}

export function listOpenInvites(societyId: string) {
  return query<{ id: string; email: string; role: Role; department: string | null; expires_at: string }>(
    "SELECT id, email, role, department, expires_at FROM invites WHERE society_id = $1 AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > now() ORDER BY created_at DESC",
    [societyId],
  );
}

async function presidents(societyId: string) {
  const r = await one<{ n: number }>("SELECT count(*)::int AS n FROM memberships WHERE society_id = $1 AND role = 'president'", [societyId]);
  return r?.n ?? 0;
}

export async function changeMemberRole(actor: User, userId: string, role: Role, department: string | null) {
  assertAdmin(actor);
  if (!ROLES.includes(role)) throw new Error("Pick a role.");
  const sid = actor.society_id!;
  const m = await one<{ role: Role }>("SELECT role FROM memberships WHERE society_id = $1 AND user_id = $2", [sid, userId]);
  if (!m) throw new Error("Not a member");
  if (m.role === "president" && actor.role !== "president") throw new Error("Only a President can change a President's role.");
  if (m.role === "president" && role !== "president" && (await presidents(sid)) <= 1) throw new Error("A society needs at least one President.");
  if (role === "president" && actor.role !== "president") throw new Error("Only a President can appoint a President.");
  await query("UPDATE memberships SET role = $3, department = $4 WHERE society_id = $1 AND user_id = $2", [sid, userId, role, department?.trim() || null]);
  await resyncActive(userId);
  await audit(actor, "member.role_changed", { user_id: userId, role, department });
}

export async function removeFromSociety(actor: User, userId: string) {
  const sid = actor.society_id!;
  if (userId !== actor.id) assertAdmin(actor);
  const m = await one<{ role: Role }>("SELECT role FROM memberships WHERE society_id = $1 AND user_id = $2", [sid, userId]);
  if (!m) throw new Error("Not a member");
  if (m.role === "president" && userId !== actor.id && actor.role !== "president") throw new Error("Only a President can remove a President.");
  if (m.role === "president" && (await presidents(sid)) <= 1) throw new Error("Appoint another President before this person leaves.");
  await transaction(async () => {
    await query("DELETE FROM memberships WHERE society_id = $1 AND user_id = $2", [sid, userId]);
    await query("DELETE FROM event_members WHERE user_id = $1 AND event_id IN (SELECT id FROM events WHERE society_id = $2)", [userId, sid]);
    await resyncActive(userId);
  });
  await audit(actor, userId === actor.id ? "member.left" : "member.removed", { user_id: userId }, { societyId: sid });
}

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
