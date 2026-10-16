/**
 * An event is public (registration page, feedback form) once it is approved
 * or has been published to an event page. Drafts stay private to the team.
 */
export const PUBLISHED_SQL = "(e.status IN ('approved','live','completed') OR e.luma IS NOT NULL OR e.meetup IS NOT NULL)";

export function isPublished(ev: { status: string; luma?: unknown; meetup?: unknown }) {
  return ["approved", "live", "completed"].includes(ev.status) || ev.luma != null || ev.meetup != null;
}
