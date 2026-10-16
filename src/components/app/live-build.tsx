"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * While your AI assistant is building an event over MCP, the event pages show it
 * working: its cursor moves over the page, the tab it is on fills from
 * skeletons as each real step lands, and the view follows it tab to tab.
 * Everything here is driven by the run's recorded steps (/api/live).
 */

export type LiveStep = { id: string; name: string; tool: string; status: string; summary: string | null };
export type LiveRun = { id: string; eventId: string | null; title: string | null; prompt: string; status: string; source: string; steps: LiveStep[] };

const toolKey = (tool: string) => (tool.split("→").pop() ?? tool).trim().split(" ")[0].replace(/^[a-z]+\./, "");

/** Which tab a step happens on, and what the assistant says it is doing. */
const STEP: { match: RegExp; seg: string; doing: string }[] = [
  { match: /create_event|parse/, seg: "", doing: "setting up the project" },
  { match: /read_sop|sop/, seg: "", doing: "reading the university SOP" },
  { match: /match_venue|venue/, seg: "", doing: "matching a venue" },
  { match: /check_lead|lead/, seg: "", doing: "checking SOP deadlines" },
  { match: /plan_timeline|timeline/, seg: "tasks", doing: "planning the timeline" },
  { match: /speaker/, seg: "speakers", doing: "adding speakers" },
  { match: /supplier|vendor|quote/, seg: "suppliers", doing: "pricing suppliers" },
  { match: /budget/, seg: "budget", doing: "calculating the budget" },
  { match: /risk/, seg: "risks", doing: "assessing risks" },
  { match: /ops_pack|runsheet/, seg: "day", doing: "writing the run of show" },
  { match: /sponsor/, seg: "sponsors", doing: "lining up sponsors" },
  { match: /marketing|creative|social/, seg: "promotion", doing: "designing the marketing kit" },
  { match: /meeting|minutes/, seg: "meetings", doing: "scheduling meetings" },
  { match: /calendar/, seg: "tasks", doing: "pushing the calendar" },
  { match: /publish|rsvp/, seg: "registration", doing: "opening registration" },
  { match: /faculty|proposal|outputs/, seg: "outputs", doing: "preparing documents" },
  { match: /email/, seg: "inbox", doing: "drafting emails" },
];

export function stepInfo(tool: string) {
  const k = toolKey(tool);
  return STEP.find((s) => s.match.test(k)) ?? { seg: "", doing: "working" };
}

