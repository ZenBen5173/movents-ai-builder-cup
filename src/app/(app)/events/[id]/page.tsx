import Link from "next/link";
import { loadBundle, budgetTotals } from "@/lib/docs/builders";
import { query } from "@/lib/db";
import { daysBetween, fmtDate, today } from "@/lib/appurl";
import { blockedBy, criticalPath } from "@/lib/planning";
import { Card } from "@/components/app/ui";
import { OverviewStats } from "@/components/app/overview-stats";
import { Icon, Wristband } from "@/components/ep/kit";
import { ACTION_LABEL } from "@/lib/rbac";
import type { ActionType, Role } from "@/lib/types";
import type { IconName } from "@/components/ep/icons";
import { OverviewHero } from "@/components/app/overview-hero";
import { CriticalPathTimeline } from "@/components/app/task-manager";
import { UpNext } from "@/components/app/up-next";
import { cn } from "@/lib/utils";
import { canViewEvent } from "@/lib/guard";

export const dynamic = "force-dynamic";

const ACTION_ICON: Record<string, IconName> = {
  "payment.deposit": "credit-card",
  "budget.approve": "file-spreadsheet",
  "email.speaker": "mic-vocal",
  "email.vendor": "file-text",
  "email.faculty": "scroll-text",
  "publish.luma": "ticket-plus",
  "publish.meetup": "ticket-plus",
  "publish.social": "file-type",
  "speaker.confirm": "user-check",
  "calendar.push": "calendar-days",
};

export default async function ProjectOverview({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await canViewEvent(id))) return null;
  const b = (await loadBundle(id))!;
  const sop = b.university!.sop;
  const t = budgetTotals(b.lines, sop.budget_rules.contingency_pct);
  const approvals = await query<{ id: string; title: string; status: string; approver_role: string; approver_department: string | null; action_type: string }>("SELECT id, title, status, approver_role, approver_department, action_type FROM approval_requests WHERE event_id = $1 AND status IN ('pending','awaiting_faculty') ORDER BY created_at", [id]);
  const going = b.rsvps.filter((r) => r.status === "going").length;
  const done = b.tasks.filter((x) => x.status === "done").length;
  const people = Object.fromEntries(b.users.map((u) => [u.id, u.name]));
  const now = today();
  const days = daysBetween(now, b.event.date);
  const tasks = b.tasks.map((x) => ({ ...x, depends_on: x.depends_on ?? [] }));
  const upNext = tasks.filter((x) => x.status !== "done").sort((a, c) => a.due_date.localeCompare(c.due_date)).slice(0, 6);
  const dayTask = tasks.find((x) => x.key === "eventday");
  const path = dayTask ? criticalPath(tasks, dayTask.id).map((pid) => tasks.find((x) => x.id === pid)!).filter(Boolean) : [];
  const liveRisks = b.risks.filter((r) => r.status !== "closed").sort((a, c) => c.likelihood * c.impact - a.likelihood * a.impact).slice(0, 4);

  return (
    <div className="space-y-12">
      <OverviewHero
        days={days}
        title={b.event.title}
        date={fmtDate(b.event.date)}
        venue={b.venue?.name ?? "Venue TBC"}
        id={b.event.id}
        flags={b.event.flags}
      />

      <OverviewStats
        id={id}
        money={{ estimate: t.subtotal, contingency: t.contingency, cap: b.event.budget_cap, approved: b.event.approved_budget, actual: t.actual, alertPct: sop.budget_rules.alert_pct }}
        done={done}
        tasks={b.tasks.length}
        risks={b.risks.filter((r) => r.status !== "closed").map((r) => ({ id: r.id, category: r.category, score: r.likelihood * r.impact })).sort((x, y) => y.score - x.score)}
        going={going}
        seats={b.venue?.capacity ?? b.event.pax}
        backstage={approvals.length}
      />

      <div className="grid gap-12 lg:grid-cols-[1.25fr_1fr]">
        <Card title="Up next" actions={<Link href={`/events/${id}/tasks`} className="text-xs font-medium text-tomato-ink hover:underline">All tasks</Link>}>
          <UpNext
            items={upNext.map((x) => ({
              id: x.id,
              title: x.title.replace(/^SOP: /, ""),
              due: x.due_date,
              overdue: x.due_date < now,
              blockedBy: blockedBy(x, tasks).map((d) => d.title.replace(/^SOP: /, "")),
              done: false,
            }))}
          />
        </Card>

        <Card title="Live risks" actions={<Link href={`/events/${id}/risks`} className="text-xs font-medium text-tomato-ink hover:underline">Risk board</Link>}>
          <ul>
            {liveRisks.map((r) => {
              const sc = r.likelihood * r.impact;
              return (
                <li key={r.id} className="group relative">
                  <Link href={`/events/${id}/risks`} className="flex items-center gap-3 border-b border-border py-2.5 hover:bg-sand/40">
                    <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg border-[1.5px] border-ink font-mono text-sm font-bold", sc >= 12 ? "bg-tomato" : sc >= 6 ? "bg-sun" : "bg-mint")}>{sc}</span>
                    <span className="min-w-0 flex-1 truncate text-[14.5px] font-medium">{r.category}</span>
                  </Link>
                  <span className="pointer-events-none absolute left-12 top-full z-20 -mt-1 w-max max-w-80 rounded-lg border-[1.5px] border-ink bg-card px-2 py-1 text-xs opacity-0 shadow-[2px_2px_0_0_#161514] transition-opacity group-hover:opacity-100">{r.description.split(".")[0]}</span>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>

      {path.length > 1 && (
        <Card title="Critical path" actions={<Link href={`/events/${id}/tasks`} className="text-xs font-medium text-tomato-ink hover:underline">Timeline</Link>}>
          <CriticalPathTimeline eventId={id} eventDate={b.event.date} tasks={path.map((x) => ({ ...x, owner: x.owner_id ? people[x.owner_id] : null }))} />
        </Card>
      )}

      {approvals.length > 0 && (
        <Card title="Waiting backstage" actions={<Link href="/approvals" className="text-xs font-medium text-tomato-ink hover:underline">Backstage</Link>}>
          <ul className="grid gap-3 sm:grid-cols-2">
            {approvals.map((a) => (
              <li key={a.id}>
                <Link href={`/approvals#${a.id}`} className="group flex items-stretch overflow-hidden rounded-xl border-[1.5px] border-ink bg-card transition-all hover:-translate-y-0.5 hover:shadow-[3px_3px_0_0_#161514]">
                  <span className="grid w-12 shrink-0 place-items-center border-r-[1.5px] border-dashed border-ink bg-sun">
                    <Icon name={ACTION_ICON[a.action_type] ?? "shield-alert"} size={18} />
                  </span>
                  <span className="min-w-0 flex-1 px-3 py-2.5">
                    <span className="block truncate text-sm font-semibold">{a.title}</span>
                    <span className="mt-1 flex items-center gap-2">
                      <Wristband role={(a.status === "awaiting_faculty" ? "faculty_advisor" : a.approver_role) as Role} label={a.status === "awaiting_faculty" ? "Faculty" : a.approver_role === "director" ? `${a.approver_department ?? ""} director` : a.approver_role} size="xs" />
                      <span className="font-mono text-[10px] text-muted-foreground">{ACTION_LABEL[a.action_type as ActionType] ?? ""}</span>
                    </span>
                  </span>
                  <span className="flex items-center pr-3 text-xs font-semibold text-tomato-ink opacity-60 transition-opacity group-hover:opacity-100">Review</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
