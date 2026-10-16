"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowUp, Check, ChevronDown, Loader2, PencilLine, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { MicButton, useDictation } from "./quick-picks";

/**
 * Movi, the Movents pet. Sits in the corner of every page; on an event, tell
 * it what to change ("raise the budget to RM5,000") and it proposes the
 * edits. Nothing changes until you accept them; type again to refine.
 */

type Proposal = { tool: string; args: Record<string, unknown>; label: string; detail?: string };
type Msg = { role: "user" | "assistant"; text: string; proposals?: Proposal[]; state?: "open" | "applied" | "dismissed"; results?: { label: string; ok: boolean; detail?: string }[]; runId?: string };

const IDEAS = ["Raise the budget to RM5,000", "Move it to next Saturday, same time", "Add a risk for heavy rain on the day", "Make the objectives more specific"];

function Face({ blink, look, mood }: { blink: boolean; look: { x: number; y: number }; mood: "idle" | "think" | "happy" }) {
  const eye = (cx: number) => (
    <g key={cx}>
      <ellipse cx={cx} cy={27} rx={6} ry={blink ? 0.8 : 6.5} fill="#fff" stroke="#161514" strokeWidth={1.6} />
      {!blink && <circle cx={cx + look.x} cy={27 + look.y} r={2.8} fill="#161514" />}
    </g>
  );
  return (
    <svg viewBox="0 0 64 64" className="size-full" aria-hidden>
      <path d="M14 18 L18 6 L25 14 M50 18 L46 6 L39 14" fill="#ff5a36" stroke="#161514" strokeWidth={1.8} strokeLinejoin="round" />
      <rect x={6} y={12} width={52} height={44} rx={20} fill="#ff5a36" stroke="#161514" strokeWidth={1.8} />
      <ellipse cx={20} cy={40} rx={4} ry={2.2} fill="#ffb3a1" opacity={0.9} />
      <ellipse cx={44} cy={40} rx={4} ry={2.2} fill="#ffb3a1" opacity={0.9} />
      {eye(24)}
      {eye(40)}
      {mood === "happy" ? (
        <path d="M27 41 Q32 46 37 41" fill="none" stroke="#161514" strokeWidth={1.8} strokeLinecap="round" />
      ) : mood === "think" ? (
        <circle cx={32} cy={42} r={1.8} fill="#161514" />
      ) : (
        <path d="M28.5 41.5 Q32 44 35.5 41.5" fill="none" stroke="#161514" strokeWidth={1.8} strokeLinecap="round" />
      )}
    </svg>
  );
}

