import { pageUser } from "@/lib/guard";
import { query } from "@/lib/db";
import { daysBetween, today } from "@/lib/appurl";
import { Dashboard, type DashProject, type DashTask } from "@/components/app/dashboard";
import { visibleSql } from "@/lib/members";

export const dynamic = "force-dynamic";

export default async function BoxOffice() {
  const user = await pageUser();
  const now = today();
  const [projects, tasks] = await Promise.all([
    query<{
    id: string;
    title: string;
    date: string;
    status: string;
    budget_cap: number;
    approved_budget: number | null;
    venue: string | null;
    tasks: number;
    done: number;
    estimate: number;
    actual: number;
    pending: number;
    risks: number;
    going: number;
    pax: number;
  }>(
    `SELECT e.id, e.title, e.date, e.status, e.budget_cap, e.approved_budget, e.pax, v.name AS venue,
      (SELECT count(*)::int FROM tasks t WHERE t.event_id = e.id) AS tasks,
      (SELECT count(*)::int FROM tasks t WHERE t.event_id = e.id AND t.status = 'done') AS done,
      (SELECT coalesce(sum(b.estimated),0)::float FROM budget_lines b WHERE b.event_id = e.id) AS estimate,
      (SELECT coalesce(sum(b.actual),0)::float FROM budget_lines b WHERE b.event_id = e.id) AS actual,
      (SELECT count(*)::int FROM approval_requests a WHERE a.event_id = e.id AND a.status = 'pending') AS pending,
      (SELECT count(*)::int FROM risks k WHERE k.event_id = e.id AND k.status <> 'closed' AND k.likelihood * k.impact >= 12) AS risks,
      (SELECT count(*)::int FROM rsvps r WHERE r.event_id = e.id AND r.status = 'going') AS going
     FROM events e LEFT JOIN venues v ON v.id = e.venue_id WHERE e.society_id = $1 AND ${visibleSql(user, 2)} ORDER BY e.date`,
    [user.society_id, user.id],
    ),
    // blocked = depends on a task that is not done yet
    query<{ id: string; title: string; due_date: string; status: string; priority: string; event_id: string; event_title: string; owner_id: string | null; owner: string | null; depends_on: string[]; blocked: boolean }>(
      `SELECT t.id, t.title, t.due_date, t.status, t.priority, t.event_id, e.title AS event_title, t.owner_id, u.name AS owner, t.depends_on,
         EXISTS (SELECT 1 FROM jsonb_array_elements_text(t.depends_on) d(x) WHERE NOT EXISTS (SELECT 1 FROM tasks dt WHERE dt.id = d.x AND dt.status = 'done')) AS blocked
       FROM tasks t JOIN events e ON e.id = t.event_id LEFT JOIN users u ON u.id = t.owner_id
       WHERE e.society_id = $1 AND ${visibleSql(user, 2)} AND t.status <> 'done' AND e.status <> 'completed' ORDER BY t.due_date LIMIT 400`,
      [user.society_id, user.id],
    ),
  ]);
  const dash: DashProject[] = projects.map((p) => {
    const base = p.approved_budget ?? p.budget_cap;
    const spent = p.actual > 0 ? p.actual : 0;
    return {
      id: p.id,
      title: p.title,
      date: p.date,
      venue: p.venue,
      status: p.status,
      days: daysBetween(now, p.date),
      progress: p.tasks ? Math.round((p.done / p.tasks) * 100) : 0,
      tasks: p.tasks,
      done: p.done,
      budgetBase: base,
      allocated: Math.round(p.estimate * 1.1 * 100) / 100,
      spent,
      pending: p.pending,
      risks: p.risks,
      going: p.going,
      pax: p.pax,
    };
  });
  const dashTasks: DashTask[] = tasks.map((t) => ({
    id: t.id,
    title: t.title.replace(/^SOP: /, ""),
    due: t.due_date,
    eventId: t.event_id,
    eventTitle: t.event_title,
    mine: t.owner_id === user.id,
    owner: t.owner,
    priority: t.priority,
    blocked: t.blocked,
  }));
  return <Dashboard projects={dash} tasks={dashTasks} today={now} firstName={user.name.split(" ")[0]} />;
}
