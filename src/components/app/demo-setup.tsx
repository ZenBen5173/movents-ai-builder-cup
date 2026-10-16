"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check } from "lucide-react";
import { FlipFadeText } from "@/components/ui/flip-fade-text";
import { Face } from "./movi";

const WORDS = ["Booking venues", "Pricing caterers", "Back-planning timelines", "Writing proposals", "Listing risks", "Drafting posters"];

/**
 * The few seconds while a new demo society's sample events are planned:
 * Movi at work, each event ticking off as it lands, then on to Box office
 * (a full page load, so the sidebar shows the new events).
 */
export function DemoSetup() {
  const [events, setEvents] = useState<string[]>([]);
  const [total, setTotal] = useState(3);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let stop = false;
    const started = Date.now();
    const tick = async () => {
      try {
        const r = await fetch("/api/demo/status", { cache: "no-store" });
        if (r.ok) {
          const j = (await r.json()) as { events: string[]; total: number; done: boolean };
          setEvents(j.events);
          setTotal(j.total);
          if (j.done) {
            setDone(true);
            setTimeout(() => window.location.assign("/"), 900);
            return;
          }
        }
      } catch {
        /* keep polling */
      }
      // Never strand anyone here: after 40 seconds, go anyway.
      if (Date.now() - started > 40_000) return window.location.assign("/");
      if (!stop) setTimeout(tick, 900);
    };
    tick();
    return () => {
      stop = true;
    };
  }, []);

  const rows = Array.from({ length: total }, (_, i) => events[i] ?? null);
  return (
    <main className="grid min-h-dvh place-items-center bg-background px-4">
      <div className="w-full max-w-md text-center">
        <motion.div animate={{ y: [0, -8, 0], rotate: done ? [0, -8, 8, 0] : 0 }} transition={{ duration: done ? 0.6 : 1.4, repeat: done ? 0 : Infinity, ease: "easeInOut" }} className="mx-auto size-24 drop-shadow-[3px_4px_0_#161514]">
          <Face blink={false} look={{ x: 0, y: 1 }} mood={done ? "happy" : "think"} />
        </motion.div>
        <p className="mono-label mt-6 text-[11px] text-tomato">Setting the stage for your demo society</p>
        <FlipFadeText words={done ? ["Curtain up"] : WORDS} interval={1600} className="min-h-[64px]" textClassName="font-display text-3xl font-bold tracking-tight" />
        <ul className="mx-auto mt-2 max-w-xs space-y-2 text-left">
          {rows.map((title, i) => (
            <li key={i} className="flex items-center gap-3 rounded-xl border-[1.5px] border-ink/15 bg-card px-3 py-2">
              <AnimatePresence mode="wait" initial={false}>
                {title ? (
                  <motion.span key="ok" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 500, damping: 18 }} className="grid size-5 shrink-0 place-items-center rounded-full bg-ink text-white">
                    <Check className="size-3" />
                  </motion.span>
                ) : (
                  <motion.span key="wait" className="size-5 shrink-0 animate-pulse rounded-full border-[1.5px] border-dashed border-ink/30" />
                )}
              </AnimatePresence>
              <span className={title ? "text-sm font-medium" : "h-3 w-40 animate-pulse rounded bg-ink/10"}>{title}</span>
            </li>
          ))}
        </ul>
        <p className="mt-5 text-xs text-muted-foreground">A private sandbox with sample teammates and three planned events. Nothing is ever emailed from the demo.</p>
      </div>
    </main>
  );
}
