"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { Check, ChevronDown, Minus, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { addMitigationTask, createRisk, updateRisk } from "@/app/actions";
import { fireConfetti } from "@/components/ep/kit";
import { cn } from "@/lib/utils";
import type { Risk } from "@/lib/types";

type R = Risk & { owner: string | null; task_title: string | null; task_status: string | null };

const zone = (s: number) => (s >= 12 ? "bg-tomato" : s >= 6 ? "bg-sun" : "bg-mint");
const zoneSoft = (s: number) => (s >= 12 ? "bg-peach/70" : s >= 6 ? "bg-sun-soft" : "bg-mint/60");

function Matrix({ risks, focus, setFocus }: { risks: R[]; focus: string | null; setFocus: (id: string | null) => void }) {
  return (
    <div className="flex gap-3">
      <div className="flex flex-col justify-between py-1">
        <span className="mono-label -rotate-180 text-[9.5px] text-muted-foreground [writing-mode:vertical-rl]">Likelihood →</span>
      </div>
      <div className="flex-1">
        <div className="grid grid-cols-5 gap-1">
          {[5, 4, 3, 2, 1].map((l) =>
            [1, 2, 3, 4, 5].map((i) => {
              const here = risks.filter((r) => r.likelihood === l && r.impact === i && r.status !== "closed");
              return (
                <div key={`${l}-${i}`} className={cn("relative flex aspect-square flex-wrap content-start gap-1 rounded-md border border-ink/10 p-1", zoneSoft(l * i))}>
                  <span className="absolute bottom-0.5 right-1 font-mono text-[9px] text-ink/30">{l * i}</span>
                  {here.map((r, k) => (
                    <motion.button
                      key={r.id}
                      layoutId={`risk-dot-${r.id}`}
                      initial={{ scale: 0 }}
                      animate={{ scale: focus === r.id ? 1.25 : 1 }}
                      transition={{ type: "spring", stiffness: 400, damping: 18, delay: k * 0.04 }}
                      onMouseEnter={() => setFocus(r.id)}
                      onMouseLeave={() => setFocus(null)}
                      title={`${r.category}: ${r.description}`}
                      className={cn("grid size-6 place-items-center rounded-full border-[1.5px] border-ink text-[9px] font-bold", zone(r.likelihood * r.impact))}
                    >
                      {r.category.slice(0, 2).toUpperCase()}
                    </motion.button>
                  ))}
                </div>
              );
            }),
          )}
        </div>
        <p className="mono-label mt-1.5 text-center text-[9.5px] text-muted-foreground">Impact →</p>
      </div>
    </div>
  );
}

function Stepper({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <span className="inline-flex items-center rounded-md border border-ink/20">
      <button onClick={() => onChange(Math.max(1, value - 1))} className="grid size-6 place-items-center hover:bg-sand" aria-label="Lower"><Minus className="size-3" /></button>
      <span className="w-5 text-center font-mono text-xs">{value}</span>
      <button onClick={() => onChange(Math.min(5, value + 1))} className="grid size-6 place-items-center hover:bg-sand" aria-label="Higher"><Plus className="size-3" /></button>
    </span>
  );
}

