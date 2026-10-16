"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { ArrowUp, Check, Copy, Keyboard, Loader2, PenLine, Play, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Barcode } from "@/components/ep/kit";
import { parsePrompt } from "@/lib/planning";
import { cn } from "@/lib/utils";
import type { Role } from "@/lib/types";
import { MicButton, useDictation } from "./quick-picks";
import { BriefBuilder, briefSentence, type Brief } from "./brief-builder";

type Person = { id: string; name: string; role: Role; department: string | null };

/** Ready-made briefs: one tap fills the sentence (or the text box). */
function suggestions(today: string): { text: string; brief: Brief }[] {
  const sat = (days: number) => {
    const d = new Date(`${today}T00:00:00`);
    d.setDate(d.getDate() + days);
    d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7));
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  return [
    { text: "An AI in healthcare talk with industry speakers for 150 students, budget RM3,000.", brief: { format: "talk", topic: "AI in healthcare", pax: 150, date: sat(42), time: "afternoon", budget: 3000, team: [] } },
    { text: "A hands-on Gemini workshop for about 80 first-years next month, Saturday morning, RM1,500 max.", brief: { format: "workshop", topic: "Gemini for beginners", pax: 80, date: sat(30), time: "morning", budget: 1500, team: [] } },
    { text: "A 24-hour climate hackathon for 120 students in December, budget RM5,000.", brief: { format: "hackathon", topic: "climate tech", pax: 120, date: sat(56), time: "full", budget: 5000, team: [] } },
  ];
}

/**
 * Write the brief once. Fill in the sentence (tap each blank), or type or say
 * it in your own words. With Gemini on the server, "Plan with Gemini" runs the
 * multi-agent planner here; you can still copy the brief into your own AI
 * assistant, which plans through Movents over MCP.
 */
