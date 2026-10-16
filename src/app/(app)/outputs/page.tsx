import { pageUser } from "@/lib/guard";
import Link from "next/link";
import { FileStack } from "lucide-react";
import { query } from "@/lib/db";
import { fmtDate } from "@/lib/appurl";
import { eventOutputs } from "@/lib/outputs";
import { Empty, PageHeader, Pill } from "@/components/app/ui";
import { OutputsGrid } from "@/components/app/outputs-grid";
import { visibleSql } from "@/lib/members";

export const dynamic = "force-dynamic";

export default async function OutputsPage() {
  const user = await pageUser();
  const events = await query<{ id: string; title: string; date: string; status: string; has_report: boolean }>(
    `SELECT e.id, e.title, e.date, e.status,
      EXISTS (SELECT 1 FROM feedback f WHERE f.event_id = e.id) AS has_report
     FROM events e WHERE e.society_id = $1 AND ${visibleSql(user, 2)} AND EXISTS (SELECT 1 FROM budget_lines b WHERE b.event_id = e.id) ORDER BY e.date DESC`,
    [user.society_id, user.id],
  );
  return (
    <div>
      <PageHeader eyebrow="Workspace · files" title="Outputs" description="Proposal, budget, risk register, run sheet, calendar and post-event report for every event, real files you can open, download and send." />
      {events.length === 0 && <Empty icon={FileStack} title="No outputs yet" body="Run the agent to generate the first set." />}
      <div className="space-y-10">
        {events.map((e) => (
          <section key={e.id}>
            <div className="mb-3 flex items-center gap-2">
              <Link href={`/events/${e.id}`} className="font-semibold hover:text-primary">{e.title}</Link>
              <span className="text-sm text-muted-foreground">{fmtDate(e.date)}</span>
              <Pill status={e.status} />
            </div>
            <OutputsGrid items={eventOutputs(e.id, e.has_report)} />
          </section>
        ))}
      </div>
    </div>
  );
}
