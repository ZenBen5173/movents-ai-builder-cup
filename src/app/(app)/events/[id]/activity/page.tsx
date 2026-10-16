import { query } from "@/lib/db";
import { AuditFeed } from "@/components/app/audit-feed";
import type { AuditLog } from "@/lib/types";
import { canViewEvent } from "@/lib/guard";

export const dynamic = "force-dynamic";

export default async function ActivityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await canViewEvent(id))) return null;
  const rows = await query<AuditLog & { event_title: string | null }>("SELECT a.*, NULL AS event_title FROM audit_logs a WHERE a.event_id = $1 ORDER BY a.created_at DESC LIMIT 300", [id]);
  return <AuditFeed rows={rows.map((r) => ({ ...r, created_at: new Date(r.created_at).toISOString() }))} />;
}
