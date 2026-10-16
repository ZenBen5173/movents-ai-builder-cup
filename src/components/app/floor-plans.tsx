"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";

/**
 * Floor plans drawn from the society's own sketches. Hover a table or
 * fixture to see what it is; tables pop in one cluster at a time.
 */

type Table = { x: number; y: number; w?: number; h?: number };
type Chair = { x: number; y: number };
type Cluster = { id: string; label: string; tables: Table[]; chairs: Chair[] };

const T = 44; // table size

// Chairs around a row of tables: top/bottom per table, plus ends.
function row(x0: number, y: number, n: number, opts: { top?: number; bottom?: number; ends?: number } = {}): { tables: Table[]; chairs: Chair[] } {
  const tables: Table[] = [];
  const chairs: Chair[] = [];
  const gap = 12;
  for (let i = 0; i < n; i++) {
    const x = x0 + i * (T + gap);
    tables.push({ x, y });
    const per = (k: number) => Array.from({ length: k }, (_, j) => x + ((j + 1) * T) / (k + 1));
    for (const cx of per(opts.top ?? 0)) chairs.push({ x: cx, y: y - 13 });
    for (const cx of per(opts.bottom ?? 0)) chairs.push({ x: cx, y: y + T + 13 });
  }
  const ends = opts.ends ?? 0;
  const xr = x0 + n * (T + gap) - gap;
  for (let j = 0; j < ends; j++) {
    const cy = y + ((j + 1) * T) / (ends + 1);
    chairs.push({ x: x0 - 13, y: cy }, { x: xr + 13, y: cy });
  }
  return { tables, chairs };
}

function column(x: number, y0: number, n: number, sides: number): { tables: Table[]; chairs: Chair[] } {
  const tables: Table[] = [];
  const chairs: Chair[] = [];
  for (let i = 0; i < n; i++) {
    const y = y0 + i * (T + 12);
    tables.push({ x, y });
    for (let j = 0; j < sides; j++) {
      const cy = y + ((j + 1) * T) / (sides + 1);
      chairs.push({ x: x - 13, y: cy }, { x: x + T + 13, y: cy });
    }
  }
  chairs.push({ x: x + T / 3, y: y0 - 14 }, { x: x + (2 * T) / 3, y: y0 - 14 });
  const yb = y0 + n * (T + 12) - 12;
  chairs.push({ x: x + T / 3, y: yb + 14 }, { x: x + (2 * T) / 3, y: yb + 14 });
  return { tables, chairs };
}

const r1 = row(290, 205, 4, { top: 2, bottom: 2, ends: 2 });
r1.chairs.push({ x: 396, y: 192 });
const r2 = row(290, 325, 4, { top: 2, bottom: 2, ends: 2 });
r2.chairs.push({ x: 396, y: 312 });
const left = column(118, 130, 4, 2);
const lower = column(210, 450, 2, 2);

const ROOFTOP: Cluster[] = [
  { id: "top", label: "Lounge pair", tables: [{ x: 245, y: 40 }, { x: 295, y: 40 }], chairs: [{ x: 255, y: 27 }, { x: 278, y: 27 }, { x: 305, y: 27 }, { x: 328, y: 27 }] },
  { id: "left", label: "West banquet", ...left },
  { id: "r1", label: "Centre row A", ...r1 },
  { id: "r2", label: "Centre row B", ...r2 },
  { id: "lower", label: "Lower banquet", ...lower },
  { id: "buffet", label: "Buffet / registration", tables: [{ x: 402, y: 455 }, { x: 402, y: 502 }, { x: 402, y: 549 }], chairs: [] },
];

const FIXTURES = [
  { x: 524, y: 26, w: 46, h: 30, label: "Speaker", tip: "Speaker (north)" },
  { x: 374, y: 54, w: 122, h: 24, label: "Portable TV", tip: "Portable TV, HDMI" },
  { x: 524, y: 400, w: 46, h: 30, label: "Speaker", tip: "Speaker (south)" },
];

