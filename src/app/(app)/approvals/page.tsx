import { pageUser } from "@/lib/guard";
import { visibleSql } from "@/lib/members";
import { query } from "@/lib/db";
import { canDecide } from "@/lib/rbac";
import { Empty, PageHeader } from "@/components/app/ui";
import { ApprovalList } from "@/components/app/approval-list";
import type { ApprovalItem } from "@/components/app/approval-detail";
import { Wristband } from "@/components/ep/kit";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { ApprovalRequest, Role } from "@/lib/types";

export const dynamic = "force-dynamic";

const BANDS: { role: Role; who: string; can: string }[] = [
  { role: "president", who: "President / VP", can: "Approves everything" },
  { role: "director", who: "Director", can: "Own department" },
  { role: "faculty_advisor", who: "Faculty advisor", can: "Proposal sign off" },
  { role: "committee", who: "Committee", can: "Draft only" },
];

type Row = ApprovalRequest & { requester: string | null; decider: string | null; event_title: string | null; vendor_name: string | null; speaker_name: string | null; reason: string | null };

export default async function BackstagePage() {
  const user = await pageUser();
  const rows = await query<Row>(
    `SELECT a.*, u.name AS requester, d.name AS decider, e.title AS event_title, v.name AS vendor_name, s.name AS speaker_name,
       (SELECT l.details->>'reason' FROM audit_logs l WHERE l.action = 'approval.requested' AND l.details->>'approval_id' = a.id ORDER BY l.created_at LIMIT 1) AS reason
     FROM approval_requests a
     LEFT JOIN users u ON u.id = a.requested_by LEFT JOIN users d ON d.id = a.decided_by LEFT JOIN events e ON e.id = a.event_id
     LEFT JOIN vendors v ON v.id = a.payload->>'vendor_id' LEFT JOIN speakers s ON s.id = a.payload->>'speaker_id'
     WHERE a.society_id = $1 AND ($2 OR a.requested_by = $3 OR (e.id IS NOT NULL AND ${visibleSql(user, 3)}))
     ORDER BY CASE a.status WHEN 'pending' THEN 0 WHEN 'awaiting_faculty' THEN 1 ELSE 2 END, a.created_at DESC LIMIT 200`,
    [user.society_id, user.role !== "committee", user.id],
  );
  const items: ApprovalItem[] = rows.map((r) => ({
    ...r,
    created_at: new Date(r.created_at).toISOString(),
    decided_at: r.decided_at ? new Date(r.decided_at).toISOString() : null,
    canDecide: r.status === "pending" && canDecide(user, r),
    canFaculty: r.status === "awaiting_faculty" && user.role === "faculty_advisor",
    preview: typeof r.payload.html === "string" ? String(r.payload.html) : null,
  }));
  const isMine = (role: Role) => role === user.role || (role === "president" && user.role === "vp");
  return (
    <div>
      <PageHeader
        eyebrow="Approvals"
        title="Backstage"
        actions={BANDS.map((b) => (
          <Tooltip key={b.role}>
            <TooltipTrigger asChild>
              <span className={`inline-flex cursor-default transition-all hover:-translate-y-0.5 ${isMine(b.role) ? "" : "opacity-45 hover:opacity-100"}`}>
                <Wristband role={b.role} size={isMine(b.role) ? "md" : "sm"} />
              </span>
            </TooltipTrigger>
            <TooltipContent>
              <b>{b.who}</b>: {b.can}
              {isMine(b.role) ? " (you)" : ""}
            </TooltipContent>
          </Tooltip>
        ))}
      />
      {items.length === 0 ? <Empty title="Nobody at the door" /> : <ApprovalList items={items} />}
    </div>
  );
}
