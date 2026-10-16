"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { setActual, setFunding } from "@/app/actions";
import { cn } from "@/lib/utils";
import type { BudgetLine } from "@/lib/types";

const rm = (n: number | null | undefined) => (n == null ? "" : n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const FUNDING = ["Society fund", "Student LIFE subsidy", "Faculty grant", "Sponsorship", "Ticket sales"];

function ActualCell({ line }: { line: BudgetLine }) {
  const [v, setV] = useState(line.actual?.toString() ?? "");
  const [pending, start] = useTransition();
  const router = useRouter();
  const save = () => {
    const n = v.trim() === "" ? null : Number(v);
    if (n !== null && Number.isNaN(n)) return toast.error("Enter a number");
    if (n === line.actual) return;
    start(async () => {
      const r = await setActual(line.id, n);
      if (!r.ok) toast.error(r.error);
      else if (r.message) toast.warning(r.message);
      router.refresh();
    });
  };
  return (
    <div className="relative">
      <input
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        placeholder=""
        inputMode="decimal"
        className="h-7 w-24 rounded-md border border-transparent bg-transparent px-2 text-right tabular outline-none transition-colors hover:border-border focus:border-ring focus:bg-card"
      />
      {pending && <Loader2 className="absolute -left-4 top-1.5 size-3.5 animate-spin text-muted-foreground" />}
    </div>
  );
}

export function BudgetTable({ lines, totals }: { lines: (BudgetLine & { vendor: string | null })[]; totals: { subtotal: number; contingency: number; total: number; actual: number; cap: number; pct: number } }) {
  const router = useRouter();
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-sm">
        <thead className="text-left text-xs text-muted-foreground">
          <tr className="border-b border-border">
            <th className="py-2 pr-3 font-medium">Item</th>
            <th className="py-2 pr-3 text-right font-medium">Qty</th>
            <th className="py-2 pr-3 text-right font-medium">Unit (RM)</th>
            <th className="py-2 pr-3 text-right font-medium">Estimated</th>
            <th className="py-2 pr-3 text-right font-medium">Actual</th>
            <th className="py-2 pr-3 text-right font-medium">Variance</th>
            <th className="py-2 font-medium">Funding</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => {
            const variance = l.actual != null ? l.actual - l.estimated : null;
            return (
              <motion.tr key={l.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.03 }} className="group border-b border-border/60 hover:bg-accent/40">
                <td className="py-2 pr-3">
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{l.category}</div>
                  <div className="flex items-center gap-1.5">
                    {l.description}
                    {l.source_url && (
                      <a href={l.source_url} target="_blank" rel="noreferrer" className="opacity-0 transition-opacity group-hover:opacity-100" title="Supplier quote">
                        <ExternalLink className="size-3.5 text-primary" />
                      </a>
                    )}
                  </div>
                </td>
                <td className="py-2 pr-3 text-right tabular">{l.qty}</td>
                <td className="py-2 pr-3 text-right tabular">{rm(l.unit_cost)}</td>
                <td className="py-2 pr-3 text-right tabular">{rm(l.estimated)}</td>
                <td className="py-2 pr-3 text-right"><div className="flex justify-end"><ActualCell line={l} /></div></td>
                <td className={cn("py-2 pr-3 text-right tabular", variance != null && variance > 0 && "text-[var(--red-11)]", variance != null && variance < 0 && "text-[var(--grass-11)]")}>{variance == null ? "" : `${variance > 0 ? "+" : ""}${rm(variance)}`}</td>
                <td className="py-2">
                  <select
                    defaultValue={l.funding_source}
                    onChange={async (e) => {
                      await setFunding(l.id, e.target.value);
                      router.refresh();
                    }}
                    className="h-7 rounded-md border border-transparent bg-transparent px-1 text-xs hover:border-border"
                  >
                    {[...new Set([l.funding_source, ...FUNDING])].map((f) => <option key={f}>{f}</option>)}
                  </select>
                </td>
              </motion.tr>
            );
          })}
        </tbody>
        <tfoot className="border-t-[1.5px] border-ink bg-sand/50 text-sm [&_td:first-child]:pl-3">
          <tr><td colSpan={3} className="py-1.5 pr-3 text-right text-muted-foreground">Subtotal</td><td className="py-1.5 pr-3 text-right tabular">{rm(totals.subtotal)}</td><td className="py-1.5 pr-3 text-right tabular">{rm(totals.actual)}</td><td colSpan={2} /></tr>
          <tr><td colSpan={3} className="py-1.5 pr-3 text-right text-muted-foreground">Contingency ({totals.pct}%)</td><td className="py-1.5 pr-3 text-right tabular">{rm(totals.contingency)}</td><td colSpan={3} /></tr>
          <tr className="font-semibold"><td colSpan={3} className="py-1.5 pr-3 text-right">Total vs cap</td><td className={cn("py-1.5 pr-3 text-right tabular", totals.total <= totals.cap ? "text-[var(--grass-11)]" : "text-[var(--red-11)]")}>{rm(totals.total)}</td><td colSpan={3} className="py-1.5 text-xs font-normal text-muted-foreground">cap RM{rm(totals.cap)} · {totals.total <= totals.cap ? "within budget ✓" : "over budget"}</td></tr>
        </tfoot>
      </table>
    </div>
  );
}
