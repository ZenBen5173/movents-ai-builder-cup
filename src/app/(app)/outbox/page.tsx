import { pageUser } from "@/lib/guard";
import { query } from "@/lib/db";
import { visibleSql } from "@/lib/members";
import { PageHeader, Empty } from "@/components/app/ui";
import { OutboxList, type EventMailGroup } from "@/components/app/outbox-list";

export const dynamic = "force-dynamic";

/** All mail, grouped by event. Each group opens that event's inbox. */
export default async function OutboxPage() {
  const user = await pageUser();
  const rows = await query<{ id: string; subject: string; status: string; created_at: string; event_id: string; event_title: string }>(
    `SELECT m.id, m.subject, m.status, m.created_at, e.id AS event_id, e.title AS event_title
     FROM emails m JOIN events e ON e.id = m.event_id
     WHERE e.society_id = $1 AND ${visibleSql(user, 2)}
     ORDER BY m.created_at DESC LIMIT 600`,
    [user.society_id, user.id],
  );
  const map = new Map<string, EventMailGroup>();
  for (const r of rows) {
    const g = map.get(r.event_id) ?? { eventId: r.event_id, title: r.event_title, count: 0, latest: [] };
    g.count++;
    if (g.latest.length < 3) g.latest.push({ id: r.id, subject: r.subject, status: r.status, at: new Date(r.created_at).toISOString() });
    map.set(r.event_id, g);
  }
  const groups = [...map.values()];
  return (
    <div>
      <PageHeader eyebrow="Mail" title="All inboxes" />
      {groups.length === 0 ? <Empty title="Nothing sent yet" /> : <OutboxList groups={groups} />}
    </div>
  );
}
