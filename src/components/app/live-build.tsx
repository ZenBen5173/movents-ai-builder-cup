"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * While Gemini (or your AI assistant over MCP) builds an event, the event pages
 * show it working: the view follows it tab to tab, and each tab is written in
 * the way a person writes on paper, item by item and word by word, with the
 * cursor at the end of the words being written. Driven by the run's recorded
 * steps (/api/live); the data is real, only its arrival is paced.
 */

export type LiveStep = { id: string; name: string; tool: string; status: string; summary: string | null };
export type LiveRun = { id: string; eventId: string | null; title: string | null; prompt: string; status: string; source: string; kind?: string; steps: LiveStep[] };

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

/** Gemini's own steps name the agent ("Speaker agent: ...") and use google_search, so match on the name too. */
const AGENT: { match: RegExp; seg: string; doing: string }[] = [
  { match: /speaker agent/i, seg: "speakers", doing: "searching the web for speakers" },
  { match: /budget agent.*(supplier|price)/i, seg: "suppliers", doing: "searching supplier prices" },
  { match: /budget agent/i, seg: "budget", doing: "balancing the budget" },
  { match: /sponsor agent/i, seg: "sponsors", doing: "finding sponsors" },
  { match: /proposal agent/i, seg: "outputs", doing: "writing the proposal" },
  { match: /promotion agent/i, seg: "promotion", doing: "writing the marketing kit" },
  { match: /risk agent/i, seg: "risks", doing: "weighing the risks" },
  { match: /checker/i, seg: "", doing: "checking against the SOP" },
  { match: /re-plan/i, seg: "", doing: "re-planning" },
  { match: /planner/i, seg: "", doing: "planning" },
];

/**
 * The live tour walks the tabs left to right, as the tab bar shows them, and
 * opens a tab only once Gemini has finished the step that fills it, so a tab is
 * never shown half-made (no placeholder speakers, no empty sponsor funnel).
 * Inbox and Meetings are left out: their content is not written during a build.
 */
const TOUR: { seg: string; ready: RegExp }[] = [
  { seg: "", ready: /match_venue|check_lead_times/ },
  { seg: "tasks", ready: /plan_timeline/ },
  { seg: "risks", ready: /generate_risks|add_risks/ },
  { seg: "budget", ready: /draft_budget/ },
  { seg: "speakers", ready: /save_speakers/ },
  { seg: "suppliers", ready: /save_supplier_quotes|research_suppliers/ },
  { seg: "sponsors", ready: /save_sponsors|find_sponsors/ },
  { seg: "promotion", ready: /generate_marketing_kit/ },
  { seg: "day", ready: /generate_ops_pack/ },
  { seg: "outputs", ready: /write_proposal_sections|get_outputs/ },
];

export function stepInfo(tool: string, name = "") {
  const k = toolKey(tool);
  return STEP.find((s) => s.match.test(k)) ?? AGENT.find((a) => a.match.test(name)) ?? { seg: "", doing: "working" };
}

