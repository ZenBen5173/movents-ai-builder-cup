import { query } from "@/lib/db";
import { RiskBoard } from "@/components/app/risk-board";
import type { Risk } from "@/lib/types";
import { canViewEvent } from "@/lib/guard";

export const dynamic = "force-dynamic";

export default async function RisksPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await canViewEvent(id))) return null;
  const risks = await query<Risk & { owner: string | null; task_title: string | null; task_status: string | null }>(
    `SELECT r.*, u.name AS owner, t.title AS task_title, t.status AS task_status FROM risks r
     LEFT JOIN users u ON u.id = r.owner_id LEFT JOIN tasks t ON t.id = r.mitigation_task_id WHERE r.event_id = $1`,
    [id],
  );
  return <RiskBoard eventId={id} risks={risks} />;
}