/** The assistant's cursor: tomato pointer, ink name tag, little robot face, optional status chip. */
export function AssistantCursor({ x, y, chip, clickKey }: { x: number; y: number; chip?: string | null; clickKey?: string | number }) {
  return (
    <motion.div className="pointer-events-none fixed left-0 top-0 z-[70]" animate={{ x, y }} transition={{ type: "spring", stiffness: 120, damping: 18, mass: 0.8 }}>
      <AnimatePresence>
        {clickKey !== undefined && (
          <motion.span key={clickKey} initial={{ scale: 0, opacity: 0.6 }} animate={{ scale: 2.6, opacity: 0 }} transition={{ duration: 0.6 }} className="absolute -left-3 -top-3 size-6 rounded-full border-2 border-tomato" />
        )}
      </AnimatePresence>
      <svg width="22" height="24" viewBox="0 0 22 24" className="drop-shadow-[0_2px_3px_rgba(22,21,20,.35)]">
        <path d="M2 2 L19 12 L11 13.5 L7.5 21 Z" fill="#ff5a36" stroke="#161514" strokeWidth="1.6" strokeLinejoin="round" />
      </svg>
      <div className="ml-4 -mt-1 flex items-center gap-1.5">
        <span className="flex items-center gap-1 rounded-full bg-ink py-0.5 pl-0.5 pr-2 text-[11px] font-semibold text-white shadow-md">
          <span className="grid size-4 place-items-center rounded-full bg-white">
            <svg viewBox="0 0 16 16" className="size-3.5">
              <path d="M3 6 L4 2 L6.5 4.5 M13 6 L12 2 L9.5 4.5" fill="#fff" stroke="#161514" strokeWidth="1" />
              <rect x="2.5" y="5" width="11" height="8.5" rx="3.5" fill="#fff" stroke="#161514" strokeWidth="1" />
              <rect x="4" y="7" width="8" height="4.2" rx="2" fill="#161514" />
              <circle cx="6.2" cy="9.1" r="0.9" fill="#3ee0c5" />
              <circle cx="9.8" cy="9.1" r="0.9" fill="#3ee0c5" />
            </svg>
          </span>
          AI assistant
        </span>
        <AnimatePresence mode="wait">
          {chip && (
            <motion.span key={chip} initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="whitespace-nowrap rounded-full border border-ink/20 bg-white px-2 py-0.5 text-[11px] font-medium text-tomato-ink shadow-sm">
              {chip}…
            </motion.span>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

function Sparkles({ x, y, k }: { x: number; y: number; k: number }) {
  const bits = Array.from({ length: 10 }, (_, i) => i);
  const colors = ["#ff5a36", "#ffd84d", "#3d6cf5", "#46a758", "#cfe3ff"];
  return (
    <div className="pointer-events-none fixed left-0 top-0 z-[69]" style={{ transform: `translate(${x}px, ${y}px)` }}>
      {bits.map((i) => {
        const a = (i / bits.length) * Math.PI * 2;
        return (
          <motion.span
            key={`${k}-${i}`}
            initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
            animate={{ x: Math.cos(a) * 46, y: Math.sin(a) * 46, opacity: 0, scale: 0.4 }}
            transition={{ duration: 0.7, ease: "easeOut" }}
            className="absolute size-2 rounded-[2px]"
            style={{ background: colors[i % colors.length] }}
          />
        );
      })}
    </div>
  );
}

const FAST_MS = 1500; // a run is live: keep the view close behind it
const SLOW_MS = 15000; // nothing running: just watch for a new run starting
const MAX_BACKOFF_MS = 30000;

/**
 * Polls /api/live for runs. Fast while a run is active, slow when idle, paused
 * while the tab is hidden (with an immediate fetch on return), and backs off
 * quietly on errors. In-flight requests are aborted on unmount.
 */
export function useLiveRuns(url: string) {
  const [runs, setRuns] = useState<LiveRun[] | null>(null);
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let ctrl: AbortController | null = null;
    let fails = 0;
    const hidden = () => document.visibilityState === "hidden";
    const schedule = (ms: number) => {
      clearTimeout(timer);
      if (!stopped && !hidden()) timer = setTimeout(tick, ms);
    };
    const tick = async () => {
      clearTimeout(timer);
      ctrl?.abort();
      const c = new AbortController();
      ctrl = c;
      let next: number;
      try {
        const r = await fetch(url, { cache: "no-store", signal: c.signal });
        if (!r.ok) throw new Error(`live ${r.status}`);
        const j = (await r.json()) as { runs?: LiveRun[] };
        if (stopped || c.signal.aborted) return;
        const list = j.runs ?? [];
        fails = 0;
        setRuns(list);
        next = list.some((x) => x.status === "running") ? FAST_MS : SLOW_MS;
      } catch {
        // Aborted (unmount, hidden tab or a newer tick): that path schedules itself.
        if (stopped || c.signal.aborted) return;
        fails += 1;
        next = Math.min(MAX_BACKOFF_MS, FAST_MS * 2 ** fails);
      }
      schedule(next);
    };
    const onVisibility = () => {
      if (hidden()) {
        clearTimeout(timer);
        ctrl?.abort();
      } else tick();
    };
    document.addEventListener("visibilitychange", onVisibility);
    if (!hidden()) tick();
    return () => {
      stopped = true;
      clearTimeout(timer);
      ctrl?.abort();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [url]);
  return runs;
}

/** Pick a spot on something real in the content area, so the cursor looks like it is working on it. */
function spotIn(host: HTMLElement | null, n: number) {
  if (!host) return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  const cands = [...host.querySelectorAll<HTMLElement>("section, table, svg, li, h2, h3, [class*='rounded-xl']")].filter((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 60 && r.height > 24 && r.top > 80 && r.bottom < window.innerHeight - 20;
  });
  const el = cands.length ? cands[n % cands.length] : host;
  const r = el.getBoundingClientRect();
  return { x: r.left + Math.min(r.width - 30, 40 + ((n * 97) % Math.max(60, r.width - 80))), y: r.top + Math.min(r.height - 10, 18 + ((n * 53) % Math.max(30, r.height - 30))) };
}

export function LiveBuild({ eventId }: { eventId: string }) {
  const runs = useLiveRuns(`/api/live?event=${eventId}`);
  const run = runs?.[0] ?? null;
  const router = useRouter();
  const path = usePathname();
  const host = useRef<HTMLDivElement>(null);
  const [follow, setFollow] = useState(true);
  const [pos, setPos] = useState({ x: -100, y: -100 });
  const [building, setBuilding] = useState(false);
  const [burst, setBurst] = useState<{ x: number; y: number; k: number } | null>(null);
  const lastStep = useRef<string | null>(null);
  const tick = useRef(0);

  const steps = run?.steps ?? [];
  const current = steps.at(-1) ?? null;
  const info = current ? stepInfo(current.tool) : null;
  const live = run && run.status === "running";
  const done = run && run.status !== "running";
  const seg = path.split(`/events/${eventId}`)[1]?.replace(/^\//, "").split("/")[0] ?? "";

  // A new step landed: follow the assistant to its tab, show the skeleton, then reveal the fresh data.
  useEffect(() => {
    if (!current || current.id === lastStep.current) return;
    const first = lastStep.current === null;
    lastStep.current = current.id;
    if (first && !live) return;
    if (follow && info && info.seg !== seg) router.push(`/events/${eventId}${info.seg ? `/${info.seg}` : ""}`);
    setBuilding(true);
    const t1 = setTimeout(() => router.refresh(), 700);
    const t2 = setTimeout(() => {
      setBuilding(false);
      setBurst((b) => ({ ...pos, k: (b?.k ?? 0) + 1 }));
    }, 1500);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id]);

  // Keep the cursor busy over the page while the run is live.
  const wander = useCallback(() => {
    tick.current += 1;
    setPos(spotIn(host.current?.parentElement ?? null, tick.current));
  }, []);
  useEffect(() => {
    if (!live) return;
    wander();
    const t = setInterval(wander, 1400);
    return () => clearInterval(t);
  }, [live, wander, path]);

  if (!run || (!live && !done)) return <div ref={host} className="hidden" />;
  const doneCount = steps.filter((s) => s.status !== "running").length;
  const recent = steps.slice(-3).reverse();

  return (
    <div ref={host}>
      {/* Header strip: the assistant is building this project, with a progress line. */}
      <div className="sticky top-14 z-40 -mt-4 mb-4">
        <div className="flex items-center gap-3 rounded-xl border-[1.5px] border-ink bg-white/95 px-3 py-2 shadow-[2px_2px_0_0_#ff5a36] backdrop-blur">
          <span className="relative flex size-2.5">
            {live && <span className="absolute inline-flex size-full animate-ping rounded-full bg-tomato opacity-60" />}
            <span className={cn("relative inline-flex size-2.5 rounded-full", live ? "bg-tomato" : "bg-[#46a758]")} />
          </span>
          <span className="text-sm font-semibold text-ink">{live ? "Your assistant is building this project" : "Your assistant finished"}</span>
          {live && info && <span className="hidden text-sm text-muted-foreground sm:inline">{info.doing}…</span>}
          <span className="ml-auto font-mono text-[11px] text-muted-foreground">{doneCount} steps</span>
          {live && (
            <button onClick={() => setFollow((f) => !f)} className={cn("rounded-md border px-2 py-0.5 font-mono text-[10px] font-bold uppercase", follow ? "border-ink bg-ink text-white" : "border-ink/20 text-muted-foreground")}>
              {follow ? "Following" : "Follow"}
            </button>
          )}
          <a href={`/runs/${run.id}`} className="text-xs font-medium text-tomato-ink hover:underline">Trace</a>
        </div>
        <div className="mx-3 h-1 overflow-hidden rounded-b bg-tomato/15">
          <motion.div className="h-full bg-tomato" animate={{ width: `${Math.min(100, (doneCount / 24) * 100)}%` }} transition={{ type: "spring", stiffness: 80, damping: 20 }} />
        </div>
      </div>

      {/* Skeleton while the step lands, then it fades to reveal the real content. */}
      <AnimatePresence>
        {building && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }} className="pointer-events-none absolute inset-x-0 bottom-0 top-14 z-30 overflow-hidden rounded-xl bg-background/80 backdrop-blur-[1.5px]">
            <div className="space-y-3 p-2">
              {[0.9, 0.6, 0.8, 0.45, 0.7, 0.55].map((w, i) => (
                <div key={i} className="relative h-10 overflow-hidden rounded-lg bg-sand/80" style={{ width: `${w * 100}%` }}>
                  <motion.span className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/80 to-transparent" animate={{ x: ["-100%", "300%"] }} transition={{ repeat: Infinity, duration: 1.1, ease: "linear", delay: i * 0.08 }} />
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Little live feed of the last steps. */}
      <div className="pointer-events-none fixed bottom-5 right-5 z-[60] w-72 space-y-1.5">
        <AnimatePresence initial={false}>
          {recent.map((s) => (
            <motion.div key={s.id} layout initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex items-center gap-2 rounded-lg border-[1.5px] border-ink/30 bg-white/95 px-2.5 py-1.5 text-xs shadow-md">
              {s.status === "running" ? <Loader2 className="size-3.5 animate-spin text-tomato" /> : <Check className="size-3.5 text-[#46a758]" />}
              <span className="min-w-0 flex-1 truncate font-medium">{s.name}</span>
              <span className="font-mono text-[10px] text-muted-foreground">{toolKey(s.tool)}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {live && <AssistantCursor x={pos.x} y={pos.y} chip={info?.doing ?? "working"} clickKey={current?.id} />}
      {burst && <Sparkles x={burst.x} y={burst.y} k={burst.k} />}
    </div>
  );
}
