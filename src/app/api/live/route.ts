import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { visibleSql } from "@/lib/members";
import type { AgentStep } from "@/lib/types";

export const dynamic = "force-dynamic";

type Row = { id: string; event_id: string | null; prompt: string; status: string; source: string; steps: AgentStep[]; finished_at: string | null; title: string | null };

const slim = (r: Row) => ({
  id: r.id,
  eventId: r.event_id,
  title: r.title,
  prompt: r.prompt,
  status: r.status,
  source: r.source,
  steps: (r.steps ?? []).map((s) => ({ id: s.id, name: s.name, tool: s.tool, status: s.status, summary: s.summary ?? null })),
});

/**
 * What the AI assistant is doing right now, for the live build view.
 * ?event=ID gives that event's current (or just finished) run; without it, every run in progress.
 */
export async function GET(req: Request) {
  const user = await currentUser();
  if (!user?.society_id) return NextResponse.json({ runs: [] }, { status: 401 });
  const event = new URL(req.url).searchParams.get("event");
  // Runs this user started, or on events they can see in their society.
  const rows = await query<Row>(
    `SELECT r.id, r.event_id, r.prompt, r.status, r.source, r.steps, r.finished_at, e.title
     FROM agent_runs r LEFT JOIN events e ON e.id = r.event_id
     WHERE (r.status = 'running' OR r.finished_at > now() - interval '12 seconds')
       AND r.created_at > now() - interval '2 hours'
       AND (r.started_by = $1 OR (e.society_id = $2 AND ${visibleSql(user, 1)}))
       ${event ? "AND r.event_id = $3" : ""}
     ORDER BY r.created_at DESC LIMIT 6`,
    event ? [user.id, user.society_id, event] : [user.id, user.society_id],
  );
  return NextResponse.json({ runs: rows.map(slim) }, { headers: { "cache-control": "no-store" } });
}