export function RooftopTerracePlan({ className }: { className?: string }) {
  const [hover, setHover] = useState<string | null>(null);
  const tables = ROOFTOP.reduce((n, c) => n + c.tables.length, 0);
  const chairs = ROOFTOP.reduce((n, c) => n + c.chairs.length, 0);
  const tip = hover ? (ROOFTOP.find((c) => c.id === hover)?.label ?? FIXTURES.find((f) => f.tip === hover)?.tip) : null;
  return (
    <div className={cn("relative", className)}>
      <div className="mb-2 flex items-center gap-4 font-mono text-[11px] text-muted-foreground">
        <span><b className="text-ink">{tables}</b> tables</span>
        <span><b className="text-ink">{chairs}</b> chairs</span>
        <span className="ml-auto h-5 min-w-0 truncate text-ink">{tip}</span>
      </div>
      <svg viewBox="0 0 600 690" className="w-full rounded-xl border-[1.5px] border-ink bg-[#fbf8f1]" role="img" aria-label="Rooftop Terrace floor plan">
        <defs>
          <pattern id="fp-grid" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M20 0H0V20" fill="none" stroke="#161514" strokeOpacity=".05" />
          </pattern>
        </defs>
        <rect width="600" height="690" fill="url(#fp-grid)" />
        {/* walls */}
        <path d="M148 10 H575 V432 H465 V676 H170 M170 620 V405 H85 V75 H148 V10" fill="#fff" stroke="#161514" strokeWidth="3" strokeLinejoin="round" />
        {/* entrance */}
        <rect x="128" y="34" width="10" height="28" fill="#ff5a36" stroke="#161514" strokeWidth="1.5" />
        <text x="14" y="38" className="fill-ink font-mono text-[12px] font-bold">Rooftop</text>
        <text x="14" y="53" className="fill-ink font-mono text-[12px] font-bold">entrance</text>
        <path d="M84 48 H120" stroke="#161514" strokeWidth="1.5" markerEnd="url(#fp-arrow)" />
        <marker id="fp-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L10 5L0 10z" fill="#161514" /></marker>
        {/* washroom */}
        <path d="M200 636 H155" stroke="#161514" strokeWidth="1.5" markerEnd="url(#fp-arrow)" />
        <text x="208" y="640" className="fill-ink font-mono text-[12px] font-bold">To washroom</text>

        {FIXTURES.map((f) => (
          <g key={f.tip} onMouseEnter={() => setHover(f.tip)} onMouseLeave={() => setHover(null)} className="cursor-default">
            <rect x={f.x} y={f.y} width={f.w} height={f.h} rx="3" fill={hover === f.tip ? "#ffd84d" : "#fff"} stroke="#161514" strokeWidth="1.5" className="transition-colors" />
            <text x={f.x + f.w / 2} y={f.y + f.h / 2 + 4} textAnchor="middle" className="pointer-events-none fill-ink font-mono text-[10px] font-bold">{f.label}</text>
          </g>
        ))}

        {ROOFTOP.map((c, ci) => (
          <motion.g
            key={c.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 + ci * 0.08, duration: 0.4 }}
            onMouseEnter={() => setHover(c.id)}
            onMouseLeave={() => setHover(null)}
            className="cursor-default"
          >
            {c.chairs.map((ch, i) => (
              <circle key={i} cx={ch.x} cy={ch.y} r="6.5" fill={hover === c.id ? "#ff5a36" : "#fff"} stroke="#161514" strokeWidth="1.5" className="transition-colors" />
            ))}
            {c.tables.map((t, i) => (
              <rect key={i} x={t.x} y={t.y} width={t.w ?? T} height={t.h ?? T} rx="3" fill={hover === c.id ? "#ffd84d" : "#fff"} stroke="#161514" strokeWidth="2" className="transition-colors" />
            ))}
          </motion.g>
        ))}
      </svg>
    </div>
  );
}

const PLANS: Partial<Record<string, (p: { className?: string }) => React.ReactNode>> = {
  ven_rooftop: RooftopTerracePlan,
};

/** The drawn plan for a venue, or nothing. Which venues have one: PLAN_IDS in lib/floor-plans. */
export function FloorPlan({ venueId, className }: { venueId: string; className?: string }) {
  const Plan = PLANS[venueId];
  return Plan ? <Plan className={className} /> : null;
}