function RiskRow({ r, focus, setFocus, eventId }: { r: R; focus: boolean; setFocus: (id: string | null) => void; eventId: string }) {
  const [, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState(false);
  const router = useRouter();
  const s = r.likelihood * r.impact;
  const act = (fn: () => Promise<{ ok: boolean; message?: string; error?: string } | { ok: true; message?: string } | { ok: false; error: string }>) =>
    start(async () => {
      const res = (await fn()) as { ok: boolean; message?: string; error?: string };
      if (!res.ok) toast.error(res.error);
      else if (res.message) toast.success(res.message);
      router.refresh();
    });
  const STATUS_DOT: Record<string, string> = { open: "bg-tomato", mitigating: "bg-sun", closed: "bg-[#46a758]" };
  return (
    <motion.li layout onMouseEnter={() => setFocus(r.id)} onMouseLeave={() => setFocus(null)} className={cn("border-b border-border transition-colors", focus && "bg-sand/40")}>
      <div className="flex items-center gap-3 py-2.5 pl-1 pr-1">
        <button onClick={() => setOpen((o) => !o)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
          <span className={cn("grid size-9 shrink-0 place-items-center rounded-lg border-[1.5px] border-ink font-display text-base font-bold", zone(s), r.status === "closed" && "opacity-40")}>{s}</span>
          <span className="min-w-0 flex-1">
            <span className={cn("block truncate text-[14.5px] font-semibold", r.status === "closed" && "text-muted-foreground line-through")}>{r.category}</span>
            <span className="block truncate text-xs text-muted-foreground">{r.description.split(".")[0]}</span>
          </span>
        </button>
        {r.task_title && (
          <span title={r.task_title.replace(/^Mitigate: /, "")} className={cn("grid size-5 shrink-0 place-items-center rounded-[5px] border-[1.5px] border-ink", r.task_status === "done" ? "bg-ink text-white" : "bg-sky")}>
            {r.task_status === "done" && <Check className="size-3" />}
          </span>
        )}
        <span title={r.status} className={cn("size-2.5 shrink-0 rounded-full ring-1 ring-ink", STATUS_DOT[r.status] ?? "bg-sand")} />
        <span title={r.owner ?? "No owner"} className="grid size-7 shrink-0 place-items-center rounded-full border-[1.5px] border-ink bg-sand font-display text-[10px] font-bold">
          {r.owner ? r.owner.split(/\s+/).slice(0, 2).map((w) => w[0]).join("") : "?"}
        </span>
        <button onClick={() => { setEdit((e) => !e); setOpen(true); }} aria-label="Edit" className={cn("grid size-8 shrink-0 place-items-center rounded-lg border-[1.5px] transition-all", edit ? "border-ink bg-ink text-white" : "border-transparent text-muted-foreground hover:rotate-[-8deg] hover:border-ink hover:text-ink")}>
          <Pencil className="size-3.5" />
        </button>
        <button onClick={() => setOpen((o) => !o)} aria-label="Expand" className="grid size-8 shrink-0 place-items-center text-muted-foreground hover:text-ink">
          <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
        </button>
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="grid gap-4 pb-4 pl-[3.25rem] pr-2 text-sm md:grid-cols-2">
              <div className="space-y-2">
                <p className="text-ink/85">{r.description}</p>
                <p><span className="mono-label mr-1.5 text-[9.5px] text-muted-foreground">Prevent</span>{r.mitigation}</p>
                {r.contingency && <p><span className="mono-label mr-1.5 text-[9.5px] text-muted-foreground">Plan B</span>{r.contingency}</p>}
                {r.task_title ? (
                  <a href={`/events/${eventId}/tasks`} className="inline-flex items-center gap-1.5 rounded-md bg-sky/60 px-2 py-0.5 text-xs hover:bg-sky">
                    {r.task_title.replace(/^Mitigate: /, "")}
                  </a>
                ) : (
                  <button onClick={() => act(() => addMitigationTask(r.id))} className="text-xs font-semibold text-tomato-ink hover:underline">+ Task</button>
                )}
              </div>
              {edit && (
                <motion.div initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} className="flex flex-wrap content-start items-center gap-3 rounded-xl border-[1.5px] border-ink bg-card p-3 text-xs">
                  <span className="flex items-center gap-1.5">Likelihood <Stepper value={r.likelihood} onChange={(n) => act(() => updateRisk(r.id, { likelihood: n }))} /></span>
                  <span className="flex items-center gap-1.5">Impact <Stepper value={r.impact} onChange={(n) => act(() => updateRisk(r.id, { impact: n }))} /></span>
                  <select
                    value={r.status}
                    onChange={(e) =>
                      act(async () => {
                        const res = await updateRisk(r.id, { status: e.target.value });
                        if (res.ok && e.target.value === "closed") fireConfetti();
                        return res;
                      })
                    }
                    className="h-7 rounded-md border border-ink/20 bg-card px-1.5"
                  >
                    <option value="open">Open</option>
                    <option value="mitigating">Mitigating</option>
                    <option value="closed">Closed</option>
                  </select>
                </motion.div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.li>
  );
}

function AddRisk({ eventId }: { eventId: string }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ category: "", description: "", likelihood: 3, impact: 3, mitigation: "" });
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-ink px-3.5 text-sm font-medium text-white shadow-[2px_2px_0_0_#ff5a36]"><Plus className={cn("size-4 transition-transform", open && "rotate-45")} />Risk</button>
      <AnimatePresence>
        {open && (
          <motion.form
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            onSubmit={(e) => {
              e.preventDefault();
              start(async () => {
                const r = await createRisk(eventId, f);
                if (!r.ok) return void toast.error(r.error);
                setOpen(false);
                router.refresh();
              });
            }}
            className="absolute right-0 top-full z-30 mt-2 w-80 space-y-2 rounded-2xl border-[1.5px] border-ink bg-card p-3 shadow-[4px_4px_0_0_#161514]"
          >
            <input placeholder="Category (e.g. Transport)" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} className="h-9 w-full rounded-lg border-[1.5px] border-ink/20 px-2.5 text-sm outline-none focus:border-ink" />
            <textarea placeholder="What could go wrong?" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} rows={2} className="w-full rounded-lg border-[1.5px] border-ink/20 p-2.5 text-sm outline-none focus:border-ink" />
            <textarea placeholder="How we prevent it" value={f.mitigation} onChange={(e) => setF({ ...f, mitigation: e.target.value })} rows={2} className="w-full rounded-lg border-[1.5px] border-ink/20 p-2.5 text-sm outline-none focus:border-ink" />
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5">Likelihood <Stepper value={f.likelihood} onChange={(n) => setF({ ...f, likelihood: n })} /></span>
              <span className="flex items-center gap-1.5">Impact <Stepper value={f.impact} onChange={(n) => setF({ ...f, impact: n })} /></span>
            </div>
            <button disabled={pending} className="h-9 w-full rounded-lg bg-tomato text-sm font-semibold">{pending ? "Adding…" : "Add risk"}</button>
          </motion.form>
        )}
      </AnimatePresence>
    </div>
  );
}

