"use client";

import { useState, useTransition } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown, Loader2, Send, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { decideDraftAction } from "@/app/actions-inbox";
import { cn } from "@/lib/utils";

export type Draft = { id: string; kind: string; title: string; to: string; subject: string; text: string; created_at: string };

const KIND: Record<string, string> = { "email.speaker": "Speaker invite", "email.sponsor": "Sponsorship", "email.vendor": "Quote request" };

/**
 * Emails Gemini drafted for you. Nothing was sent: check the address (the
 * agent leaves it empty when no public email was found), then send or bin it.
 */
export function DraftsPanel({ drafts }: { drafts: Draft[] }) {
  const [gone, setGone] = useState<string[]>([]);
  const left = drafts.filter((d) => !gone.includes(d.id));
  if (!drafts.length) return null;
  return (
    <section id="drafts" className="mb-8 scroll-mt-24">
      <div className="mb-3 flex items-end justify-between border-b-[1.5px] border-ink pb-2">
        <h2 className="flex items-center gap-2 font-display text-xl font-bold">
          <Sparkles className="size-4 text-tomato" /> Drafts from Gemini
        </h2>
        <span className="mono-label text-[10px] text-muted-foreground">{left.length} to review · nothing sent yet</span>
      </div>
      <ul className="space-y-2">
        <AnimatePresence initial={false}>
          {left.map((d, i) => (
            <DraftRow key={d.id} d={d} index={i} onDone={() => setGone((g) => [...g, d.id])} />
          ))}
        </AnimatePresence>
      </ul>
      {!left.length && <p className="py-4 text-sm text-muted-foreground">All drafts handled.</p>}
    </section>
  );
}

function DraftRow({ d, index, onDone }: { d: Draft; index: number; onDone: () => void }) {
  const [to, setTo] = useState(d.to);
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [which, setWhich] = useState<"send" | "discard" | null>(null);
  const missing = !to.trim();

  function act(decision: "send" | "discard") {
    setWhich(decision);
    start(async () => {
      const r = await decideDraftAction(d.id, decision, { to });
      if (!r.ok) toast.error(r.error);
      else {
        toast.success(r.message ?? "Done");
        onDone();
      }
      setWhich(null);
    });
  }

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0, transition: { delay: index * 0.04 } }}
      exit={{ opacity: 0, x: 24, transition: { duration: 0.2 } }}
      className="group rounded-xl border-[1.5px] border-ink/15 bg-card px-4 py-3 transition-colors hover:border-ink"
    >
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-start gap-2 text-left">
        <span className="mt-0.5 shrink-0 rounded-md bg-ink/5 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">{KIND[d.kind] ?? d.kind}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold leading-snug">{d.title}</span>
          {d.subject && <span className="block truncate text-xs text-muted-foreground">{d.subject}</span>}
        </span>
        <ChevronDown className={cn("mt-0.5 size-4 shrink-0 opacity-50 transition-transform group-hover:opacity-100", open && "rotate-180")} />
      </button>
      <div className="mt-2.5 flex items-center gap-1.5">
        <label className="flex min-w-0 flex-1 items-center gap-1.5 text-xs">
          <span className="text-muted-foreground">To</span>
          <input
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder={missing ? "no public email found, add one" : "email address"}
            type="email"
            className={cn("h-8 min-w-0 flex-1 rounded-lg border-[1.5px] bg-background px-2 text-xs outline-none transition-colors focus:border-ink", missing ? "border-tomato/60" : "border-ink/15")}
          />
        </label>
        <motion.button
          type="button"
          whileTap={{ scale: 0.92 }}
          disabled={pending}
          onClick={() => act("discard")}
          title="Discard draft"
          aria-label="Discard draft"
          className="grid size-8 shrink-0 place-items-center rounded-lg border-[1.5px] border-ink/15 text-ink/50 transition-colors hover:border-ink hover:text-ink disabled:opacity-40"
        >
          {pending && which === "discard" ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
        </motion.button>
        <motion.button
          type="button"
          whileHover={{ y: -1 }}
          whileTap={{ scale: 0.94 }}
          disabled={pending || missing}
          onClick={() => act("send")}
          title={missing ? "Add the email address first" : "Send it"}
          className="group/send flex h-8 shrink-0 items-center gap-1.5 rounded-lg border-[1.5px] border-ink bg-tomato px-3 text-xs font-semibold shadow-[2px_2px_0_0_#161514] transition-opacity disabled:opacity-40"
        >
          {pending && which === "send" ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5 transition-transform group-hover/send:-translate-y-px group-hover/send:translate-x-px" />}
          Send
        </motion.button>
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <p className="mt-3 whitespace-pre-line border-t border-dashed border-ink/20 pt-3 text-[13px] leading-relaxed text-ink/80">{d.text}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.li>
  );
}