/** The assistant's cursor: tomato pointer, ink name tag, little robot face, optional status chip. */
export function AssistantCursor({ x, y, chip, clickKey, name = "AI assistant", thought }: { x: number; y: number; chip?: string | null; clickKey?: string | number; name?: string; thought?: string | null }) {
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
          {name}
        </span>
        <AnimatePresence mode="wait">
          {chip && (
            <motion.span key={chip} initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="whitespace-nowrap rounded-full border border-ink/20 bg-white px-2 py-0.5 text-[11px] font-medium text-tomato-ink shadow-sm">
              {chip}…
            </motion.span>
          )}
        </AnimatePresence>
      </div>
      <AnimatePresence mode="wait">
        {thought && (
          <motion.div
            key={thought}
            initial={{ opacity: 0, y: -4, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.25 }}
            className="ml-4 mt-1.5 max-w-72 rounded-xl rounded-tl-sm border-[1.5px] border-ink bg-card px-2.5 py-1.5 text-[11.5px] leading-snug text-ink shadow-[2px_2px_0_0_#161514]"
          >
            <span className="mono-label mr-1 text-[9px] text-tomato">Thinking</span>
            {thought}
          </motion.div>
        )}
      </AnimatePresence>
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

/** Things on a page that are written in as one piece (rows, cards, list items, header values). */
const ITEM = "tr, li, article, dd, [data-live-item], [class*='rounded-xl'], [class*='rounded-2xl']";
const PAGE_MS = 7000; // a full tab takes about this long to write, however much is on it
const MIN_DWELL_MS = 1600; // stay on a finished tab this long before following Gemini to the next
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Words stay whole; digits come one at a time, so numbers look worked out. */
const tokens = (t: string) => t.match(/\s+|\d|[^\s\d]+/g) ?? [t];

/** Where the end of a text node is on screen: the cursor's tip goes there. */
function caret(node: Text) {
  const r = document.createRange();
  r.selectNodeContents(node);
  const rects = r.getClientRects();
  const last = rects[rects.length - 1];
  return last ? { x: last.right + 1, y: last.top + last.height * 0.6 } : null;
}

/**
 * Write one item in: blank its text, show it, then type the text back in order.
 * Rows and cards inside it appear as the writing reaches them. Text React has
 * changed meanwhile is left as React set it.
 */
async function writeIn(el: HTMLElement, msPerToken: number, onCaret: (p: { x: number; y: number }) => void, stop: () => boolean, quiet: () => void) {
  const subs = [...el.querySelectorAll<HTMLElement>(ITEM)];
  subs.forEach((x) => x.classList.add("mv-pending"));
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.nodeValue?.trim() && !n.parentElement?.closest("script, style, textarea, select, [data-live-skip]") ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT),
  });
  const nodes: { node: Text; text: string }[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push({ node: n as Text, text: n.nodeValue ?? "" });
  nodes.forEach((n) => (n.node.nodeValue = ""));
  // Links between items (timeline arrows) wait until both ends are written.
  const links = [...el.querySelectorAll<SVGElement>("[data-live-after]")];
  links.forEach((x) => x.classList.add("mv-pending"));
  const written = new Set<string>();
  const drawLinks = () => {
    for (const x of links)
      if (x.classList.contains("mv-pending") && (x.dataset.liveAfter ?? "").split(" ").every((k) => written.has(k))) {
        x.classList.remove("mv-pending");
        x.classList.add("mv-draw");
      }
  };
  quiet();
  el.classList.remove("mv-pending");
  el.classList.add("mv-write");
  const perTick = Math.max(1, Math.round(16 / msPerToken));
  // Pictures, bars and charts have no words: each shows once the writing reaches it.
  const blank = subs.filter((x) => !x.textContent?.trim());
  const reach = (node: Node) => {
    let shown = false;
    for (const b of blank)
      if (b.classList.contains("mv-pending") && b.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING) {
        b.classList.remove("mv-pending");
        b.classList.add("mv-write");
        shown = true;
      }
    return shown;
  };
  // A picture still being drawn (data-live-wait) is waited for, up to 8 s, so it is seen before the words below it.
  const settle = async () => {
    const until = Date.now() + 8000;
    while (!stop() && Date.now() < until && el.querySelector("[data-live-wait]")) await sleep(150);
  };
  try {
    for (const { node, text } of nodes) {
      if (stop()) break;
      if (!node.isConnected) continue; // replaced by fresh data meanwhile: that is queued on its own
      if (reach(node)) await settle();
      for (let p = node.parentElement; p && p !== el.parentElement; p = p.parentElement) {
        if (p.classList.contains("mv-pending")) {
          p.classList.remove("mv-pending");
          p.classList.add("mv-write");
        }
      }
      const owner = node.parentElement?.closest<HTMLElement>("[data-live-id]");
      if (owner?.dataset.liveId && !written.has(owner.dataset.liveId)) {
        written.add(owner.dataset.liveId);
        drawLinks();
      }
      const parts = tokens(text);
      let out = "";
      for (let i = 0; i < parts.length; i += perTick) {
        if (stop() || node.nodeValue !== out) break;
        out = parts.slice(0, i + perTick).join("");
        node.nodeValue = out;
        quiet();
        const c = caret(node);
        if (c) onCaret(c);
        await sleep(Math.max(16, msPerToken * perTick));
      }
    }
  } finally {
    for (const { node, text } of nodes) if (text.startsWith(node.nodeValue ?? "")) node.nodeValue = text;
    quiet();
    subs.forEach((x) => x.classList.remove("mv-pending"));
    links.forEach((x) => x.classList.remove("mv-pending"));
    el.classList.remove("mv-pending");
    setTimeout(() => {
      [el, ...subs].forEach((x) => x.classList.remove("mv-write"));
      links.forEach((x) => x.classList.remove("mv-draw"));
    }, 900);
  }
}

