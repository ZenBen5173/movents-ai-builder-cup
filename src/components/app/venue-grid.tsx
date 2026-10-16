"use client";

import { useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { Search } from "lucide-react";
import { FloorPlan } from "@/components/app/floor-plans";
import { PLAN_IDS } from "@/lib/floor-plans";
import { Icon } from "@/components/ep/kit";
import { cn } from "@/lib/utils";

type V = { id: string; name: string; capacity: number; location: string | null; photo_url: string | null; av: string[]; setup_styles: string[]; lead: number; next: string | null; month: number; clash: boolean };

/** Photo tiles with search. Click a tile for its calendar and floor plan. */
export function VenueGrid({ uni, venues }: { uni: string; venues: V[] }) {
  const [q, setQ] = useState("");
  const [min, setMin] = useState(0);
  const max = Math.max(1, ...venues.map((v) => v.capacity));
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = venues.filter((v) => v.capacity >= min && words.every((w) => [v.name, v.location ?? "", ...v.av, ...v.setup_styles].join(" ").toLowerCase().includes(w)));
  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <label className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-xl border-[1.5px] border-ink/20 bg-card px-3 transition-colors focus-within:border-ink sm:max-w-sm">
          <Search className="size-4 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search venues, AV, layout" className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
        </label>
        <div className="flex gap-1.5">
          {[0, 100, 200, 500].map((n) => (
            <button key={n} onClick={() => setMin(n)} className={cn("h-10 rounded-xl border-[1.5px] px-3 font-mono text-xs transition-colors", min === n ? "border-ink bg-ink text-white" : "border-ink/20 hover:border-ink")}>
              {n ? `${n}+` : "Any"}
            </button>
          ))}
        </div>
      </div>
      <motion.ul layout className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        <AnimatePresence>
          {shown.map((v, i) => {
            const hasPlan = PLAN_IDS.has(v.id);
            return (
              <motion.li key={v.id} layout initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96 }} transition={{ delay: i * 0.04 }}>
                <Link href={`/universities/${uni}/venues/${v.id}`} className="group block">
                  <div className="relative aspect-[16/10] overflow-hidden rounded-xl border-[1.5px] border-ink bg-sand shadow-[3px_3px_0_0_#161514] transition-all group-hover:-translate-y-0.5 group-hover:shadow-[5px_5px_0_0_#161514]">
                    {v.photo_url ? (
                       
                      <img src={v.photo_url} alt={v.name} loading="lazy" className="size-full object-cover transition-transform duration-500 group-hover:scale-105" />
                    ) : hasPlan ? (
                      <div className="flex size-full items-start justify-center overflow-hidden bg-[#fbf8f1] p-2 [&_.mb-2]:hidden [&_svg]:border-0">
                        <FloorPlan venueId={v.id} className="w-[70%] transition-transform duration-500 group-hover:scale-105" />
                      </div>
                    ) : (
                      <div className="grid size-full place-items-center text-muted-foreground"><Icon name="building-2" size={28} /></div>
                    )}
                    <span className="absolute left-3 top-3 rounded-md border-[1.5px] border-ink bg-card px-2 py-0.5 font-mono text-xs font-bold">{v.capacity} seats</span>
                    {v.clash && <span className="absolute right-3 top-3 rounded-md border-[1.5px] border-ink bg-tomato px-2 py-0.5 font-mono text-[10px] font-bold uppercase">Clash</span>}
                    {hasPlan && <span className="absolute bottom-3 right-3 rounded-md border-[1.5px] border-ink bg-sun px-2 py-0.5 font-mono text-[10px] font-bold uppercase">Floor plan</span>}
                  </div>
                  <div className="mt-3 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-display text-lg font-bold leading-tight transition-colors group-hover:text-tomato-ink">{v.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{v.location}</p>
                    </div>
                    <span title={`${v.month} bookings this month`} className="flex shrink-0 items-center gap-1 font-mono text-xs text-muted-foreground">
                      <Icon name="calendar-days" size={13} />
                      {v.month}
                    </span>
                  </div>
                  <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-sand">
                    <motion.span initial={{ width: 0 }} animate={{ width: `${(v.capacity / max) * 100}%` }} transition={{ duration: 0.7, delay: 0.1 + i * 0.04 }} className="block h-full bg-ticket-blue" />
                  </span>
                </Link>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </motion.ul>
    </div>
  );
}
