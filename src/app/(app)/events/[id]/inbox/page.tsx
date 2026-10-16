import { one } from "@/lib/db";
import { eventEmails, getMailbox, mailGroup } from "@/lib/mailbox";
import { EventInbox } from "@/components/app/event-inbox";
import { canViewEvent } from "@/lib/guard";

export const dynamic = "force-dynamic";

const iso = (d: string | Date | null) => (d ? new Date(d).toISOString() : null);

export default async function InboxPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await canViewEvent(id))) return null;
  const [rows, mailbox, ev] = await Promise.all([eventEmails(id), getMailbox(id), one<{ title: string }>("SELECT title FROM events WHERE id = $1", [id])]);
  const slug = (ev?.title ?? "event").toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 24) || "event";
  return (
    <EventInbox
      eventId={id}
      mailbox={mailbox ? { address: mailbox.address, label: mailbox.label } : null}
      suggestion={`${slug}@movents.example`}
      mails={rows.map((r) => ({ ...r, group: mailGroup(r.kind), sent_at: iso(r.sent_at), created_at: iso(r.created_at)! }))}
    />
  );
}
