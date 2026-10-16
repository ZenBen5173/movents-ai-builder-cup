import "server-only";
import { id, insert, one } from "./db";
import type { Role, User } from "./types";

export async function audit(
  actor: Pick<User, "id" | "name"> | { id: null; name: string },
  action: string,
  details: Record<string, unknown> = {},
  opts: { eventId?: string | null; approvedBy?: string | null; societyId?: string | null } = {},
) {
  // The entry belongs to the event's society, else the actor's.
  return one(
    `INSERT INTO audit_logs (id, event_id, user_id, actor, action, details, approved_by, society_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7,
       coalesce((SELECT society_id FROM events WHERE id = $2), $8, (SELECT society_id FROM users WHERE id = $3)))
     RETURNING *`,
    [id("aud"), opts.eventId ?? null, actor.id, actor.name, action, JSON.stringify(details), opts.approvedBy ?? null, opts.societyId ?? null],
  );
}

export async function notify(
  /** A person, or everyone with `role` in `societyId`. */
  target: { userId: string } | { role: Role; societyId: string },
  title: string,
  body: string,
  link?: string,
) {
  return insert("notifications", {
    id: id("ntf"),
    user_id: "userId" in target ? target.userId : null,
    role: "role" in target ? target.role : null,
    society_id: "societyId" in target ? target.societyId : null,
    title,
    body,
    link: link ?? null,
  });
}
