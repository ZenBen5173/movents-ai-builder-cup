import { one, query } from "@/lib/db";
import { listMembers } from "@/lib/members";
import { MEETING_TEMPLATES, nowKL, listMeetings } from "@/lib/meetings";
import { MeetingsView } from "@/components/app/meetings-view";
import { canViewEvent } from "@/lib/guard";

export const dynamic = "force-dynamic";

/** Meetings: next one up as a ticket, a month strip, then upcoming and past with minutes. */
export default async function MeetingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await canViewEvent(id))) return null;
  const [ev, team, meetings] = await Promise.all([
    one<{ title: string; date: string }>("SELECT title, date FROM events WHERE id = $1", [id]),
    listMembers(id),
    listMeetings(id),
  ]);
  const taskIds = [...new Set(meetings.flatMap((m) => m.action_items.map((a) => a.task_id).filter((x): x is string => Boolean(x))))];
  const tasks = taskIds.length ? await query<{ id: string; status: string; title: string }>("SELECT id, status, title FROM tasks WHERE id = ANY($1::text[])", [taskIds]) : [];

  return (
    <MeetingsView
      eventId={id}
      eventTitle={ev?.title ?? ""}
      eventDate={String(ev?.date ?? "").slice(0, 10)}
      team={team.map((m) => ({ id: m.user_id, name: m.name, role: m.role, member_role: m.member_role }))}
      meetings={meetings}
      tasks={Object.fromEntries(tasks.map((t) => [t.id, { status: t.status, title: t.title }]))}
      now={nowKL()}
      templates={MEETING_TEMPLATES}
    />
  );
}
