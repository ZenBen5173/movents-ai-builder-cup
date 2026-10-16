import { canViewEvent, pageUser } from "@/lib/guard";
import Link from "next/link";
import { ScanLine } from "lucide-react";
import { notFound } from "next/navigation";
import { one, query } from "@/lib/db";
import { fmtDate, fmtRM, daysBetween, today } from "@/lib/appurl";
import type { EventRow, Role, Venue } from "@/lib/types";
import { Pill } from "@/components/app/ui";
import { EventTabs } from "@/components/app/event-tabs";
import { listMembers } from "@/lib/members";
import { EventTeam } from "@/components/app/event-team";
import { LiveBuild } from "@/components/app/live-build";
import { StageEmpty } from "@/components/ep/kit";

export const dynamic = "force-dynamic";

export default async function EventLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [ev, user] = await Promise.all([
    one<EventRow & { owner: string | null }>("SELECT e.*, u.name AS owner FROM events e LEFT JOIN users u ON u.id = e.created_by WHERE e.id = $1", [id]),
    pageUser(),
  ]);
  // Another society's event does not exist as far as this user is concerned.
  if (!ev || ev.society_id !== user.society_id) notFound();
  if (!(await canViewEvent(id))) {
    return (
      <div className="pt-10">
        <StageEmpty title="Not on this event" body={`${ev.title} is only visible to its team. Ask the event lead to add you.`} />
      </div>
    );
  }
  const [team, people, counts, venue] = await Promise.all([
    listMembers(id),
    query<{ id: string; name: string; role: Role; department: string | null }>("SELECT id, name, role, department FROM society_members WHERE society_id = $1 AND role <> 'faculty_advisor' ORDER BY name", [ev.society_id]),
    one<{ going: number; inn: number }>("SELECT count(*) FILTER (WHERE status = 'going')::int AS going, count(*) FILTER (WHERE checked_in)::int AS inn FROM rsvps WHERE event_id = $1", [id]),
    ev.venue_id ? one<Venue>("SELECT * FROM venues WHERE id = $1", [ev.venue_id]) : Promise.resolve(null),
  ]);
  const guests = counts ?? { going: 0, inn: 0 };
  const leadId = team.find((m) => m.member_role === "lead")?.user_id ?? ev.created_by ?? null;
  const d = daysBetween(today(), ev.date);
  const props: [string, React.ReactNode][] = [
    ["Status", <Pill key="s" status={ev.status} />],
    ["Date", `${fmtDate(ev.date)} · ${ev.start_time} to ${ev.end_time}`],
    ["Countdown", d > 0 ? `${d} days to go` : d === 0 ? "Today!" : `${-d} days ago`],
    ["Venue", venue ? `${venue.name} · ${venue.capacity} seats` : "TBC"],
    ["Expected", `${ev.pax} pax`],
    ["Budget", `${fmtRM(ev.budget_cap)} cap${ev.approved_budget ? ` · ${fmtRM(ev.approved_budget)} approved` : ""}`],
    ["Team", <EventTeam key="t" eventId={id} team={team.map((m) => m.user_id)} leadId={leadId} people={people} canEdit />],
  ];
  return (
    <div>
      <div className="mb-6">
        <p className="mono-label text-tomato">Project · {ev.topic ?? "event"}</p>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
          <h1 className="font-display text-3xl font-bold tracking-tight md:text-[40px] md:leading-[1.05]">{ev.title}</h1>
          <Link href={`/events/${id}/registration`} className="group flex h-11 items-center gap-2.5 rounded-xl border-[1.5px] border-ink bg-sun pl-3 pr-2 text-sm font-semibold shadow-[2px_2px_0_0_#161514] transition-all hover:-translate-y-0.5 hover:shadow-[3px_3px_0_0_#161514]">
            <ScanLine className="size-4 transition-transform group-hover:scale-110" />
            Check-in
            <span title="Checked in / going" className="rounded-md border border-ink bg-card px-1.5 py-0.5 font-mono text-[11px]">{guests.inn}/{guests.going}</span>
          </Link>
        </div>
        <dl className="mt-4 grid max-w-3xl grid-cols-[110px_1fr] gap-x-4 gap-y-1.5 text-sm sm:grid-cols-[110px_1fr_110px_1fr]">
          {props.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="mono-label pt-[3px] text-[10px] text-muted-foreground">{k}</dt>
              <dd className={k === "Team" ? "-my-1 py-1" : "truncate"}>{v}</dd>
            </div>
          ))}
        </dl>
      </div>
      <EventTabs id={id} />
      <div className="relative mt-8">
        <LiveBuild eventId={id} />
        {children}
      </div>
    </div>
  );
}
