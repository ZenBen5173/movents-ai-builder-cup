import { notFound } from "next/navigation";
import { one, query } from "@/lib/db";
import { canViewEvent } from "@/lib/guard";
import type { EventRow, Rsvp } from "@/lib/types";
import { CheckinClient } from "@/components/app/checkin-client";

export const dynamic = "force-dynamic";

export default async function CheckinPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await canViewEvent(id))) notFound();
  const ev = await one<EventRow>("SELECT * FROM events WHERE id = $1", [id]);
  if (!ev) notFound();
  const rows = await query<Rsvp>("SELECT * FROM rsvps WHERE event_id = $1 ORDER BY name", [id]);
  return <CheckinClient eventId={id} title={ev.title} rows={rows.map((r) => ({ ...r, created_at: new Date(r.created_at).toISOString(), checked_in_at: r.checked_in_at ? new Date(r.checked_in_at).toISOString() : null }))} />;
}
