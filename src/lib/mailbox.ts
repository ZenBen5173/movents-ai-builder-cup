import "server-only";
import { one, query } from "./db";

export type Mailbox = { event_id: string; address: string; label: string | null };

let ready: Promise<unknown> | null = null;
/** The table is also in SCHEMA_SQL; this covers a server that booted before it was added. */
function ensure() {
  ready ??= query(
    "CREATE TABLE IF NOT EXISTS event_mailboxes (event_id text PRIMARY KEY, address text NOT NULL, label text, created_at timestamptz NOT NULL DEFAULT now())",
  ).catch((e) => {
    ready = null;
    throw e;
  });
  return ready;
}

export async function getMailbox(eventId: string) {
  await ensure();
  return one<Mailbox>("SELECT event_id, address, label FROM event_mailboxes WHERE event_id = $1", [eventId]);
}

export async function setMailbox(eventId: string, address: string, label: string | null) {
  await ensure();
  await query(
    `INSERT INTO event_mailboxes (event_id, address, label) VALUES ($1, $2, $3)
     ON CONFLICT (event_id) DO UPDATE SET address = EXCLUDED.address, label = EXCLUDED.label`,
    [eventId, address, label],
  );
}

/** Group an email kind into the inbox filter buckets. */
export function mailGroup(kind: string): "speakers" | "suppliers" | "sponsors" | "faculty" | "attendees" | "other" {
  if (kind.startsWith("speaker")) return "speakers";
  if (kind.startsWith("vendor")) return "suppliers";
  if (kind.startsWith("sponsor")) return "sponsors";
  if (kind.startsWith("faculty")) return "faculty";
  if (kind.startsWith("attendee") || kind.startsWith("feedback") || kind === "pre_event" || kind === "post_event") return "attendees";
  return "other";
}

/** Every email Movents sent for one event, with the recipient's name when we know it. */
export function eventEmails(eventId: string) {
  return query<{
    id: string;
    kind: string;
    to_addr: string;
    intended_to: string | null;
    subject: string;
    body: string;
    status: string;
    provider: string | null;
    error: string | null;
    sent_at: string | null;
    created_at: string;
    who: string | null;
    sender: string | null;
  }>(
    `SELECT m.id, m.kind, m.to_addr, m.intended_to, m.subject, m.body, m.status, m.provider, m.error, m.sent_at, m.created_at,
            COALESCE(s.name, v.name, sp.company, r.name, (SELECT u.name FROM users u WHERE u.email = COALESCE(m.intended_to, m.to_addr) LIMIT 1)) AS who,
            su.name AS sender
     FROM emails m
     LEFT JOIN speakers s ON s.id = m.related_id
     LEFT JOIN vendors v ON v.id = m.related_id
     LEFT JOIN sponsors sp ON sp.id = m.related_id
     LEFT JOIN rsvps r ON r.id = m.related_id
     LEFT JOIN users su ON su.id = m.sent_by
     WHERE m.event_id = $1
     ORDER BY m.created_at DESC
     LIMIT 500`,
    [eventId],
  );
}