export function Movi() {
  const pathname = usePathname();
  const router = useRouter();
  const reduce = useReducedMotion();
  const eventId = pathname.match(/\/events\/(evt_[a-z0-9]+)/)?.[1] ?? null;
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [interim, setInterim] = useState("");
  const [busy, setBusy] = useState(false);
  const [blink, setBlink] = useState(false);
  const [look, setLook] = useState({ x: 0, y: 0 });
  const [hint, setHint] = useState(false);
  const pet = useRef<HTMLButtonElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const base = useRef("");
  const dictation = useDictation((finalText, live) => {
    if (finalText) {
      base.current = `${base.current}${base.current ? " " : ""}${finalText.trim()}`;
      setInput(base.current);
    }
    setInterim(live);
  });

  // A new event, a new conversation.
  useEffect(() => setMsgs([]), [eventId]);

  // Eyes follow the cursor; a blink every few seconds.
  useEffect(() => {
    if (reduce) return;
    const move = (e: MouseEvent) => {
      const r = pet.current?.getBoundingClientRect();
      if (!r) return;
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height / 2);
      const d = Math.max(1, Math.hypot(dx, dy));
      setLook({ x: (dx / d) * Math.min(2.6, d / 60), y: (dy / d) * Math.min(2.2, d / 60) });
    };
    window.addEventListener("mousemove", move);
    const t = setInterval(() => {
      setBlink(true);
      setTimeout(() => setBlink(false), 140);
    }, 4200);
    return () => {
      window.removeEventListener("mousemove", move);
      clearInterval(t);
    };
  }, [reduce]);

  // Say hello once per event page.
  useEffect(() => {
    if (!eventId) return;
    setHint(true);
    const t = setTimeout(() => setHint(false), 6000);
    return () => clearTimeout(t);
  }, [eventId]);

  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: "smooth" });
  }, [msgs, busy]);

  async function ask(text: string) {
    const message = text.trim();
    if (!message || busy || !eventId) return;
    dictation.stop();
    const history = msgs.map((m) => ({ role: m.role, text: m.text }));
    // A new request replaces any proposal still waiting.
    setMsgs((m) => [...m.map((x) => (x.state === "open" ? { ...x, state: "dismissed" as const } : x)), { role: "user", text: message }]);
    setInput("");
    base.current = "";
    setInterim("");
    setBusy(true);
    try {
      const res = await fetch("/api/assistant", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ event_id: eventId, message, history }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Movi could not answer");
      setMsgs((m) => [...m, { role: "assistant", text: json.reply, proposals: json.proposals, state: json.proposals?.length ? "open" : undefined }]);
    } catch (err) {
      setMsgs((m) => [...m, { role: "assistant", text: err instanceof Error ? err.message : "Something went wrong" }]);
    } finally {
      setBusy(false);
    }
  }

  async function accept(index: number, chosen: Proposal[]) {
    if (!chosen.length || !eventId) return;
    const request = [...msgs].slice(0, index).reverse().find((m) => m.role === "user")?.text ?? "";
    setBusy(true);
    try {
      const res = await fetch("/api/assistant/apply", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ event_id: eventId, proposals: chosen, request }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not apply the changes");
      setMsgs((m) => m.map((x, i) => (i === index ? { ...x, state: "applied", results: json.results, runId: json.run_id } : x)));
      const failed = (json.results as { ok: boolean }[]).filter((r) => !r.ok).length;
      if (failed) toast.error(`${failed} change(s) could not be applied`);
      else toast.success("Done. The event is updated.");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not apply the changes");
    } finally {
      setBusy(false);
    }
  }

  function refine() {
    field.current?.focus();
  }

  const mood = busy ? "think" : msgs.at(-1)?.state === "applied" ? "happy" : "idle";

  return (
    <div className="fixed bottom-[88px] right-3 z-[65] flex flex-col items-end gap-3 md:bottom-5 md:right-5 print:hidden">
      <AnimatePresence>
        {open && (
          <motion.div
            key="panel"
            initial={{ opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
            style={{ transformOrigin: "bottom right" }}
            className="flex max-h-[min(64vh,620px)] md:max-h-[min(72vh,620px)] w-[min(380px,calc(100vw-40px))] flex-col overflow-hidden rounded-2xl border-[1.5px] border-ink bg-card shadow-[4px_4px_0_0_#161514]"
          >
            <div className="flex items-center justify-between border-b-[1.5px] border-ink bg-ink px-4 py-2.5 text-white">
              <div>
                <p className="font-display text-base font-bold leading-none">Movi</p>
                <p className="mt-0.5 text-[11px] text-white/65">{eventId ? "Tell me what to change on this event" : "Open an event and I can change it"}</p>
              </div>
              <button onClick={() => setOpen(false)} aria-label="Close" className="grid size-7 place-items-center rounded-lg text-white/70 transition-colors hover:bg-white/10 hover:text-white">
                <X className="size-4" />
              </button>
            </div>

            <div ref={list} className="min-h-[120px] flex-1 space-y-3 overflow-y-auto px-4 py-3 scrollbar-thin">
              {!eventId && (
                <p className="text-sm text-ink/75">
                  I edit events you are working on. Pick one from <b>Projects</b> in the sidebar, or plan a new one from{" "}
                  <Link href="/new" className="font-semibold text-tomato-ink underline-offset-2 hover:underline">New event</Link>.
                </p>
              )}
              {eventId && !msgs.length && (
                <div>
                  <p className="text-sm text-ink/75">Hi! Type or say what to change. I will show you the plan first, and nothing changes until you accept.</p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {IDEAS.map((idea, i) => (
                      <motion.button
                        key={idea}
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0, transition: { delay: 0.05 + i * 0.04 } }}
                        whileHover={{ y: -1 }}
                        onClick={() => ask(idea)}
                        className="rounded-full border-[1.5px] border-dashed border-ink/25 px-2.5 py-1 text-left text-xs text-ink/70 transition-colors hover:border-ink hover:text-ink"
                      >
                        {idea}
                      </motion.button>
                    ))}
                  </div>
                </div>
              )}
              {msgs.map((m, i) => (
                <motion.div key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                  <div className={cn("max-w-[88%] rounded-2xl px-3 py-2 text-sm", m.role === "user" ? "rounded-br-md bg-ink text-white" : "rounded-bl-md bg-sand/60 text-ink")}>
                    <p className="whitespace-pre-line leading-relaxed">{m.text}</p>
                    {m.proposals?.length ? <Proposals msg={m} busy={busy} onAccept={(chosen) => accept(i, chosen)} onRefine={refine} /> : null}
                  </div>
                </motion.div>
              ))}
              {busy && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin" /> Movi is thinking…
                </div>
              )}
            </div>

            {eventId && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  ask(input);
                }}
                className="flex items-end gap-2 border-t-[1.5px] border-dashed border-ink/25 p-3"
              >
                <textarea
                  ref={field}
                  rows={1}
                  value={interim ? `${input}${input ? " " : ""}${interim}` : input}
                  onChange={(e) => {
                    setInput(e.target.value);
                    base.current = e.target.value;
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      ask(input);
                    }
                  }}
                  placeholder={dictation.listening ? "Listening…" : msgs.some((m) => m.state === "open") ? "Not quite? Say what to change" : "e.g. raise the budget to RM5,000"}
                  className="max-h-28 min-h-10 flex-1 resize-none rounded-xl border-[1.5px] border-ink/20 bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-ink"
                />
                <MicButton
                  listening={dictation.listening}
                  supported={dictation.supported}
                  onStart={() => {
                    base.current = input.trim();
                    dictation.start();
                  }}
                  onStop={dictation.stop}
                />
                <motion.button whileTap={{ scale: 0.92 }} type="submit" disabled={busy || !input.trim()} aria-label="Send" className="grid size-10 place-items-center rounded-full border-[1.5px] border-ink bg-tomato shadow-[2px_2px_0_0_#161514] disabled:opacity-40">
                  <ArrowUp className="size-4" />
                </motion.button>
              </form>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="relative">
        <AnimatePresence>
          {hint && !open && (
            <motion.button
              key="hint"
              initial={{ opacity: 0, x: 8, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 8 }}
              onClick={() => setOpen(true)}
              className="absolute bottom-3 right-[76px] whitespace-nowrap rounded-xl rounded-br-sm border-[1.5px] border-ink bg-card px-3 py-1.5 text-xs font-medium shadow-[2px_2px_0_0_#161514]"
            >
              Need to change something? Ask me.
            </motion.button>
          )}
        </AnimatePresence>
        <motion.button
          ref={pet}
          onClick={() => {
            setOpen((o) => !o);
            setHint(false);
          }}
          aria-label={open ? "Close Movi" : "Open Movi, the Movents helper"}
          title="Movi"
          animate={reduce || open ? { y: 0 } : { y: [0, -4, 0] }}
          transition={reduce || open ? { duration: 0.2 } : { duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
          whileHover={{ rotate: [0, -6, 6, 0], transition: { duration: 0.5 } }}
          whileTap={{ scale: 0.9 }}
          className="relative size-16 drop-shadow-[2px_3px_0_#161514]"
        >
          <Face blink={blink} look={look} mood={mood} />
          {msgs.some((m) => m.state === "open") && !open && <span className="absolute right-1 top-1 size-3 rounded-full border-[1.5px] border-ink bg-sun" />}
        </motion.button>
      </div>
    </div>
  );
}

