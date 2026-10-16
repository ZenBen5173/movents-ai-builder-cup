"use client";

import { motion } from "motion/react";
import { cn } from "@/lib/utils";

const rm = (n: number) => `RM${n.toLocaleString("en-MY", { maximumFractionDigits: 2 })}`;

/** A segment that explains itself on hover instead of in text. */
function Seg({ left, width, tip, className, delay = 0 }: { left: string; width: string; tip: string; className: string; delay?: number }) {
  return (
    <motion.div initial={{ width: 0, left }} animate={{ width, left }} transition={{ duration: 0.8, delay, ease: [0.16, 1, 0.3, 1] }} className={cn("group/seg absolute inset-y-0", className)}>
      <span className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 -translate-x-1/2 whitespace-nowrap rounded-lg border-[1.5px] border-ink bg-card px-2 py-1 text-xs font-medium opacity-0 shadow-[2px_2px_0_0_#161514] transition-opacity group-hover/seg:opacity-100">{tip}</span>
    </motion.div>
  );
}

function Mark({ left, tip, dashed }: { left: string; tip: string; dashed?: boolean }) {
  return (
    <div className="group/mark absolute -inset-y-1 z-10 w-3 -translate-x-1/2 cursor-default" style={{ left }}>
      <span className={cn("absolute inset-y-0 left-1/2 -translate-x-1/2", dashed ? "w-0 border-l-[1.5px] border-dashed border-ink/60" : "w-0.5 bg-ink")} />
      <span className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 -translate-x-1/2 whitespace-nowrap rounded-lg border-[1.5px] border-ink bg-card px-2 py-1 text-xs font-medium opacity-0 shadow-[2px_2px_0_0_#161514] transition-opacity group-hover/mark:opacity-100">{tip}</span>
    </div>
  );
}

/** Planned vs cap, and spent vs approved. Numbers live in hover tips. */
export function BudgetBar({ estimate, contingency, cap, approved, actual, alertPct, compact }: { estimate: number; contingency: number; cap: number; approved: number | null; actual: number; alertPct: number; compact?: boolean }) {
  const max = Math.max(cap, estimate + contingency, actual, approved ?? 0) * 1.04 || 1;
  const pct = (n: number) => `${(n / max) * 100}%`;
  const base = approved ?? cap;
  const alert = base * (alertPct / 100);
  const alerting = actual >= alert && actual > 0;
  return (
    <div className={compact ? "space-y-3 pt-4" : "space-y-6 pt-6"}>
      <div className="flex items-center gap-4">
        <span className={cn("shrink-0 font-display font-bold", compact ? "w-[4.5rem] text-sm" : "w-24 text-lg")}>{rm(cap)}</span>
        <div className={cn("relative flex-1 rounded-full border-[1.5px] border-ink bg-card", compact ? "h-4" : "h-6")}>
          <div className="absolute inset-0 overflow-hidden rounded-full">
            <Seg left="0%" width={pct(estimate)} tip={`Planned ${rm(estimate)}`} className="bg-tomato hover:brightness-95" />
            <Seg left={pct(estimate)} width={pct(contingency)} delay={0.15} tip={`Contingency ${rm(contingency)}`} className="bg-tomato/35 [background-image:repeating-linear-gradient(45deg,transparent_0_4px,rgba(22,21,20,.18)_4px_6px)] hover:bg-tomato/50" />
          </div>
          <Mark left={pct(cap)} tip={`Cap ${rm(cap)}`} />
        </div>
      </div>
      <div className="flex items-center gap-4">
        <span className={cn("mono-label shrink-0 text-[10px] text-muted-foreground", compact ? "w-[4.5rem]" : "w-24")}>Spent</span>
        <div className={cn("relative flex-1 rounded-full border-[1.5px] border-ink bg-card", compact ? "h-4" : "h-6")}>
          <div className="absolute inset-0 overflow-hidden rounded-full">
            <Seg left="0%" width={pct(actual)} tip={`Spent ${rm(actual)}`} className={cn(alerting ? "bg-sun" : "bg-[#46a758]")} />
          </div>
          <Mark left={pct(alert)} tip={`${alertPct}% alert at ${rm(alert)}`} dashed />
          <Mark left={pct(base)} tip={`${approved ? "Approved" : "Cap"} ${rm(base)}`} />
        </div>
      </div>
    </div>
  );
}