export function PromptBox({ today, people, me, gemini = false }: { today: string; people: Person[]; me: string; gemini?: boolean }) {
  const [mode, setMode] = useState<"fill" | "type">("fill");
  const [brief, setBrief] = useState<Brief>({ team: [] });
  const [prompt, setPrompt] = useState("");
  const [interim, setInterim] = useState("");
  const base = useRef("");
  const dictation = useDictation((finalText, live) => {
    if (finalText) {
      base.current = `${base.current}${base.current && !base.current.endsWith(" ") ? " " : ""}${finalText.trim()}`;
      setPrompt(base.current);
    }
    setInterim(live);
  });
  function startDictation() {
    setMode("type");
    base.current = prompt.trim();
    setInterim("");
    dictation.start();
  }
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const router = useRouter();
  const isReport = mode === "type" && /report/i.test(prompt) && !/plan/i.test(prompt);
  const message = useMemo(() => (mode === "fill" ? briefSentence(brief, people) : prompt.trim()), [mode, brief, people, prompt]);
  const parsed = useMemo(() => (message && !isReport ? parsePrompt(message, today) : null), [message, today, isReport]);
  const ideas = useMemo(() => suggestions(today), [today]);

  async function run() {
    if (!message || busy) return;
    setBusy(true);
    const res = await fetch("/api/agent/run", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt: message }) });
    const json = await res.json();
    if (!res.ok) {
      toast.error(json.error ?? "Could not start the agent");
      setBusy(false);
      return;
    }
    router.push(`/runs/${json.run_id}`);
  }

  async function copy() {
    if (!message) return;
    await navigator.clipboard.writeText(message).catch(() => null);
    setCopied(true);
    toast.success("Copied. Paste it into your AI assistant (Claude, ChatGPT, Cursor…)");
    setTimeout(() => setCopied(false), 1600);
  }

  const fields = parsed
    ? [
        ["Date", new Date(`${parsed.date}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).toUpperCase()],
        ["Pax", String(parsed.pax)],
        ["Budget", `RM${parsed.budget.toLocaleString()}`],
        ["Team", String(parsed.team.length + 1)],
      ]
    : [];

  return (
    <div>
      <div className="relative rounded-2xl border-[1.5px] border-ink bg-card shadow-[4px_4px_0_0_#161514] transition-shadow focus-within:shadow-[5px_5px_0_0_#ff5a36]">
        <span aria-hidden className="absolute -left-[11px] top-1/2 size-5 -translate-y-1/2 rounded-full border-[1.5px] border-ink bg-background" />
        <span aria-hidden className="absolute -right-[11px] top-1/2 size-5 -translate-y-1/2 rounded-full border-[1.5px] border-ink bg-background" />
        <div className="flex items-center justify-between gap-2 px-6 pt-4">
          <div role="tablist" aria-label="How to write the brief" className="relative flex rounded-full border-[1.5px] border-ink/15 p-0.5 text-xs font-medium">
            {([["fill", "Fill in the blanks", PenLine], ["type", "Type or speak", Keyboard]] as const).map(([k, label, Ico]) => (
              <button key={k} role="tab" aria-selected={mode === k} type="button" onClick={() => setMode(k)} className={cn("relative z-10 flex items-center gap-1.5 rounded-full px-3 py-1 transition-colors", mode === k ? "text-white" : "text-ink/60 hover:text-ink")}>
                {mode === k && <motion.span layoutId="brief-mode" className="absolute inset-0 -z-10 rounded-full bg-ink" transition={{ type: "spring", stiffness: 500, damping: 36 }} />}
                <Ico className="size-3.5" />
                {label}
              </button>
            ))}
          </div>
          <MicButton listening={dictation.listening} supported={dictation.supported} onStart={startDictation} onStop={dictation.stop} />
        </div>
        <AnimatePresence mode="wait" initial={false}>
          {mode === "fill" ? (
            <motion.div key="fill" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }}>
              <BriefBuilder today={today} people={people} me={me} brief={brief} onChange={setBrief} />
            </motion.div>
          ) : (
            <motion.div key="type" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }}>
              <textarea
                value={interim ? `${prompt}${prompt ? " " : ""}${interim}` : prompt}
                onChange={(e) => {
                  setPrompt(e.target.value);
                  base.current = e.target.value;
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    if (gemini) run();
                    else copy();
                  }
                }}
                autoFocus
                rows={3}
                aria-label="Describe your event"
                placeholder={dictation.listening ? "Listening, say what you want to run" : "Say it your way: what, for whom, when, how many and the budget."}
                className="w-full resize-none bg-transparent px-6 pb-3 pt-4 font-display text-xl font-semibold leading-snug tracking-tight outline-none placeholder:font-medium placeholder:text-ink/25 md:text-2xl"
              />
            </motion.div>
          )}
        </AnimatePresence>
        <div className="flex items-end justify-between gap-4 border-t border-dashed border-ink/30 px-6 pb-4 pt-3">
          <dl className="flex min-h-[38px] flex-wrap items-end gap-x-7 gap-y-1">
            <AnimatePresence>
              {fields.map(([k, v]) => (
                <motion.div key={k} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                  <dt className="mono-label text-[9.5px] text-muted-foreground">{k}</dt>
                  <dd className="font-mono text-sm font-bold">{v}</dd>
                </motion.div>
              ))}
            </AnimatePresence>
            {!parsed && <Barcode value={message || "movents"} className="h-8 w-28 opacity-25" />}
          </dl>
          <div className="flex shrink-0 items-center gap-2">
            {gemini ? (
              <>
                <motion.button
                  whileTap={{ scale: 0.92 }}
                  disabled={!message}
                  onClick={copy}
                  title="Copy the brief for your own AI assistant (Claude, ChatGPT, Cursor)"
                  aria-label="Copy for your AI assistant"
                  className="grid size-11 place-items-center rounded-xl border-[1.5px] border-ink/25 text-ink/60 transition-colors hover:border-ink hover:text-ink disabled:opacity-30"
                >
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.span key={copied ? "y" : "n"} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}>
                      {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                    </motion.span>
                  </AnimatePresence>
                </motion.button>
                <motion.button
                  whileTap={{ scale: 0.94 }}
                  whileHover={{ y: -1 }}
                  disabled={busy || !message}
                  onClick={run}
                  className="group flex h-11 items-center gap-2 rounded-xl border-[1.5px] border-ink bg-tomato px-4 text-sm font-semibold shadow-[2px_2px_0_0_#161514] transition-[opacity,box-shadow] hover:shadow-[3px_3px_0_0_#161514] disabled:opacity-40"
                >
                  {busy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4 transition-transform duration-300 group-hover:rotate-12 group-hover:scale-110" />}
                  Plan with Gemini
                </motion.button>
              </>
            ) : (
              <>
                <motion.button
                  whileTap={{ scale: 0.92 }}
                  disabled={busy || !message}
                  onClick={run}
                  title="Run here without an AI assistant"
                  aria-label="Run here"
                  className="grid size-11 place-items-center rounded-xl border-[1.5px] border-ink/25 text-ink/60 transition-colors hover:border-ink hover:text-ink disabled:opacity-30"
                >
                  {busy ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
                </motion.button>
                <motion.button
                  whileTap={{ scale: 0.94 }}
                  whileHover={{ y: -1 }}
                  disabled={!message}
                  onClick={copy}
                  className="flex h-11 items-center gap-2 rounded-xl border-[1.5px] border-ink bg-tomato px-4 text-sm font-semibold shadow-[2px_2px_0_0_#161514] transition-opacity disabled:opacity-40"
                >
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.span key={copied ? "y" : "n"} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}>
                      {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                    </motion.span>
                  </AnimatePresence>
                  Copy for AI
                </motion.button>
              </>
            )}
          </div>
        </div>
      </div>
      <p className="mt-3 text-center text-xs text-muted-foreground">
        {gemini
          ? "Gemini agents plan it here: proposal, budget, speakers, risks and promotion, checked against your SOP. Emails wait for you to send; money and faculty wait for sign-off."
          : "Paste it into your AI assistant (Claude, ChatGPT, Cursor…) and it plans the event through Movents."}{" "}
        <Link href="/settings" className="font-medium text-tomato-ink underline-offset-2 hover:underline">
          Connect your assistant
        </Link>
      </p>
      <div className="mt-4 flex flex-col gap-2">
        {ideas.map(({ text: s, brief: b }, i) => (
          <motion.button
            key={s}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 + i * 0.05 }}
            onClick={() => (mode === "fill" ? setBrief({ ...b, team: brief.team }) : setPrompt(s))}
            className="group flex items-center justify-between rounded-xl border-[1.5px] border-dashed border-ink/25 px-4 py-2.5 text-left text-sm text-ink/70 transition-colors hover:border-ink hover:bg-card hover:text-ink"
          >
            {s}
            <ArrowUp className="size-3.5 rotate-45 opacity-0 transition-opacity group-hover:opacity-100" />
          </motion.button>
        ))}
      </div>
    </div>
  );
}