function Proposals({ msg, busy, onAccept, onRefine }: { msg: Msg; busy: boolean; onAccept: (p: Proposal[]) => void; onRefine: () => void }) {
  const items = msg.proposals ?? [];
  const [on, setOn] = useState<boolean[]>(() => items.map(() => true));
  const [openDetail, setOpenDetail] = useState<number | null>(null);
  const done = msg.state === "applied";
  const dismissed = msg.state === "dismissed";
  return (
    <div className={cn("mt-2 rounded-xl border-[1.5px] border-ink bg-card p-2", dismissed && "opacity-50")}>
      <p className="mono-label px-1 pb-1 text-[9.5px] text-muted-foreground">{done ? "Applied" : dismissed ? "Replaced by a newer request" : "Proposed changes"}</p>
      <ul className="space-y-1">
        {items.map((p, i) => {
          const res = msg.results?.find((r) => r.label === p.label);
          return (
            <li key={i} className="rounded-lg px-1 py-1 hover:bg-sand/40">
              <div className="flex items-start gap-2">
                {done ? (
                  <span className={cn("mt-0.5 grid size-4 shrink-0 place-items-center rounded-full text-[10px] text-white", res?.ok === false ? "bg-tomato-ink" : "bg-[#1f5c2b]")}>{res?.ok === false ? "!" : <Check className="size-3" />}</span>
                ) : (
                  <input
                    type="checkbox"
                    checked={on[i]}
                    disabled={dismissed}
                    onChange={() => setOn((o) => o.map((x, j) => (j === i ? !x : x)))}
                    className="mt-0.5 size-4 shrink-0 accent-[#ff5a36]"
                    aria-label={p.label}
                  />
                )}
                <button type="button" onClick={() => setOpenDetail(openDetail === i ? null : i)} className="flex-1 text-left text-[13px] leading-snug text-ink" disabled={!p.detail}>
                  {p.label}
                  {p.detail && <ChevronDown className={cn("ml-1 inline size-3.5 opacity-50 transition-transform", openDetail === i && "rotate-180")} />}
                </button>
              </div>
              {res?.ok === false && res.detail && <p className="ml-6 mt-0.5 text-[11.5px] text-tomato-ink">{res.detail}</p>}
              <AnimatePresence initial={false}>
                {openDetail === i && p.detail && (
                  <motion.p initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="ml-6 overflow-hidden whitespace-pre-line text-[12px] text-ink/70">
                    {p.detail}
                  </motion.p>
                )}
              </AnimatePresence>
            </li>
          );
        })}
      </ul>
      {!done && !dismissed && (
        <div className="mt-2 flex gap-1.5">
          <motion.button
            whileTap={{ scale: 0.95 }}
            whileHover={{ y: -1 }}
            disabled={busy || !on.some(Boolean)}
            onClick={() => onAccept(items.filter((_, i) => on[i]))}
            className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg border-[1.5px] border-ink bg-tomato text-xs font-semibold shadow-[2px_2px_0_0_#161514] disabled:opacity-40"
          >
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />} Accept{on.filter(Boolean).length < items.length ? ` ${on.filter(Boolean).length}` : ""}
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={onRefine}
            className="flex h-8 items-center gap-1.5 rounded-lg border-[1.5px] border-ink/25 px-3 text-xs font-medium text-ink/70 transition-colors hover:border-ink hover:text-ink"
          >
            <PencilLine className="size-3.5" /> Refine
          </motion.button>
        </div>
      )}
      {done && msg.runId && (
        <Link href={`/runs/${msg.runId}`} className="mt-1.5 block px-1 text-[11.5px] font-medium text-tomato-ink underline-offset-2 hover:underline">
          See what ran
        </Link>
      )}
    </div>
  );
}
