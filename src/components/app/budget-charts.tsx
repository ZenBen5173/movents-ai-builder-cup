"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/lib/utils";

const rm = (n: number) => `RM${Math.round(n).toLocaleString("en-MY")}`;

type Slice = { key: string; label: string; value: number; color: string; pattern?: boolean };

/** Donut where the full circle is the whole; hover a slice for its amount. */
function Donut({ slices, total, center, sub }: { slices: Slice[]; total: number; center: string; sub: string }) {
  const [hover, setHover] = useState<string | null>(null);
  const R = 70;
  const C = 2 * Math.PI * R;
  let acc = 0;
  const active = slices.find((s) => s.key === hover);
  return (
    <div className="flex flex-col items-center gap-4 min-[420px]:flex-row min-[420px]:gap-6">
      <div className="relative size-[180px] shrink-0">
        <svg viewBox="0 0 180 180" className="size-full -rotate-90">
          <defs>
            <pattern id="hatch" width="6" height="6" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
              <rect width="6" height="6" fill="#ffb3a1" />
              <line x1="0" y1="0" x2="0" y2="6" stroke="#161514" strokeOpacity=".25" strokeWidth="2" />
            </pattern>
          </defs>
          <circle cx="90" cy="90" r={R} fill="none" stroke="#161514" strokeOpacity=".07" strokeWidth="26" />
          {slices.map((s, i) => {
            const frac = total ? Math.max(0, s.value) / total : 0;
            const len = frac * C;
            const off = acc;
            acc += len;
            return (
              <motion.circle
                key={s.key}
                cx="90"
                cy="90"
                r={R}
                fill="none"
                stroke={s.pattern ? "url(#hatch)" : s.color}
                strokeWidth={hover === s.key ? 32 : 26}
                strokeDasharray={`${len} ${C - len}`}
                initial={{ strokeDashoffset: C }}
                animate={{ strokeDashoffset: -off }}
                transition={{ duration: 0.9, delay: i * 0.08, ease: [0.16, 1, 0.3, 1] }}
                onMouseEnter={() => setHover(s.key)}
                onMouseLeave={() => setHover(null)}
                className="cursor-pointer transition-[stroke-width] duration-200"
              />
            );
          })}
        </svg>
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          <AnimatePresence mode="wait">
            <motion.div key={active?.key ?? "c"} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.15 }}>
              <p className="font-display text-2xl font-bold leading-none">{active ? rm(active.value) : center}</p>
              <p className="mono-label mt-1 text-[9.5px] text-muted-foreground">{active ? active.label : sub}</p>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
      <ul className="min-w-0 space-y-1.5">
        {slices.map((s) => (
          <li key={s.key} onMouseEnter={() => setHover(s.key)} onMouseLeave={() => setHover(null)} className={cn("flex cursor-default items-center gap-2 text-xs transition-opacity", hover && hover !== s.key && "opacity-40")}>
            <span className="size-3 shrink-0 rounded-sm border border-ink" style={s.pattern ? { backgroundImage: "repeating-linear-gradient(45deg,#ffb3a1 0 3px,#e0a093 3px 5px)" } : { background: s.color }} />
            <span className="whitespace-nowrap">{s.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const CAT_COLORS = ["#ff5a36", "#3b6cf6", "#ffd84d", "#46a758", "#c084fc", "#f59e0b", "#14b8a6"];

export function BudgetCharts({ cap, spent, planned, contingency, categories }: { cap: number; spent: number; planned: number; contingency: number; categories: { name: string; value: number }[] }) {
  const committed = Math.max(0, planned - spent);
  const free = Math.max(0, cap - planned - contingency);
  const used = cap ? Math.round((spent / cap) * 100) : 0;
  return (
    <div className="grid gap-8 md:grid-cols-2">
      <Donut
        total={Math.max(cap, planned + contingency)}
        center={`${used}%`}
        sub="spent"
        slices={[
          { key: "spent", label: "Spent", value: spent, color: "#ff5a36" },
          { key: "planned", label: "Planned, not spent", value: committed, color: "#ffd84d" },
          { key: "cont", label: "Contingency", value: contingency, color: "#ffb3a1", pattern: true },
          { key: "free", label: "Not allocated", value: free, color: "#d8f3dc" },
        ]}
      />
      <Donut
        total={categories.reduce((n, c) => n + c.value, 0)}
        center={rm(planned)}
        sub="planned"
        slices={categories.map((c, i) => ({ key: c.name, label: c.name, value: c.value, color: CAT_COLORS[i % CAT_COLORS.length] }))}
      />
    </div>
  );
}
