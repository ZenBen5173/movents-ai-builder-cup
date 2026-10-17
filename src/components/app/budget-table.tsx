"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { ExternalLink, Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { addBudgetLine, removeBudgetLine, setActual, setFunding, updateBudgetLine } from "@/app/actions";
import { cn } from "@/lib/utils";
import type { BudgetLine } from "@/lib/types";

const rm = (n: number | null | undefined) => (n == null ? "" : n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const FUNDING = ["Society fund", "Student LIFE subsidy", "Faculty grant", "Sponsorship", "Ticket sales"];
const CATEGORIES = ["Food & beverage", "Venue", "Merchandise", "Speakers", "Marketing", "Logistics", "AV / Tech", "Prizes", "Other"];

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

/** Click to edit in place; Enter or leaving the field saves, Esc cancels. */
function Editable({ value, onSave, numeric, className, label }: { value: string; onSave: (v: string) => Promise<void>; numeric?: boolean; className?: string; label: string }) {
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState(value);
  const [pending, start] = useTransition();
  if (!editing)
    return (
      <button
        type="button"
        onClick={() => {
          setV(value);
          setEditing(true);
        }}
        title={`Edit ${label}`}
        className={cn("rounded px-1 -mx-1 text-left decoration-tomato/60 decoration-dashed underline-offset-4 transition-colors hover:bg-tomato/10 hover:underline", pending && "opacity-50", className)}
      >
        {value || <span className="text-muted-foreground">add</span>}
      </button>
    );
  const save = () => {
    setEditing(false);
    if (v.trim() === value.trim()) return;
    start(() => onSave(v.trim()));
  };
  return (
    <input
      autoFocus
      aria-label={label}
      value={v}
      inputMode={numeric ? "decimal" : undefined}
      onChange={(e) => setV(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => {
        if (e.key === "Enter") save();
        if (e.key === "Escape") setEditing(false);
      }}
      className={cn("h-7 rounded-md border border-ink/30 bg-card px-1.5 outline-none focus:border-ink", numeric ? "w-20 text-right tabular" : "w-full", className)}
    />
  );
}

/** One row at the foot of the table to add your own item. */
function AddLine({ eventId }: { eventId: string }) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState("Other");
  const [description, setDescription] = useState("");
  const [qty, setQty] = useState("1");
  const [unit, setUnit] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const total = (Number(qty) || 0) * (Number(unit) || 0);
  function save() {
    start(async () => {
      const r = await addBudgetLine(eventId, { category, description, qty: Number(qty), unit_cost: Number(unit) });
      if (!r.ok) return void toast.error(r.error);
      toast.success(r.message ?? "Added");
      setDescription("");
      setQty("1");
      setUnit("");
      router.refresh();
    });
  }
  if (!open)
    return (
      <tr>
        <td colSpan={7} className="py-2">
          <motion.button type="button" whileHover={{ x: 2 }} onClick={() => setOpen(true)} className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-medium text-tomato-ink transition-colors hover:bg-tomato/10">
            <Plus className="size-4" /> Add an item
          </motion.button>
        </td>
      </tr>
    );
  return (
    <motion.tr initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="border-b border-border bg-sun-soft/40">
      <td className="py-2 pr-3">
        <div className="flex flex-col gap-1">
          <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category" className="h-7 w-40 rounded-md border border-border bg-card px-1 text-xs">
            {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
          <input autoFocus value={description} onChange={(e) => setDescription(e.target.value)} onKeyDown={(e) => e.key === "Enter" && save()} placeholder="e.g. Photographer, prizes, transport" className="h-8 w-full rounded-md border border-border bg-card px-2 text-sm outline-none focus:border-ink" />
        </div>
      </td>
      <td className="py-2 pr-3 text-right"><input value={qty} onChange={(e) => setQty(e.target.value)} inputMode="numeric" aria-label="Quantity" className="h-8 w-16 rounded-md border border-border bg-card px-2 text-right tabular outline-none focus:border-ink" /></td>
      <td className="py-2 pr-3 text-right"><input value={unit} onChange={(e) => setUnit(e.target.value)} onKeyDown={(e) => e.key === "Enter" && save()} inputMode="decimal" placeholder="0.00" aria-label="Unit price in RM" className="h-8 w-24 rounded-md border border-border bg-card px-2 text-right tabular outline-none focus:border-ink" /></td>
      <td className="py-2 pr-3 text-right tabular text-muted-foreground">{total ? rm(total) : ""}</td>
      <td colSpan={3} className="py-2">
        <div className="flex items-center justify-end gap-1.5">
          <button type="button" onClick={() => setOpen(false)} className="h-8 rounded-lg px-2 text-xs text-muted-foreground hover:text-ink">Cancel</button>
          <motion.button type="button" whileTap={{ scale: 0.95 }} disabled={pending || !description.trim() || !unit} onClick={save} className="flex h-8 items-center gap-1.5 rounded-lg border-[1.5px] border-ink bg-tomato px-3 text-xs font-semibold shadow-[2px_2px_0_0_#161514] disabled:opacity-40">
            {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />} Add
          </motion.button>
        </div>
      </td>
    </motion.tr>
  );
}

export function BudgetTable({ eventId, lines, totals }: { eventId: string; lines: (BudgetLine & { vendor: string | null })[]; totals: { subtotal: number; contingency: number; total: number; actual: number; cap: number; pct: number } }) {
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
            const saveLine = async (patch: Parameters<typeof updateBudgetLine>[1]) => {
              const r = await updateBudgetLine(l.id, patch);
              if (!r.ok) toast.error(r.error);
              router.refresh();
            };
            return (
              <motion.tr key={l.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.03 }} className="group border-b border-border/60 hover:bg-accent/40">
                <td className="py-2 pr-3">
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{l.category}</div>
                  <div className="flex items-center gap-1.5">
                    <Editable label="item" value={l.description} onSave={(v) => saveLine({ description: v })} />
                    {l.custom && <span className="shrink-0 rounded bg-ink/5 px-1 text-[10px] text-muted-foreground">{l.line_key ? "edited by you" : "added by you"}</span>}
                    {(
                      <button
                        type="button"
                        title="Remove this item"
                        aria-label={`Remove ${l.description}`}
                        onClick={async () => {
                          const r = await removeBudgetLine(l.id);
                          if (!r.ok) toast.error(r.error);
                          router.refresh();
                        }}
                        className="opacity-0 transition-opacity group-hover:opacity-100"
                      >
                        <X className="size-3.5 text-muted-foreground hover:text-ink" />
                      </button>
                    )}
                    {l.source_url && (
                      <a href={l.source_url} target="_blank" rel="noreferrer" className="opacity-0 transition-opacity group-hover:opacity-100" title="Supplier quote">
                        <ExternalLink className="size-3.5 text-primary" />
                      </a>
                    )}
                  </div>
                </td>
                <td className="py-2 pr-3 text-right tabular"><Editable numeric label="quantity" value={String(l.qty)} onSave={(v) => saveLine({ qty: Number(v) })} /></td>
                <td className="py-2 pr-3 text-right tabular"><Editable numeric label="unit price" value={rm(l.unit_cost)} onSave={(v) => saveLine({ unit_cost: Number(v.replace(/,/g, "")) })} /></td>
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
          <AddLine eventId={eventId} />
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
