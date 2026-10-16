import { pageUser } from "@/lib/guard";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { one, query } from "@/lib/db";
import { today } from "@/lib/appurl";
import { overlaps } from "@/lib/planning";
import { isMember } from "@/lib/members";
import { VenueCalendar, type Booking } from "@/components/app/venue-calendar";
import { FloorPlan } from "@/components/app/floor-plans";
import { PLAN_IDS } from "@/lib/floor-plans";
import { Icon } from "@/components/ep/kit";
import type { Venue } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function VenuePage({ params }: { params: Promise<{ id: string; venueId: string }> }) {
  const { id, venueId } = await params;
  const user = await pageUser();
  const v = await one<Venue>("SELECT * FROM venues WHERE id = $1 AND university_id = $2", [venueId, id]);
  if (!v) notFound();
  const [events, other] = await Promise.all([
    query<{ id: string; title: string; date: string; start_time: string; end_time: string; society_id: string; society: string }>(
      "SELECT e.id, e.title, e.date, e.start_time, e.end_time, e.society_id, s.name AS society FROM events e JOIN societies s ON s.id = e.society_id WHERE e.venue_id = $1",
      [venueId],
    ),
    query<{ id: string; title: string; holder: string | null; kind: string; date: string; start_time: string; end_time: string }>("SELECT * FROM venue_bookings WHERE venue_id = $1", [venueId]),
  ]);
  const bookings: Booking[] = [];
  for (const e of events) {
    const ours = e.society_id === user.society_id;
    const clash = events.some((b) => b.id !== e.id && b.date === e.date && overlaps(b, e));
    // Other societies' bookings show as busy time, not their event names.
    bookings.push({ id: ours ? e.id : `busy_${bookings.length}`, title: ours ? e.title : "Booked", holder: e.society, kind: ours ? "ours" : "society", date: e.date, start: e.start_time, end: e.end_time, clash, href: ours && (await isMember(user, e.id)) ? `/events/${e.id}` : undefined });
  }
  for (const b of other) bookings.push({ id: b.id, title: b.title, holder: b.holder, kind: (b.kind as Booking["kind"]) ?? "society", date: b.date, start: b.start_time, end: b.end_time });
  const facts: [string, React.ReactNode, string][] = [
    ["user-check", <b key="c" className="font-mono">{v.capacity}</b>, "Seats"],
    ["clock-4", <b key="l" className="font-mono">{v.booking_lead_weeks}w</b>, `Book ${v.booking_lead_weeks} weeks ahead`],
    ["credit-card", <b key="p" className="font-mono">{v.cost ? `RM${v.cost}` : "Free"}</b>, "Hire cost"],
  ];

  return (
    <div className="space-y-10">
      <Link href={`/universities/${id}/venues`} className="group inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-ink">
        <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-0.5" /> Venues
      </Link>

      <div className="grid gap-6 md:grid-cols-[1.3fr_1fr]">
        <div className="relative aspect-[16/9] overflow-hidden rounded-2xl border-[1.5px] border-ink bg-sand shadow-[4px_4px_0_0_#161514]">
          {v.photo_url ? (
             
            <img src={v.photo_url} alt={v.name} className="size-full object-cover" />
          ) : (
            <div className="grid size-full place-items-center text-muted-foreground"><Icon name="building-2" size={36} /></div>
          )}
        </div>
        <div className="flex flex-col justify-end">
          <h2 className="font-display text-3xl font-bold tracking-tight">{v.name}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{v.location}</p>
          <div className="mt-5 flex flex-wrap gap-5">
            {facts.map(([icon, val, tip]) => (
              <span key={tip} title={tip} className="flex items-center gap-1.5 text-lg">
                <Icon name={icon as never} size={16} className="text-muted-foreground" />
                {val}
              </span>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-1.5">
            {[...v.setup_styles, ...v.av].map((t) => (
              <span key={t} className="rounded-md border border-ink/25 px-2 py-0.5 font-mono text-[11px]">{t}</span>
            ))}
          </div>
        </div>
      </div>

      <section>
        <h3 className="mono-label mb-3 border-b-[1.5px] border-ink pb-2 font-bold">Bookings</h3>
        <VenueCalendar bookings={bookings} today={today()} />
      </section>

      <section>
        <h3 className="mono-label mb-3 border-b-[1.5px] border-ink pb-2 font-bold">Floor plan</h3>
        {PLAN_IDS.has(v.id) ? (
          <div className="mx-auto max-w-xl"><FloorPlan venueId={v.id} /></div>
        ) : (
          <div className="grid place-items-center rounded-xl border-[1.5px] border-dashed border-ink/30 py-14 text-muted-foreground">
            <Icon name="file-type" size={26} />
            <span className="mt-2 font-mono text-xs">No plan yet</span>
          </div>
        )}
      </section>
    </div>
  );
}
