"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { AssistantCursor, stepInfo, useLiveRuns } from "@/components/app/live-build";

/** Box office: projects your AI assistant is planning right now, filling in as its steps land. */
export function LiveBoxOffice() {
  const all = useLiveRuns("/api/live");
  const [pos, setPos] = useState({ x: -100, y: -100 });
  const host = useRef<HTMLUListElement>(null);
  const router = useRouter();
  const seen = useRef(new Set<string>());

  const plans = useMemo(() => (all ?? []).filter((x) => x.source !== "builtin" || x.status === "running"), [all]);
  const runs = useMemo(() => plans.filter((x) => x.status === "running"), [plans]);

  // A run just finished: refresh (once) so it joins the normal project list.
  useEffect(() => {
    let fresh = false;
    for (const x of plans) {
      if (x.status === "running" || seen.current.has(x.id)) continue;
      seen.current.add(x.id);
      fresh = true;
    }
    if (fresh) router.refresh();
  }, [plans, router]);

  useEffect(() => {
    if (!runs.length) return;
    let n = 0;
    const move = () => {
      const rows = host.current?.querySelectorAll<HTMLElement>("[data-live-row]");
      if (!rows?.length) return;
      const el = rows[n % rows.length];
      const cells = el.querySelectorAll<HTMLElement>("[data-cell]");
      const c = cells[(n >> 1) % Math.max(1, cells.length)] ?? el;
      const r = c.getBoundingClientRect();
      setPos({ x: r.left + r.width * 0.6, y: r.top + r.height * 0.5 });
      n += 1;
    };
    move();
    const t = setInterval(move, 1300);
    return () => clearInterval(t);
  }, [runs.length]);

  if (!runs.length) return null;
  return (
    <>
      <ul ref={host} className="mt-3 space-y-3">
        <AnimatePresence>
          {runs.map((run) => {
            const last = run.steps.at(-1);
            const info = last ? stepInfo(last.tool) : null;
            const done = run.steps.filter((s) => s.status !== "running").length;
            const title = run.title ?? run.prompt.replace(/^plan (a|an)\s+/i, "").slice(0, 60);
            return (
              <motion.li key={run.id} data-live-row layout initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="rounded-xl border-[1.5px] border-ink bg-white p-4 shadow-[3px_3px_0_0_#ff5a36]">
                <div className="grid grid-cols-[1fr_auto] items-center gap-4 md:grid-cols-[1.4fr_1fr_1fr_auto]">
                  <div data-cell className="min-w-0">
                    <p className="flex items-center gap-2 font-mono text-[10px] font-bold uppercase text-tomato-ink">
                      <span className="relative flex size-2"><span className="absolute inline-flex size-full animate-ping rounded-full bg-tomato opacity-60" /><span className="relative inline-flex size-2 rounded-full bg-tomato" /></span>
                      Your assistant is planning
                    </p>
                    <motion.p key={title} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-1 truncate font-display text-xl font-bold">{title}</motion.p>
                    <p className="truncate text-xs text-muted-foreground">{info ? `${info.doing}…` : "starting…"}</p>
                  </div>
                  <div data-cell className="hidden md:block">
                    <p className="mono-label text-[9.5px] text-muted-foreground">Steps</p>
                    <div className="mt-1.5 h-2.5 overflow-hidden rounded-full border-[1.5px] border-ink bg-card">
                      <motion.div className="h-full bg-tomato" animate={{ width: `${Math.min(100, (done / 24) * 100)}%` }} />
                    </div>
                    <p className="mt-1 font-mono text-[11px] text-muted-foreground">{done} done</p>
                  </div>
                  <div data-cell className="hidden space-y-1.5 md:block">
                    {[0.9, 0.6, 0.75].map((w, i) => (
                      <div key={i} className="relative h-2.5 overflow-hidden rounded-full bg-sand" style={{ width: `${w * 100}%` }}>
                        <motion.span className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white to-transparent" animate={{ x: ["-100%", "300%"] }} transition={{ repeat: Infinity, duration: 1.2, ease: "linear", delay: i * 0.1 }} />
                      </div>
                    ))}
                  </div>
                  {run.eventId ? (
                    <Link href={`/events/${run.eventId}`} className="rounded-lg border-[1.5px] border-ink bg-ink px-3 py-1.5 text-xs font-semibold text-white">Watch</Link>
                  ) : (
                    <span className="font-mono text-[11px] text-muted-foreground">setting up</span>
                  )}
                </div>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>
      <AssistantCursor x={pos.x} y={pos.y} chip={runs.length > 1 ? `planning ${runs.length} events` : "planning"} />
    </>
  );
}
