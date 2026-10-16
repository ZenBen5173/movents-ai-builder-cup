import Link from "next/link";
import { query } from "@/lib/db";
import { pageUser } from "@/lib/guard";
import { seesAll, visibleSql } from "@/lib/members";
import { PageHeader } from "@/components/app/ui";
import { AuditFeed } from "@/components/app/audit-feed";
import type { AuditLog } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ event?: string }> }) {
  const { event } = await searchParams;
  const user = await pageUser();
  const events = await query<{ id: string; title: string }>(
    `SELECT e.id, e.title FROM events e WHERE e.society_id = $1 AND ${visibleSql(user, 2)} ORDER BY e.created_at DESC`,
    [user.society_id, user.id],
  );
  // Oversight roles see the whole society's log; others see their events and their own actions.
  const rows = await query<AuditLog & { event_title: string | null }>(
    `SELECT a.*, e.title AS event_title FROM audit_logs a LEFT JOIN events e ON e.id = a.event_id
     WHERE a.society_id = $1
       AND ($3 OR a.user_id = $2 OR (e.id IS NOT NULL AND ${visibleSql(user, 2)}))
       ${event ? "AND a.event_id = $4" : ""}
     ORDER BY a.created_at DESC LIMIT 400`,
    event ? [user.society_id, user.id, seesAll(user), event] : [user.society_id, user.id, seesAll(user)],
  );
  return (
    <div>
      <PageHeader eyebrow="Admin" title="Audit log" description="Who did what, when, and who approved it. Every agent step, approval, send, payment and sign-in is recorded and can’t be edited from the app." />
      <div className="mb-4 flex flex-wrap gap-2 text-xs">
        <Link href="/audit" className={`rounded-full border px-3 py-1 ${!event ? "border-ink bg-ink text-white" : "border-ink/20 hover:border-ink"}`}>All</Link>
        {events.map((e) => (
          <Link key={e.id} href={`/audit?event=${e.id}`} className={`rounded-full border px-3 py-1 ${event === e.id ? "border-ink bg-ink text-white" : "border-ink/20 hover:border-ink"}`}>{e.title}</Link>
        ))}
      </div>
      <AuditFeed rows={rows.map((r) => ({ ...r, created_at: new Date(r.created_at).toISOString() }))} />
    </div>
  );
}
