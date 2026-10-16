import { pageUser } from "@/lib/guard";
import Link from "next/link";
import { query } from "@/lib/db";
import { fmtDate } from "@/lib/appurl";
import { Empty, PageHeader } from "@/components/app/ui";
import { visibleSql } from "@/lib/members";

export const dynamic = "force-dynamic";

export default async function CheckinIndex() {
  const user = await pageUser();
  const events = await query<{ id: string; title: string; date: string; going: number; inn: number }>(
    `SELECT e.id, e.title, e.date,
      (SELECT count(*)::int FROM rsvps r WHERE r.event_id = e.id AND r.status = 'going') AS going,
      (SELECT count(*)::int FROM rsvps r WHERE r.event_id = e.id AND r.checked_in) AS inn
     FROM events e WHERE e.society_id = $1 AND ${visibleSql(user, 2)} ORDER BY e.date DESC`,
    [user.society_id, user.id],
  );
  return (
    <div>
      <PageHeader eyebrow="On the day" title="Door check-in" description="Pick an event. Works on a phone, install Movents to your home screen for a full-screen app." />
      {events.length === 0 && <Empty title="No events" />}
      <div className="border-t-[1.5px] border-ink">
        {events.map((e) => (
          <Link key={e.id} href={`/checkin/${e.id}`} className="group flex items-center justify-between gap-4 border-b border-border py-4 hover:bg-sand/40">
            <span>
              <span className="block font-display text-xl font-bold group-hover:text-tomato-ink">{e.title}</span>
              <span className="text-sm text-muted-foreground">{fmtDate(e.date)}</span>
            </span>
            <span className="font-mono text-sm">{e.inn}/{e.going} in</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
