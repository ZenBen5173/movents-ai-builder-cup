"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowUpRight, ChevronDown } from "lucide-react";
import type { IconName } from "@/components/ep/icons";
import { MathCurveLoader } from "@/components/ui/math-curve-loader";
import { cn } from "@/lib/utils";
import { Pill } from "./ui";
import { Eyebrow, Icon, useRowIcon } from "@/components/ep/kit";
import type { AgentRun, AgentStep } from "@/lib/types";

const DOT: Record<string, string> = {
  ok: "bg-card",
  warn: "bg-tomato",
  fail: "bg-tomato-ink",
  blocked: "bg-sun",
  skipped: "bg-sand",
  running: "bg-card",
};

function StepRow({ step, index, last }: { step: AgentStep; index: number; last: boolean }) {
  const [open, setOpen] = useState(false);
  const ms = step.finished_at ? new Date(step.finished_at).getTime() - new Date(step.started_at).getTime() : null;
  const hot = Boolean(step.adapt) || step.validation?.some((v) => !v.passed);
  return (
    <motion.li layout initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }} className={cn("relative grid grid-cols-[32px_22px_1fr] gap-x-3 rounded-xl px-2", hot && "bg-sun-soft", step.status === "blocked" && "bg-[#fff8dc]")}>
      <span className="pt-3.5 font-mono text-xs text-muted-foreground">{String(index + 1).padStart(2, "0")}</span>
      <div className="relative flex justify-center">
        <span className={cn("absolute top-0 w-[1.5px] bg-ink", index === 0 ? "top-4" : "", last ? "h-4" : "bottom-0")} />
        <motion.span key={step.status} initial={{ scale: 0.4 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 500, damping: 18 }} className={cn("relative z-10 mt-[13px] grid size-[15px] place-items-center rounded-full border-[1.5px] border-ink", DOT[step.status])}>
          {step.status === "running" && <MathCurveLoader curve="rose" size={13} strokeWidth={1.4} speed={1.4} />}
        </motion.span>
      </div>
      <div className="min-w-0 border-b border-border/70 py-2.5">
        <button onClick={() => setOpen((o) => !o)} className="flex w-full flex-wrap items-center gap-2 text-left">
          <span className="font-display text-[17px] font-bold">{step.name}</span>
          <span className="rounded-md bg-ink/5 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">{step.tool}</span>
          {step.status !== "running" && step.status !== "ok" && <Pill status={step.status} />}
          <span className="ml-auto flex items-center gap-2 text-[11px] tabular text-muted-foreground">
            {ms !== null && `${(ms / 1000).toFixed(1)}s`}
            <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
          </span>
        </button>
        {step.summary && <p className="mt-0.5 text-sm text-ink/75">{step.summary}</p>}
        {step.validation && step.validation.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {step.validation.map((v, i) => (
              <motion.span key={v.check + i} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.04 }} title={v.detail} className={cn("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11.5px]", v.passed ? "bg-mint text-[#1f5c2b]" : "bg-peach text-tomato-ink")}>
                {v.passed ? "✓" : "✗"} {v.check}
                <span className="opacity-70">· {v.detail}</span>
              </motion.span>
            ))}
          </div>
        )}
        {step.adapt && (
          <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="mt-2 flex flex-wrap items-start gap-x-3 gap-y-1">
            <span className="mono-label shrink-0 pt-0.5 text-[10px] font-bold text-tomato-ink">Adapted</span>
            <span className="text-sm text-ink/80">{step.adapt}</span>
          </motion.div>
        )}
        <AnimatePresence initial={false}>
          {open && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
              <div className="mt-2 grid gap-2 md:grid-cols-2">
                {(["input", "output"] as const).map((k) => (
                  <pre key={k} className="max-h-64 overflow-auto rounded-lg border border-border bg-card p-2 text-[11px] scrollbar-thin">
                    <span className="mono-label text-[9px] text-tomato">{k} </span>
                    {JSON.stringify(step[k] ?? {}, null, 2)}
                  </pre>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.li>
  );
}

const OUT_ICON: Record<string, IconName> = { pdf: "file-text", docx: "file-type", xlsx: "file-spreadsheet", csv: "sheet", ics: "calendar-days", page: "layout-dashboard" };

function OutputRow({ label, href, kind }: { label: string; href: string; kind: string }) {
  const row = useRowIcon();
  return (
    <motion.li initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} layout>
      <a href={href} target={href.startsWith("/api/") ? "_blank" : undefined} onMouseEnter={row.onMouseEnter} onMouseLeave={row.onMouseLeave} className="group flex items-center gap-2.5 border-b border-ink/15 py-2 text-[13.5px] font-medium">
        <Icon ref={row.ref} name={OUT_ICON[kind] ?? "file"} size={15} manual />
        <span className="flex-1 transition-transform group-hover:translate-x-0.5">{label}</span>
        <ArrowUpRight className="size-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
      </a>
    </motion.li>
  );
}

export function RunTrace({ initial }: { initial: AgentRun & { by: string | null } }) {
  const [run, setRun] = useState(initial);
  useEffect(() => {
    if (run.status !== "running") return;
    const t = setInterval(async () => {
      const res = await fetch(`/api/runs/${run.id}`, { cache: "no-store" });
      if (res.ok) {
        const next = await res.json();
        setRun((prev) => ({ ...prev, ...next }));
      }
    }, 700);
    return () => clearInterval(t);
  }, [run.id, run.status]);

  const done = run.steps.filter((s) => s.status !== "running").length;
  const blocked = run.steps.filter((s) => s.status === "blocked").length;
  const adapted = run.steps.filter((s) => s.adapt).length;
  const checks = run.steps.flatMap((s) => s.validation ?? []);
  const expected = run.kind === "plan" ? 24 : 7;
  const pct = run.status === "running" ? Math.min(95, (done / expected) * 100) : 100;

  return (
    <div>
      <div className="mb-8">
        <Eyebrow>{run.source !== "builtin" ? "Agent run · AI assistant via MCP" : "Agent run · built-in executor"} · started by {run.by ?? ""}</Eyebrow>
        <h1 className="mt-3 font-display text-3xl font-bold leading-tight tracking-tight md:text-[40px]">“{run.prompt}”</h1>
        <div className="mt-5 flex items-center gap-3">
          <div className="relative h-2.5 flex-1 overflow-hidden rounded-full border-[1.5px] border-ink bg-card">
            <motion.div className="absolute inset-y-0 left-0 bg-tomato" animate={{ width: `${pct}%` }} transition={{ type: "spring", stiffness: 120, damping: 24 }} />
          </div>
          <Pill status={run.status === "done" ? "done" : run.status} />
        </div>
      </div>

      <div className="grid gap-10 lg:grid-cols-[1fr_300px]">
        <section>
          <div className="mb-2 flex items-end justify-between border-b-[1.5px] border-ink pb-2">
            <h2 className="font-display text-xl font-bold">The agent&apos;s run sheet</h2>
            <span className="mono-label text-[10px] text-muted-foreground">{done} steps · {checks.filter((c) => c.passed).length}/{checks.length} checks passed</span>
          </div>
          <ol className="space-y-0.5">
            {run.steps.map((s, i) => (
              <StepRow key={s.id} step={s} index={i} last={i === run.steps.length - 1} />
            ))}
          </ol>
          
        </section>

        <aside className="space-y-8">
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Steps", value: done },
              { label: "Adapted", value: adapted },
              { label: "Blocked", value: blocked },
            ].map((s) => (
              <div key={s.label} className="border-l-[1.5px] border-ink pl-3">
                <p className="mono-label text-[9px] text-muted-foreground">{s.label}</p>
                <p className="font-display text-3xl font-bold tabular">{s.value}</p>
              </div>
            ))}
          </div>

          {blocked > 0 && (
            <motion.div initial={{ opacity: 0, rotate: 0 }} animate={{ opacity: 1, rotate: 1.2 }} className="overflow-hidden rounded-2xl border-[1.5px] border-ink bg-card shadow-pop">
              <div className="mono-label flex items-center gap-2 bg-sun px-4 py-2.5 font-bold text-ink"><Icon name="lock" size={14} /> Backstage</div>
              <div className="p-4">
                <p className="font-display text-xl font-bold">Authorised only</p>
                
                <Link href="/approvals" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-tomato-ink underline-offset-4 hover:underline">
                  Open backstage inbox <ArrowUpRight className="size-3.5" />
                </Link>
              </div>
            </motion.div>
          )}

          <div className="rounded-2xl border-[1.5px] border-ink bg-tomato p-4">
            <p className="mono-label text-[11px] font-bold">You walk out with</p>
            <ul className="mt-2">
              
              <AnimatePresence>{run.outputs.map((o) => <OutputRow key={o.href} {...o} />)}</AnimatePresence>
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
