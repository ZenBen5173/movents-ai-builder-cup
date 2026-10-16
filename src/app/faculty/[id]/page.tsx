import { notFound } from "next/navigation";
import { FileText } from "lucide-react";
import { one } from "@/lib/db";
import { verifyToken, fmtDate, fmtRM, outputsUrl } from "@/lib/appurl";
import type { ApprovalRequest, EventRow } from "@/lib/types";
import { FacultyDecision } from "./decision";
import { BrandMark } from "@/components/app/brand-mark";

export const dynamic = "force-dynamic";
export const metadata = { title: "Proposal approval" };

export default async function FacultyPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ t?: string; d?: string }> }) {
  const { id } = await params;
  const { t, d } = await searchParams;
  const req = await one<ApprovalRequest>("SELECT * FROM approval_requests WHERE id = $1", [id]);
  if (!req || req.action_type !== "email.faculty") notFound();
  const valid = verifyToken(`faculty:${id}`, t);
  const ev = req.event_id ? await one<EventRow & { venue: string | null; society: string }>("SELECT e.*, v.name AS venue, s.name AS society FROM events e LEFT JOIN venues v ON v.id = e.venue_id JOIN societies s ON s.id = e.society_id WHERE e.id = $1", [req.event_id]) : null;
  return (
    <div className="mx-auto min-h-dvh max-w-xl px-5 py-12">
          <BrandMark />
      <p className="text-sm font-medium text-primary">Faculty advisor approval</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">{ev?.title ?? req.title}</h1>
      {ev && (
        <p className="mt-1 text-sm text-muted-foreground">
          {ev.society} · {fmtDate(ev.date)} · {ev.start_time} to {ev.end_time} · {ev.venue ?? "venue TBC"} · {ev.pax} pax · budget cap {fmtRM(ev.budget_cap)}
        </p>
      )}
      {ev && (
        <div className="mt-5 grid gap-2 sm:grid-cols-3">
          {[["Proposal (PDF)", "proposal.pdf"], ["Budget sheet", "budget.xlsx"], ["Risk register", "risks.pdf"]].map(([l, f]) => (
            <a key={f} href={valid ? outputsUrl(ev.id, f, 1) : "#"} target="_blank" className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2.5 text-sm transition-colors hover:border-primary/40">
              <FileText className="size-4 text-primary" />{l}
            </a>
          ))}
        </div>
      )}
      {!valid ? (
        <p className="mt-8 rounded-xl border border-[var(--red-6)] bg-[var(--red-2)] p-4 text-sm text-[var(--red-11)]">This link is invalid. Please use the link from the approval email.</p>
      ) : req.status !== "awaiting_faculty" ? (
        <p className="mt-8 rounded-xl border border-border bg-card p-4 text-sm">
          This submission is <b>{req.status === "executed" ? "approved" : req.status.replace("_", " ")}</b>
          {req.result && (req.result as Record<string, unknown>).faculty_decided_at ? ` (decided ${new Date(String((req.result as Record<string, unknown>).faculty_decided_at)).toLocaleString("en-GB", { timeZone: "Asia/Kuala_Lumpur" })})` : ""}.
        </p>
      ) : (
        <FacultyDecision id={id} token={t!} preselect={d === "approve" || d === "reject" ? d : null} />
      )}
    </div>
  );
}
