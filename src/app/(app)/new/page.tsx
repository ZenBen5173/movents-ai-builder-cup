import { pageUser } from "@/lib/guard";
import Link from "next/link";
import { query } from "@/lib/db";
import { today } from "@/lib/appurl";
import { visibleSql } from "@/lib/members";
import type { AgentRun, Role } from "@/lib/types";
import { PromptBox } from "@/components/app/prompt-box";
import { Eyebrow } from "@/components/ep/kit";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const ago = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  return m < 60 ? `${Math.max(1, m)}m` : m < 1440 ? `${Math.round(m / 60)}h` : `${Math.round(m / 1440)}d`;
};

export default async function NewEvent() {
  const user = await pageUser();
  const [runs, people] = await Promise.all([
    query<AgentRun & { by: string }>(
      `SELECT r.*, u.name AS by FROM agent_runs r LEFT JOIN users u ON u.id = r.started_by
       WHERE r.started_by = $1 OR (r.event_id IS NOT NULL AND EXISTS (SELECT 1 FROM events e WHERE e.id = r.event_id AND ${visibleSql(user, 1)}))
       ORDER BY r.created_at DESC LIMIT 20`,
      [user.id],
    ),
    query<{ id: string; name: string; role: Role; department: string | null }>("SELECT id, name, role, department FROM society_members WHERE society_id = $1 AND role <> 'faculty_advisor' ORDER BY name", [user.society_id]),
  ]);
  return (
    <div className="grid gap-10 pt-6 lg:grid-cols-[1fr_260px]">
      <div className="mx-auto w-full max-w-3xl">
        <div className="mb-8 text-center">
          <Eyebrow>Admit one prompt</Eyebrow>
          <h1 className="mt-2 font-display text-4xl font-bold tracking-tight md:text-5xl">What are we putting on?</h1>
        </div>
        <PromptBox today={today()} people={people} me={user.id} />
      </div>

      <aside className="lg:border-l-[1.5px] lg:border-ink lg:pl-6">
        <h2 className="mono-label pb-2 font-bold">Recent</h2>
        <ol className="space-y-0.5">
          {runs.map((r) => (
            <li key={r.id}>
              <Link href={`/runs/${r.id}`} className="group flex items-start gap-2 rounded-lg px-2 py-2 transition-colors hover:bg-sand/50">
                <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", r.status === "running" ? "animate-pulse bg-tomato" : r.status === "failed" ? "bg-tomato-ink" : "bg-[#46a758]")} />
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 text-[13px] leading-snug transition-transform group-hover:translate-x-0.5">{r.prompt}</span>
                  <span className="mt-0.5 flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground">
                    {r.source !== "builtin" && <span className="rounded bg-ticket-blue px-1 text-white">AI</span>}
                    {r.by?.split(" ")[0]} · {ago(String(r.created_at))}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ol>
      </aside>
    </div>
  );
}
