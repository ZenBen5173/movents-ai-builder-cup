import { one, query } from "@/lib/db";
import { eventEmails, getMailbox, mailGroup } from "@/lib/mailbox";
import { EventInbox } from "@/components/app/event-inbox";
import { DraftsPanel } from "@/components/app/drafts-panel";
import { canViewEvent, pageUser } from "@/lib/guard";

export const dynamic = "force-dynamic";

const iso = (d: string | Date | null) => (d ? new Date(d).toISOString() : null);

/** Readable text of an email body, for the draft preview. */
const plain = (html: string) =>
  html
    .replace(/<(br|\/p|\/li|\/h\d)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();

export default async function InboxPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await canViewEvent(id))) return null;
  const user = await pageUser();
  const [rows, mailbox, ev, drafts] = await Promise.all([
    eventEmails(id),
    getMailbox(id),
    one<{ title: string }>("SELECT title FROM events WHERE id = $1", [id]),
    query<{ id: string; action_type: string; title: string; payload: Record<string, unknown>; created_at: string }>(
      "SELECT id, action_type, title, payload, created_at FROM approval_requests WHERE event_id = $1 AND status = 'draft' AND requested_by = $2 ORDER BY created_at",
      [id, user.id],
    ),
  ]);
  const slug = (ev?.title ?? "event").toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 24) || "event";
  return (
    <>
      <DraftsPanel
        drafts={drafts.map((d) => ({
          id: d.id,
          kind: d.action_type,
          title: d.title,
          to: String(d.payload.to ?? ""),
          subject: String(d.payload.subject ?? ""),
          text: plain(String(d.payload.html ?? "")).slice(0, 4000),
          created_at: iso(d.created_at)!,
        }))}
      />
      <EventInbox
        eventId={id}
        mailbox={mailbox ? { address: mailbox.address, label: mailbox.label } : null}
        suggestion={`${slug}@movents.example`}
        mails={rows.map((r) => ({ ...r, group: mailGroup(r.kind), sent_at: iso(r.sent_at), created_at: iso(r.created_at)! }))}
      />
    </>
  );
}
