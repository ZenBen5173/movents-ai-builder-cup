"use client";

import { useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export type Booking = { id: string; title: string; holder: string | null; kind: "ours" | "society" | "class" | "exam"; date: string; start: string; end: string; href?: string; clash?: boolean };

const KIND: Record<Booking["kind"], { bg: string; label: string }> = {
  ours: { bg: "bg-tomato", label: "Ours" },
  society: { bg: "bg-sky", label: "Clubs" },
  class: { bg: "bg-sand", label: "Classes" },
  exam: { bg: "bg-sun", label: "Exams" },
};

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Month grid of everything booked in one room. Hover a chip for time and who. */
export function VenueCalendar({ bookings, today }: { bookings: Booking[]; today: string }) {
  const [month, setMonth] = useState(() => new Date(`${today.slice(0, 7)}-01T00:00:00Z`));
  const [dir, setDir] = useState(1);
  const y = month.getUTCFullYear();
  const m = month.getUTCMonth();
  const first = new Date(Date.UTC(y, m, 1));
  const offset = (first.getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const cells = Array.from({ length: Math.ceil((offset + days) / 7) * 7 }, (_, i) => {
    const d = new Date(Date.UTC(y, m, i - offset + 1));
    return { date: iso(d), day: d.getUTCDate(), inMonth: d.getUTCMonth() === m };
  });
  const byDay = new Map<string, Booking[]>();
  for (const b of bookings) byDay.set(b.date, [...(byDay.get(b.date) ?? []), b].sort((a, c) => a.start.localeCompare(c.start)));
  const go = (n: number) => {
    setDir(n);
    setMonth(new Date(Date.UTC(y, m + n, 1)));
  };
  const inMonth = bookings.filter((b) => b.date.startsWith(iso(first).slice(0, 7)));

  return (
    <div>
      <div className="mb-3 flex items-center gap-3">
        <button onClick={() => go(-1)} aria-label="Previous month" className="grid size-8 place-items-center rounded-lg border-[1.5px] border-ink/20 transition-colors hover:border-ink hover:bg-sand"><ChevronLeft className="size-4" /></button>
        <AnimatePresence mode="wait" custom={dir}>
          <motion.h3 key={iso(first)} initial={{ opacity: 0, x: dir * 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: dir * -12 }} className="w-40 text-center font-display text-xl font-bold">
            {first.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" })}
          </motion.h3>
        </AnimatePresence>
        <button onClick={() => go(1)} aria-label="Next month" className="grid size-8 place-items-center rounded-lg border-[1.5px] border-ink/20 transition-colors hover:border-ink hover:bg-sand"><ChevronRight className="size-4" /></button>
        <div className="ml-auto flex flex-wrap gap-3">
          {(Object.keys(KIND) as Booking["kind"][]).map((k) => (
            <span key={k} className="flex items-center gap-1.5 font-mono text-[10px] uppercase text-muted-foreground">
              <span className={cn("size-2.5 rounded-sm border border-ink", KIND[k].bg)} />
              {KIND[k].label} <b className="text-ink">{inMonth.filter((b) => b.kind === k).length}</b>
            </span>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border-[1.5px] border-ink">
        <div className="grid grid-cols-7 border-b-[1.5px] border-ink bg-sand/60">
          {DOW.map((d) => <span key={d} className="mono-label py-1.5 text-center text-[10px]">{d}</span>)}
        </div>
        <AnimatePresence mode="wait" custom={dir}>
          <motion.div key={iso(first)} initial={{ opacity: 0, x: dir * 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: dir * -24 }} transition={{ duration: 0.2 }} className="grid grid-cols-7">
            {cells.map((c, i) => {
              const list = byDay.get(c.date) ?? [];
              return (
                <div key={c.date} className={cn("min-h-24 border-border p-1.5", i % 7 !== 6 && "border-r", i < cells.length - 7 && "border-b", !c.inMonth && "bg-sand/25")}>
                  <span className={cn("mb-1 inline-grid size-6 place-items-center rounded-full font-mono text-[11px]", c.date === today ? "bg-ink font-bold text-white" : c.inMonth ? "" : "text-muted-foreground/50")}>{c.day}</span>
                  <div className="space-y-1">
                    {list.slice(0, 3).map((b) => {
                      const chip = (
                        <span className={cn("group/chip relative block truncate rounded-md border border-ink/70 px-1.5 py-0.5 text-[11px] leading-tight transition-transform hover:-translate-y-px", KIND[b.kind].bg, b.kind === "ours" && "font-semibold", b.clash && "ring-2 ring-tomato ring-offset-1")}>
                          {b.title}
                          <span className="pointer-events-none absolute bottom-full left-0 z-30 mb-1.5 w-max max-w-60 rounded-lg border-[1.5px] border-ink bg-card px-2 py-1 text-xs font-normal opacity-0 shadow-[2px_2px_0_0_#161514] transition-opacity group-hover/chip:opacity-100">
                            <b className="font-mono">{b.start} to {b.end}</b>
                            {b.holder && <span className="block text-muted-foreground">{b.holder}</span>}
                            {b.clash && <span className="block font-semibold text-tomato-ink">Clash</span>}
                          </span>
                        </span>
                      );
                      return b.href ? <Link key={b.id} href={b.href}>{chip}</Link> : <div key={b.id}>{chip}</div>;
                    })}
                    {list.length > 3 && <span title={list.slice(3).map((b) => b.title).join(", ")} className="block px-1 font-mono text-[10px] text-muted-foreground">+{list.length - 3}</span>}
                  </div>
                </div>
              );
            })}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
