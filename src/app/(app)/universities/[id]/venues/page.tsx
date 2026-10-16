import { query } from "@/lib/db";
import { today } from "@/lib/appurl";
import { overlaps } from "@/lib/planning";
import { VenueGrid } from "@/components/app/venue-grid";
import type { Venue } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function UniversityVenues({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const now = today();
  const month = now.slice(0, 7);
  const [venues, events, other] = await Promise.all([
    query<Venue>("SELECT * FROM venues WHERE university_id = $1 ORDER BY capacity", [id]),
    query<{ id: string; date: string; start_time: string; end_time: string; venue_id: string }>(
      `SELECT e.id, e.date, e.start_time, e.end_time, e.venue_id FROM events e JOIN societies s ON s.id = e.society_id WHERE e.venue_id IS NOT NULL AND s.university_id = $1`,
      [id],
    ),
    query<{ venue_id: string; date: string }>("SELECT b.venue_id, b.date FROM venue_bookings b JOIN venues v ON v.id = b.venue_id WHERE v.university_id = $1", [id]),
  ]);
  const clash = new Set(events.filter((a) => a.date >= now && events.some((b) => b.id !== a.id && b.venue_id === a.venue_id && b.date === a.date && overlaps(a, b))).map((a) => a.venue_id));
  const all = [...events.map((e) => ({ venue_id: e.venue_id, date: e.date })), ...other];
  return (
    <VenueGrid
      uni={id}
      venues={venues.map((v) => ({
        id: v.id,
        name: v.name,
        capacity: v.capacity,
        location: v.location,
        photo_url: v.photo_url ?? null,
        av: v.av,
        setup_styles: v.setup_styles,
        lead: v.booking_lead_weeks,
        next: all.filter((b) => b.venue_id === v.id && b.date >= now).map((b) => b.date).sort()[0] ?? null,
        month: all.filter((b) => b.venue_id === v.id && b.date.startsWith(month)).length,
        clash: clash.has(v.id),
      }))}
    />
  );
}