export function LiveBuild({ eventId }: { eventId: string }) {
  const runs = useLiveRuns(`/api/live?event=${eventId}`);
  const run = runs?.[0] ?? null;
  const router = useRouter();
  const path = usePathname();
  const host = useRef<HTMLDivElement>(null);
  const [follow, setFollow] = useState(true);
  const [pos, setPos] = useState({ x: -100, y: -100 });
  const posRef = useRef(pos);
  posRef.current = pos;
  const [burst, setBurst] = useState<{ x: number; y: number; k: number } | null>(null);
  // Tabs to visit, in the order Gemini worked on them; the page being written is finished first.
  // Tabs whose filling step Gemini has finished, and tabs it touched at all.
  const ready = useRef(new Set<string>());
  const touched = useRef(new Set<string>());

  const steps = run?.steps ?? [];
  const current = steps.at(-1) ?? null;
  const info = current ? stepInfo(current.tool, current.name) : null;
  const who = run?.source === "gemini" ? "Gemini" : "Your assistant";
  // The latest thing it concluded, shown as its reasoning next to the cursor.
  const thought = [...steps].reverse().find((s) => s.status !== "running" && s.summary && !/^[[{]/.test(s.summary.trim()))?.summary?.replace(/\s+/g, " ").slice(0, 140) ?? null;
  const live = run && run.status === "running";
  const done = run && run.status !== "running";
  const seg = path.split(`/events/${eventId}`)[1]?.replace(/^\//, "").split("/")[0] ?? "";
  const segRef = useRef(seg);
  segRef.current = seg;
  const followRef = useRef(follow);
  followRef.current = follow;
  const liveRef = useRef(Boolean(live));
  liveRef.current = Boolean(live);
  // Writing keeps going after the run ends until the tabs it worked on are written.
  const [engaged, setEngaged] = useState(false);
  const visited = useRef(new Set<string>());
  useEffect(() => {
    if (!live) return;
    visited.current.clear();
    ready.current.clear();
    touched.current.clear();
    setEngaged(true);
  }, [live]);

  // New steps landed: queue their tabs, and fetch the fresh data so it can be written in.
  // Several steps can land between two polls (agents run in parallel), so every unseen
  // step counts, not just the latest. Opened mid-run, that includes the steps already done.
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!current) return;
    // A step finishing changes no ids, so readiness is read from every step on every poll.
    for (const st of steps) {
      touched.current.add(stepInfo(st.tool, st.name).seg);
      const t = TOUR.find((x) => x.ready.test(toolKey(st.tool)));
      if (t && st.status !== "running") ready.current.add(t.seg);
    }
    const first = seen.current === null;
    const known = (seen.current ??= new Set());
    const fresh = steps.filter((st) => !known.has(st.id));
    fresh.forEach((st) => known.add(st.id));
    if (!fresh.length || (first && !live)) return;

    const t = setTimeout(() => router.refresh(), 500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id, steps.length, steps.filter((st) => st.status !== "running").length]);

  // The writer: anything new on the page (a tab Gemini moved to, rows that just
  // landed, a header value that changed) waits hidden, then is written in.
  useEffect(() => {
    const root = host.current?.parentElement;
    if (!engaged || !root) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setEngaged(false);
      return;
    }
    const header = document.querySelector<HTMLElement>("[data-live-write]");
    const queue: HTMLElement[] = [];
    let writing: HTMLElement | null = null;
    let stopped = false;
    // When the page last got something new: the pause before the next tab counts from here.
    let arrived = Date.now();
    let pending: string | null = null;
    let pushedAt = 0;
    // Rows that land inside the item being written still get written, after it (else they would just appear).
    const busy = (el: Element) => el === writing || queue.some((q) => q.contains(el));
    const take = (el: Element | null) => {
      // Size is checked when it is written: a board or list that animates in has none yet.
      if (!(el instanceof HTMLElement) || busy(el) || host.current?.contains(el) || el.closest("[aria-busy='true']")) return;
      // A newly queued item swallows queued pieces of itself.
      for (let i = queue.length - 1; i >= 0; i--) if (el.contains(queue[i])) queue.splice(i, 1)[0].classList.remove("mv-pending");
      el.classList.add("mv-pending");
      queue.push(el);
      arrived = Date.now();
    };
    const takeAll = (scope: Element) => scope.querySelectorAll(ITEM).forEach(take);
    const content = new MutationObserver((list) => {
      for (const m of list)
        for (const n of m.addedNodes) {
          if (!(n instanceof Element)) continue;
          if (n.matches(ITEM)) take(n);
          else takeAll(n);
        }
    });
    const head = new MutationObserver((list) => {
      for (const m of list) take((m.target instanceof Element ? m.target : m.target.parentElement)?.closest("dd") ?? null);
    });
    // Our own typing is not news.
    const quiet = () => {
      head.takeRecords();
      content.takeRecords();
    };
    content.observe(root, { childList: true, subtree: true });
    if (header) {
      header.querySelectorAll("dd").forEach(take);
      head.observe(header, { childList: true, characterData: true, subtree: true });
    }
    takeAll(root);

    let wrote = false;
    let wroteHere = false; // something was written since the last tab change
    // The page scrolls with the writing, like reading down a page: only once the words
    // reach the bottom of the screen, smoothly, and never ahead to what is not written yet.
    let scrolled = 0;
    // What actually scrolls: the page itself, or else the nearest panel that scrolls a real distance
    // (boxes with only a horizontal scroll also report overflow-y auto, so the distance is checked).
    const pane = (): HTMLElement => {
      const doc = (document.scrollingElement as HTMLElement) ?? document.documentElement;
      if (doc.scrollHeight - window.innerHeight > 40) return doc;
      for (let n = root.parentElement; n; n = n.parentElement) {
        const o = getComputedStyle(n).overflowY;
        if ((o === "auto" || o === "scroll") && n.scrollHeight - n.clientHeight > 40 && n.clientHeight > 200) return n;
      }
      return doc;
    };
    const follow = (p: { x: number; y: number }) => {
      setPos(p);
      if (!followRef.current || Date.now() - scrolled < 350) return;
      const h = window.innerHeight;
      if (p.y > h - 110 || p.y < 90) {
        scrolled = Date.now();
        const el = pane();
        glide = { el, to: Math.max(0, el.scrollTop + p.y - h * (p.y < 90 ? 0.3 : 0.62)) };
      }
    };
    // Our own ease-out glide, a little each frame (native smooth scrolling stalls in some recorders).
    let glide: { el: HTMLElement; to: number } | null = null;
    const glider = setInterval(() => {
      if (!glide) return;
      const { el, to } = glide;
      const d = to - el.scrollTop;
      if (Math.abs(d) < 2) {
        el.scrollTop = to;
        glide = null;
        return;
      }
      el.scrollTop += Math.sign(d) * Math.max(2, Math.abs(d) * 0.14);
    }, 16);
    (async () => {
      while (!stopped) {
        const el = queue.shift();
        if (el) {
          if (!el.isConnected) continue;
          const r = el.getBoundingClientRect();
          if ((r.width < 40 || r.height < 14) && (el.textContent?.trim().length ?? 0) < 3) {
            el.classList.remove("mv-pending");
            continue;
          }
          writing = el;
          const words = el.textContent?.split(/\s+/).length ?? 1;
          const ms = Math.min(42, Math.max(10, PAGE_MS / Math.max(1, (queue.length + 1) * Math.max(6, words))));
          await writeIn(el, ms, follow, () => stopped, quiet);
          wroteHere = true;
          writing = null;
          wrote = true;
          await sleep(60);
          continue;
        }
        if (wrote) {
          wrote = false;
          setBurst((b) => ({ ...posRef.current, k: (b?.k ?? 0) + 1 }));
        }
        // Just moved: wait for the new tab to load (up to 8 s) before deciding it is written.
        if (pending !== null) {
          // React keeps an old loading placeholder hidden in the page; only a visible one means loading.
          const loading = [...root.querySelectorAll<HTMLElement>("[aria-busy='true']")].some((x) => x.offsetParent !== null);
          if ((segRef.current !== pending || loading) && Date.now() - pushedAt < 8000) {
            await sleep(120);
            continue;
          }
          pending = null;
          arrived = Date.now();
          if (followRef.current && !wroteHere) pane().scrollTo({ top: 0, behavior: "instant" });
          continue;
        }
        // Page written: on to the next tab along the tab bar, once Gemini has finished it.
        // While the run is live a tab that is not ready yet is waited for, never skipped.
        visited.current.add(segRef.current);
        const left = followRef.current ? TOUR.filter((t) => !visited.current.has(t.seg) && (liveRef.current || touched.current.has(t.seg))) : [];
        const upNext = left[0];
        const next = upNext && (ready.current.has(upNext.seg) || !liveRef.current) ? upNext.seg : undefined;
        if (next !== undefined && Date.now() - arrived > MIN_DWELL_MS) {
          visited.current.add(next);
          pending = next;
          pushedAt = Date.now();
          // Tasks opens on the timeline (every task, planned back from the event day); Files on the proposal.
          const query = next === "tasks" ? "?view=timeline" : next === "outputs" ? "?folder=proposal" : "";
          // Each tab opens at the top, header and all; the writing then leads the way down.
          glide = null;
          router.push(`/events/${eventId}${next ? `/${next}` : ""}${query}`, { scroll: false });
          pane().scrollTo({ top: 0, behavior: "instant" });
          wroteHere = false;
          const h = root.querySelector("h2, h3, th, [class*='mono-label']")?.getBoundingClientRect();
          if (h) setPos({ x: h.left + 12, y: h.top + 10 });
        } else if (!upNext && !liveRef.current) {
          setEngaged(false);
          return;
        }
        await sleep(120);
      }
    })();
    return () => {
      stopped = true;
      clearInterval(glider);
      content.disconnect();
      head.disconnect();
      queue.splice(0).forEach((el) => el.classList.remove("mv-pending"));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engaged, eventId]);

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
          <span className="text-sm font-semibold text-ink">{live ? `${who} is building this project` : `${who} finished`}</span>
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

      {/* Little live feed of the last steps. */}
      <div className="pointer-events-none fixed bottom-5 right-[100px] z-[60] w-72 space-y-1.5">
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

      {(live || engaged) && <AssistantCursor x={pos.x} y={pos.y} chip={live ? (info?.doing ?? "working") : "writing it up"} name={run.source === "gemini" ? "Gemini" : "AI assistant"} thought={thought} />}
      {burst && <Sparkles x={burst.x} y={burst.y} k={burst.k} />}
    </div>
  );
}
