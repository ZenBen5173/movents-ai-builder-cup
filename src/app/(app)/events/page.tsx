import { pageUser } from "@/lib/guard";
import Link from "next/link";
import { query } from "@/lib/db";
import { fmtDate, fmtRM, today } from "@/lib/appurl";
import { Empty, PageHeader, Pill } from "@/components/app/ui";
import { Stamp } from "@/components/ep/kit";
import type { EventRow } from "@/lib/types";
import { visibleSql } from "@/lib/members";

export const dynamic = "force-dynamic";

type Row = EventRow & { venue: string | null; going: number; pending: number; tasks: number; done: number; risks: number };

export default async function ProjectsPage() {
  const user = await pageUser();
  const events = await query<Row>(
    `SELECT e.*, v.name AS venue,
      (SELECT count(*)::int FROM rsvps r WHERE r.event_id = e.id AND r.status = 'going') AS going,
      (SELECT count(*)::int FROM approval_requests a WHERE a.event_id = e.id AND a.status = 'pending') AS pending,
      (SELECT count(*)::int FROM tasks t WHERE t.event_id = e.id) AS tasks,
      (SELECT count(*)::int FROM tasks t WHERE t.event_id = e.id AND t.status = 'done') AS done,
      (SELECT count(*)::int FROM risks k WHERE k.event_id = e.id AND k.status <> 'closed' AND k.likelihood * k.impact >= 8) AS risks
     FROM events e LEFT JOIN venues v ON v.id = e.venue_id WHERE e.society_id = $1 AND ${visibleSql(user, 2)} ORDER BY e.date`,
    [user.society_id, user.id],
  );
  const now = today();
  const upcoming = events.filter((e) => e.date >= now && e.status !== "completed");
  const past = events.filter((e) => !(e.date >= now && e.status !== "completed")).reverse();

  const Section = ({ label, rows }: { label: string; rows: Row[] }) => (
    <section className="mb-12">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="mono-label font-bold">{label}</h2>
        <span className="mono-label text-[10px] text-muted-foreground">{rows.length} project{rows.length === 1 ? "" : "s"}</span>
      </div>
      <div className="border-t-[1.5px] border-ink">
        {rows.map((e) => {
          const pct = e.tasks ? Math.round((e.done / e.tasks) * 100) : 0;
          return (
            <Link key={e.id} href={`/events/${e.id}`} className="group grid grid-cols-[1fr_auto] items-center gap-x-6 gap-y-2 border-b-[1.5px] border-ink py-5 transition-colors hover:bg-sand/40 md:grid-cols-[96px_1fr_220px_160px]">
              <span className="mono-label hidden text-[11px] font-bold md:block">{fmtDate(e.date).toUpperCase()}</span>
              <span className="min-w-0">
                <span className="block truncate font-display text-2xl font-bold transition-colors group-hover:text-tomato-ink">{e.title}</span>
                <span className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  <Pill status={e.status} />
                  {e.venue ?? "venue TBC"} · {e.pax} pax · cap {fmtRM(e.budget_cap)}
                  {e.pending > 0 && <span className="font-medium text-tomato-ink">· {e.pending} waiting backstage</span>}
                </span>
              </span>
              <span className="hidden md:block">
                <span className="flex items-center justify-between text-xs text-muted-foreground"><span>{e.done}/{e.tasks} tasks</span><span>{pct}%</span></span>
                <span className="mt-1.5 block h-2 overflow-hidden rounded-full border border-ink/70 bg-card"><span className="block h-full bg-tomato" style={{ width: `${pct}%` }} /></span>
              </span>
              <span className="text-right text-sm">
                {e.risks > 0 ? <span className="text-tomato-ink">{e.risks} live risk{e.risks === 1 ? "" : "s"}</span> : <span className="text-muted-foreground">no live risks</span>}
                <span className="block text-xs text-muted-foreground">{e.going} going</span>
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );

  return (
    <div>
      <PageHeader
        eyebrow="Projects · season 2026 to 27"
        title="The tour"
        description="Every event is a project: tasks with dependencies, risks with mitigations, budget, people, registration and marketing in one place."
        actions={
          <>
            <Stamp className="mr-2 hidden md:inline-block">Tour 2026 to 27</Stamp>
            <Link href="/" className="inline-flex h-10 items-center rounded-xl bg-ink px-4 text-sm font-medium text-white shadow-[2px_2px_0_0_#ff5a36]">Plan a new event</Link>
          </>
        }
      />
      {events.length === 0 ? (
        <Empty title="The stage is empty" body="Type one line at the box office and Movents builds the whole project." />
      ) : (
        <>
          {upcoming.length > 0 && <Section label="On stage next" rows={upcoming} />}
          {past.length > 0 && <Section label="Past shows" rows={past} />}
        </>
      )}
    </div>
  );
}
