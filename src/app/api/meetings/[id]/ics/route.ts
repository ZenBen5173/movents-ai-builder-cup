import { NextResponse } from "next/server";
import { one } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { isMember } from "@/lib/members";
import { buildIcs } from "@/lib/integrations/gcal";
import { getMeeting, klParts } from "@/lib/meetings";

export const dynamic = "force-dynamic";

/** One meeting as an .ics file, for people on the event's team. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const m = await getMeeting(id);
  const user = await currentUser();
  if (!m || !user || !(await isMember(user, m.event_id))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const ev = await one<{ title: string }>("SELECT title FROM events WHERE id = $1", [m.event_id]);
  const start = klParts(m.starts_at);
  const endIso = new Date(Date.parse(m.starts_at) + m.duration_min * 60_000).toISOString();
  const end = klParts(endIso);
  const description = [
    ev?.title,
    m.location,
    m.meeting_url,
    m.agenda.length ? `Agenda:\n${m.agenda.map((a) => `- ${a.item}${a.minutes ? ` (${a.minutes} min)` : ""}`).join("\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  const ics = buildIcs(ev?.title ?? "Movents", [
    { uid: m.id, title: ev ? `${m.title} · ${ev.title}` : m.title, date: start.date, startTime: start.time, endTime: end.date === start.date ? end.time : "23:59", description },
  ]);
  const slug = m.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "meeting";
  return new NextResponse(ics, { headers: { "content-type": "text/calendar; charset=utf-8", "content-disposition": `attachment; filename="${slug}.ics"`, "cache-control": "no-store" } });
}
