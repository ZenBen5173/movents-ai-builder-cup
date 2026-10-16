"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { ArrowUp, Check, Copy, Loader2, Play } from "lucide-react";
import { toast } from "sonner";
import { Barcode, ROLE_BAND } from "@/components/ep/kit";
import { parsePrompt } from "@/lib/planning";
import { cn } from "@/lib/utils";
import type { Role } from "@/lib/types";

const SUGGESTIONS = [
  "Plan a 150-pax AI talk at Sunway on 15 Nov, budget RM3,000. Use Mix Mix Catering for food.",
  "Plan a 60-pax data science workshop at Sunway on 12 Feb, 2pm-5pm, budget RM1,200.",
  "Generate the post-event report for the AI talk.",
];

type Person = { id: string; name: string; role: Role; department: string | null };

const first = (n: string) => n.replace(/^(Dr\.?)\s+/, "").split(/\s+/)[0];

/**
 * Write the brief once: goal, date, pax, budget, team. It goes to your AI assistant
 * (copy) — the assistant runs the plan through Movents over MCP. "Run here" is the offline fallback.
 */
export function PromptBox({ today, people, me }: { today: string; people: Person[]; me: string }) {
  const [prompt, setPrompt] = useState("");
  const [team, setTeam] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const router = useRouter();
  const isReport = /report/i.test(prompt) && !/plan/i.test(prompt);
  const message = useMemo(() => {
    const p = prompt.trim();
    if (!p || isReport || !team.length) return p;
    const names = team.map((id) => people.find((x) => x.id === id)?.name).filter(Boolean) as string[];
    return `${p.replace(/\.$/, "")}, with ${names.map(first).join(", ")}.`;
  }, [prompt, team, people, isReport]);
  const parsed = useMemo(() => (message && !isReport ? parsePrompt(message, today) : null), [message, today, isReport]);

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
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              copy();
            }
          }}
          autoFocus
          rows={3}
          aria-label="Describe your event"
          placeholder="Plan a 150-pax AI talk at Sunway on 15 Nov, budget RM3,000."
          className="w-full resize-none bg-transparent px-6 pt-5 font-display text-xl font-semibold leading-snug tracking-tight outline-none placeholder:font-medium placeholder:text-ink/25 md:text-2xl"
        />
        {!isReport && (
          <div className="flex flex-wrap items-center gap-1.5 px-6 pb-3">
            <span className="mono-label mr-1 text-[9.5px] text-muted-foreground">Team</span>
            {people
              .filter((p) => p.id !== me)
              .map((p) => {
                const on = team.includes(p.id);
                return (
                  <motion.button
                    key={p.id}
                    whileTap={{ scale: 0.94 }}
                    title={p.department ?? p.role}
                    onClick={() => setTeam((t) => (on ? t.filter((x) => x !== p.id) : [...t, p.id]))}
                    className={cn("flex items-center gap-1.5 rounded-full border-[1.5px] py-0.5 pl-0.5 pr-2.5 text-xs transition-all", on ? "border-ink bg-ink text-white" : "border-ink/20 text-ink/60 hover:border-ink hover:text-ink")}
                  >
                    <span className={cn("grid size-5 place-items-center rounded-full font-display text-[9px] font-bold text-ink", ROLE_BAND[p.role].bg)}>{on ? <Check className="size-3" /> : p.name[0]}</span>
                    {first(p.name)}
                  </motion.button>
                );
              })}
          </div>
        )}
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
            {!parsed && <Barcode value={prompt || "movents"} className="h-8 w-28 opacity-25" />}
          </dl>
          <div className="flex shrink-0 items-center gap-2">
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
          </div>
        </div>
      </div>
      <p className="mt-3 text-center text-xs text-muted-foreground">
        Paste it into your AI assistant (Claude, ChatGPT, Cursor…) and it plans the event through Movents.{" "}
        <Link href="/settings" className="font-medium text-tomato-ink underline-offset-2 hover:underline">
          Connect your assistant
        </Link>
      </p>
      <div className="mt-4 flex flex-col gap-2">
        {SUGGESTIONS.map((s, i) => (
          <motion.button
            key={s}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 + i * 0.05 }}
            onClick={() => setPrompt(s)}
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
