"use client";

import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { BadgeCheck, Ban, Bot, CalendarPlus, CreditCard, Download, FileText, LogIn, Mail, Rocket, ShieldAlert, UserCheck, Wallet } from "lucide-react";
import { ActivityFeed, type ActivityEvent } from "@/components/ui/activity-feed";
import type { AuditLog } from "@/lib/types";

const ICONS = {
  "approval.requested": ShieldAlert,
  "approval.approved": BadgeCheck,
  "approval.rejected": Ban,
  "email.speaker": Mail,
  "email.vendor": Mail,
  "email.faculty": Mail,
  "faculty.approved": BadgeCheck,
  "faculty.rejected": Ban,
  "calendar.push": CalendarPlus,
  "publish.luma": Rocket,
  "publish.meetup": Rocket,
  "budget.approve": Wallet,
  "budget.alert": ShieldAlert,
  "payment.deposit": CreditCard,
  "payment.deposit_paid": CreditCard,
  "speaker.confirm": UserCheck,
  "agent.run_completed": Bot,
  "event.created": FileText,
  "session.sign_in": LogIn,
};

const VERB: Record<string, string> = {
  "approval.requested": "was blocked and requested approval for",
  "approval.approved": "approved",
  "approval.rejected": "rejected",
  "email.speaker": "sent",
  "email.vendor": "sent",
  "email.faculty": "submitted to faculty:",
  "faculty.approved": "approved the proposal",
  "faculty.rejected": "rejected the proposal",
  "calendar.push": "pushed the timeline to calendar",
  "publish.luma": "published on Luma",
  "publish.meetup": "published on Meetup",
  "budget.approve": "approved the budget",
  "event.created": "created event",
  "agent.run_completed": "finished an agent run",
  "session.sign_in": "signed in",
};

export function AuditFeed({ rows }: { rows: (AuditLog & { event_title: string | null })[] }) {
  const [q, setQ] = useState("");
  const [view, setView] = useState<"feed" | "table">("feed");
  const filtered = useMemo(() => rows.filter((r) => !q || JSON.stringify(r).toLowerCase().includes(q.toLowerCase())), [rows, q]);
  const events: ActivityEvent[] = filtered.map((r) => ({
    id: r.id,
    type: r.action,
    who: r.actor,
    what: `${VERB[r.action] ?? r.action.replace(/[._]/g, " ")}${r.approved_by ? ` (approved by ${r.approved_by})` : ""}`,
    target: (r.details.title as string) ?? (r.details.speaker as string) ?? (r.details.vendor as string) ?? r.event_title ?? undefined,
    at: r.created_at,
  }));
  const csv = () => {
    const lines = [["time", "actor", "action", "event", "approved_by", "details"], ...filtered.map((r) => [r.created_at, r.actor, r.action, r.event_title ?? "", r.approved_by ?? "", JSON.stringify(r.details)])];
    const blob = new Blob([lines.map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "audit-log.csv";
    a.click();
  };
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 border-b-[1.5px] border-ink pb-3">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by person, action, detail…" className="h-8 flex-1 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus:ring-2 focus:ring-ring" />
        <div className="flex rounded-lg border border-border p-0.5 text-xs">
          {(["feed", "table"] as const).map((v) => (
            <button key={v} onClick={() => setView(v)} className="relative rounded-md px-2.5 py-1 capitalize">
              {view === v && <motion.span layoutId="audit-view" className="absolute inset-0 rounded-md bg-primary" />}
              <span className={`relative ${view === v ? "text-primary-foreground" : "text-muted-foreground"}`}>{v}</span>
            </button>
          ))}
        </div>
        <button onClick={csv} className="inline-flex h-8 items-center gap-1 rounded-lg border border-border px-2.5 text-xs hover:bg-accent"><Download className="size-3.5" />CSV</button>
        <span className="text-xs text-muted-foreground">{filtered.length} entries</span>
      </div>
      <div className="pt-5">
        {view === "feed" ? (
          <ActivityFeed events={events} icons={ICONS} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px] text-xs">
              <thead className="text-left text-muted-foreground">
                <tr className="border-b border-border"><th className="py-2 pr-3">When</th><th className="py-2 pr-3">Who</th><th className="py-2 pr-3">Action</th><th className="py-2 pr-3">Approved by</th><th className="py-2">Details</th></tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className="border-b border-border/50 align-top hover:bg-accent/40">
                    <td className="whitespace-nowrap py-1.5 pr-3 tabular">{new Date(r.created_at).toLocaleString("en-GB", { timeZone: "Asia/Kuala_Lumpur" })}</td>
                    <td className="py-1.5 pr-3 font-medium">{r.actor}</td>
                    <td className="py-1.5 pr-3 font-mono">{r.action}</td>
                    <td className="py-1.5 pr-3">{r.approved_by ?? ""}</td>
                    <td className="max-w-lg py-1.5 font-mono text-[11px] text-muted-foreground">{JSON.stringify(r.details).slice(0, 300)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
