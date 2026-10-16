"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { BudgetBar } from "@/components/app/budget-bar";
import { cn } from "@/lib/utils";

type Risk = { id: string; category: string; score: number };

function Ring({ value, max, tone, children }: { value: number; max: number; tone: string; children: React.ReactNode }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const pct = max ? Math.min(1, value / max) : 0;
  return (
    <div className="relative size-[68px] shrink-0">
      <svg viewBox="0 0 64 64" className="size-full -rotate-90">
        <circle cx="32" cy="32" r={r} fill="none" stroke="#161514" strokeOpacity=".08" strokeWidth="7" />
        <motion.circle cx="32" cy="32" r={r} fill="none" stroke={tone} strokeWidth="7" strokeLinecap="round" strokeDasharray={c} initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c * (1 - pct) }} transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }} />
      </svg>
      <span className="absolute inset-0 grid place-items-center font-mono text-[12px] font-bold">{children}</span>
    </div>
  );
}

function Tile({ href, label, children, className, i }: { href: string; label: string; children: React.ReactNode; className?: string; i: number }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05, duration: 0.4 }} className={className}>
      <Link href={href} className="group block h-full rounded-xl border-[1.5px] border-ink bg-card p-4 transition-all hover:-translate-y-0.5 hover:shadow-[3px_3px_0_0_#161514]">
        <p className="mono-label text-[10px] text-muted-foreground transition-colors group-hover:text-ink">{label}</p>
        {children}
      </Link>
    </motion.div>
  );
}

/** Top of the overview: every number drawn, details on hover. */
export function OverviewStats(p: {
  id: string;
  money: { estimate: number; contingency: number; cap: number; approved: number | null; actual: number; alertPct: number };
  done: number;
  tasks: number;
  risks: Risk[];
  going: number;
  seats: number;
  backstage: number;
}) {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
      <Tile i={0} href={`/events/${p.id}/budget`} label="Money" className="col-span-2">
        <BudgetBar {...p.money} compact />
      </Tile>
      <Tile i={1} href={`/events/${p.id}/tasks`} label="Tasks">
        <div className="mt-2 flex items-center gap-3">
          <Ring value={p.done} max={p.tasks} tone="#3b6cf6">{Math.round((p.done / Math.max(1, p.tasks)) * 100)}%</Ring>
          <span className="font-mono text-xs text-muted-foreground">{p.done}/{p.tasks}</span>
        </div>
      </Tile>
      <Tile i={2} href={`/events/${p.id}/registration`} label="Going">
        <div className="mt-2 flex items-center gap-3">
          <Ring value={p.going} max={p.seats} tone="#46a758">{p.going}</Ring>
          <span className="font-mono text-xs text-muted-foreground">/{p.seats}</span>
        </div>
      </Tile>
      <Tile i={3} href={`/events/${p.id}/risks`} label="Risks">
        <div className="mt-3 flex flex-wrap gap-1.5">
          {p.risks.map((r, i) => (
            <motion.span
              key={r.id}
              title={`${r.category}: ${r.score}`}
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2 + i * 0.04, type: "spring", stiffness: 400, damping: 20 }}
              className={cn("grid size-7 place-items-center rounded-md border-[1.5px] border-ink font-mono text-[11px] font-bold", r.score >= 12 ? "bg-tomato" : r.score >= 6 ? "bg-sun" : "bg-mint")}
            >
              {r.score}
            </motion.span>
          ))}
          {p.risks.length === 0 && <span className="font-mono text-xs text-muted-foreground">clear</span>}
        </div>
      </Tile>
      <Tile i={4} href="/approvals" label="Backstage">
        <div className="mt-2 flex items-end gap-2">
          <span className={cn("font-display text-[40px] font-bold leading-none", p.backstage ? "text-[#b4610a]" : "text-[#2a7e3b]")}>{p.backstage}</span>
          <span className="mb-1 flex gap-0.5">
            {Array.from({ length: Math.min(p.backstage, 6) }, (_, i) => (
              <motion.span key={i} initial={{ height: 0 }} animate={{ height: 10 + (i % 3) * 5 }} transition={{ delay: 0.3 + i * 0.05 }} className="w-1.5 rounded-sm bg-sun ring-1 ring-ink" />
            ))}
          </span>
        </div>
      </Tile>
    </div>
  );
}