export function RiskBoard({ eventId, risks }: { eventId: string; risks: R[] }) {
  const [focus, setFocus] = useState<string | null>(null);
  const live = risks.filter((r) => r.status !== "closed");
  const sorted = [...risks].sort((a, b) => Number(a.status === "closed") - Number(b.status === "closed") || b.likelihood * b.impact - a.likelihood * a.impact);
  return (
    <div className="space-y-12">
      <div className="grid gap-10 lg:grid-cols-[340px_1fr]">
        <div>
          <div className="mb-3 flex items-end justify-between">
            <h2 className="mono-label font-bold">Heat map</h2>
            <span className="font-mono text-xs text-muted-foreground">{live.length}/{risks.length}</span>
          </div>
          <Matrix risks={risks} focus={focus} setFocus={setFocus} />
        </div>
        <div>
          <div className="mb-1 flex items-end justify-between border-b-[1.5px] border-ink pb-2">
            <h2 className="font-display text-xl font-bold">Risk register</h2>
            <AddRisk eventId={eventId} />
          </div>
          <ul className="mt-3 rounded-xl border-[1.5px] border-ink bg-card px-2">{sorted.map((r) => <RiskRow key={r.id} r={r} focus={focus === r.id} setFocus={setFocus} eventId={eventId} />)}</ul>
          <div className="mt-3 flex gap-3 text-xs">
            <a href={`/api/outputs/${eventId}/risks.xlsx`} className="font-semibold text-tomato-ink hover:underline">Download .xlsx</a>
            <a href={`/api/outputs/${eventId}/risks.pdf`} target="_blank" className="font-semibold text-tomato-ink hover:underline">Download .pdf</a>
          </div>
        </div>
      </div>
    </div>
  );
}
