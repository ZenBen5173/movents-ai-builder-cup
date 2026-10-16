"use client";

import { motion } from "motion/react";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { Mono, Pass, Sticky } from "@/components/ep/kit";

const TONES = ["sun", "peach", "sky", "mint"] as const;

export function OverviewHero({ days, title, date, venue, id, flags }: { days: number; title: string; date: string; venue: string; id: string; flags: { level: string; message: string }[] }) {
  return (
    <div className="grid items-start gap-10 lg:grid-cols-[1fr_250px]">
      <div>
        <div className="flex items-end gap-4">
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="font-display text-[88px] font-bold leading-[0.85] tracking-tighter text-tomato md:text-[120px]">
            <AnimatedNumber value={Math.abs(days)} />
          </motion.div>
          <div className="pb-2">
            <Mono className="block text-[11px] text-ink">{days >= 0 ? "days to showtime" : "days since the show"}</Mono>
            <p className="text-sm text-muted-foreground">{date} · {venue}</p>
          </div>
        </div>
        {flags.length > 0 && (
          <div className="mt-8 grid gap-5 sm:grid-cols-2">
            {flags.slice(0, 4).map((f, i) => (
              <Sticky key={i} tone={f.level === "error" ? "peach" : TONES[i % TONES.length]} tilt={i % 2 ? 1.6 : -1.4} title={f.level === "error" ? "Stop the show" : f.message.startsWith("Spend") ? "Money alert" : "SOP clock"}>
                {f.message}
              </Sticky>
            ))}
          </div>
        )}
      </div>
      <div className="hidden lg:block">
        <Pass header="Project pass" tone="tomato" number={`${id.slice(-6).toUpperCase()} · ${date.toUpperCase()}`}>
          <Mono className="text-[10px]">Now planning</Mono>
          <p className="mt-0.5 font-display text-xl font-bold leading-tight">{title}</p>
          <p className="text-sm text-muted-foreground">{venue}</p>
        </Pass>
      </div>
    </div>
  );
}
