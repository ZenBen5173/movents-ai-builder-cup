import { one, query } from "@/lib/db";
import { today } from "@/lib/appurl";
import { criticalPath } from "@/lib/planning";
import { TaskManager } from "@/components/app/task-manager";
import type { EventRow, Task } from "@/lib/types";
import { canViewEvent } from "@/lib/guard";

export const dynamic = "force-dynamic";

export default async function TasksPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await canViewEvent(id))) return null;
  const ev = await one<EventRow>("SELECT * FROM events WHERE id = $1", [id]);
  const tasks = await query<Task & { owner: string | null }>("SELECT t.*, u.name AS owner FROM tasks t LEFT JOIN users u ON u.id = t.owner_id WHERE t.event_id = $1 ORDER BY t.due_date, t.sort", [id]);
  const people = await query<{ id: string; name: string }>("SELECT u.id, u.name FROM event_members m JOIN users u ON u.id = m.user_id WHERE m.event_id = $1 ORDER BY u.name", [id]);
  const items = tasks.map((t) => ({ ...t, depends_on: t.depends_on ?? [] }));
  const day = items.find((t) => t.key === "eventday");
  const critical = day ? criticalPath(items, day.id) : [];
  return <TaskManager eventId={id} eventDate={ev?.date ?? today()} tasks={items} people={people} critical={critical} today={today()} />;
}
