import "server-only";
import { query, one } from "./db";
import type { Role, User } from "./types";

/** Who oversees every event in their society without being added. */
const OVERSIGHT: Role[] = ["president", "vp", "faculty_advisor"];

export const seesAll = (u: Pick<User, "role">) => OVERSIGHT.includes(u.role);

export type Member = { user_id: string; name: string; role: Role; department: string | null; email: string; member_role: "lead" | "colead" | "member" };

/**
 * SQL filter for "events this user can open". `e` is the events alias;
 * `n` is the position of the user id parameter. Oversight roles see their
 * own society's events; everyone else sees events they were added to.
 */
export function visibleSql(_user: Pick<User, "role">, n: number) {
  return `(EXISTS (SELECT 1 FROM memberships ms WHERE ms.user_id = $${n} AND ms.society_id = e.society_id AND ms.role IN ('president','vp','faculty_advisor'))
    OR EXISTS (SELECT 1 FROM event_members m JOIN memberships ms2 ON ms2.user_id = m.user_id AND ms2.society_id = e.society_id WHERE m.event_id = e.id AND m.user_id = $${n}))`;
}

/** On the event's team, or overseeing its society, in the user's active workspace. */
export async function isMember(user: Pick<User, "id" | "role" | "society_id">, eventId: string) {
  if (!eventId || !user.society_id) return false;
  const r = await one(`SELECT 1 FROM events e WHERE e.id = $1 AND e.society_id = $2 AND ${visibleSql(user, 3)}`, [eventId, user.society_id, user.id]);
  return Boolean(r);
}

export async function assertMember(user: Pick<User, "id" | "role" | "society_id">, eventId: string | null | undefined) {
  if (!eventId || !(await isMember(user, eventId))) throw new Error("You are not on this event's team. Ask the event lead to add you.");
}

const EVENT_TABLES = new Set([
  "tasks", "speakers", "vendors", "budget_lines", "risks", "rsvps", "feedback", "promo_items", "reminders", "runsheet_items",
  "volunteers", "payments", "creatives", "sponsors", "meetings", "approval_requests", "emails", "calendar_events", "agent_runs",
]);

/** Look up the event a row belongs to, then check the user is on it. Missing rows fail closed. */
export async function assertMemberOf(user: Pick<User, "id" | "role" | "society_id">, table: string, rowId: string) {
  if (!EVENT_TABLES.has(table)) throw new Error(`Unknown table ${table}`);
  const r = await one<{ event_id: string | null }>(`SELECT event_id FROM ${table} WHERE id = $1`, [rowId]);
  if (!r?.event_id) throw new Error("Not found");
  await assertMember(user, r.event_id);
  return r.event_id;
}

export function listMembers(eventId: string) {
  return query<Member>(
    `SELECT u.id AS user_id, u.name, u.role, u.department, u.email, m.role AS member_role
     FROM event_members m JOIN users u ON u.id = m.user_id WHERE m.event_id = $1
     ORDER BY (m.role = 'lead') DESC, m.added_at`,
    [eventId],
  );
}

/** Add people to an event's team. Only members of the event's society are added. */
export async function addMembers(eventId: string, userIds: string[], addedBy: string | null, role: "lead" | "member" = "member") {
  if (!userIds.length) return;
  await query(
    `INSERT INTO event_members (event_id, user_id, role, added_by)
     SELECT e.id, m.user_id, $3, $4 FROM events e JOIN memberships m ON m.society_id = e.society_id
     WHERE e.id = $1 AND m.user_id = ANY($2::text[])
     ON CONFLICT (event_id, user_id) DO NOTHING`,
    [eventId, userIds, role, addedBy],
  );
}

export async function removeMember(eventId: string, userId: string) {
  await query("DELETE FROM event_members WHERE event_id = $1 AND user_id = $2 AND role <> 'lead'", [eventId, userId]);
}

/** Match "Jason", "Priya Nair" or an email to people in the society. */
export async function resolvePeople(societyId: string, names: string[]) {
  const people = await query<{ id: string; name: string; email: string }>(
    "SELECT u.id, u.name, u.email FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.society_id = $1",
    [societyId],
  );
  const found: string[] = [];
  const unknown: string[] = [];
  for (const raw of names) {
    const n = raw.trim().toLowerCase();
    if (!n) continue;
    const hit =
      people.find((p) => p.email.toLowerCase() === n || p.name.toLowerCase() === n) ??
      people.find((p) => p.name.toLowerCase().split(/\s+/).includes(n)) ??
      people.find((p) => p.name.toLowerCase().startsWith(n));
    if (hit) found.push(hit.id);
    else unknown.push(raw.trim());
  }
  return { ids: [...new Set(found)], unknown };
}
