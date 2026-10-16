"use client";

import { useOptimistic, useTransition } from "react";
import { motion } from "motion/react";
import { Check, Instagram, Linkedin, Mail, MessageCircle, StickyNote } from "lucide-react";
import { setPromo } from "@/app/actions";
import { cn } from "@/lib/utils";

const ICON: Record<string, React.ComponentType<{ className?: string }>> = { Instagram, LinkedIn: Linkedin, Email: Mail, Poster: StickyNote, WhatsApp: MessageCircle };

type Item = { id: string; channel: string; title: string; due_date: string; status: string; link: string | null };

export function PromoChecklist({ items }: { items: Item[] }) {
  const [, start] = useTransition();
  const [opt, set] = useOptimistic(items, (s, u: { id: string; status: string }) => s.map((i) => (i.id === u.id ? { ...i, status: u.status } : i)));
  const done = opt.filter((i) => i.status === "done").length;
  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
          <motion.div className="h-full rounded-full bg-primary" initial={{ width: 0 }} animate={{ width: `${opt.length ? (done / opt.length) * 100 : 0}%` }} />
        </div>
        <span className="text-xs tabular text-muted-foreground">{done}/{opt.length}</span>
      </div>
      <ul className="space-y-1.5">
        {opt.map((i, idx) => {
          const Icon = ICON[i.channel] ?? StickyNote;
          const isDone = i.status === "done";
          return (
            <motion.li key={i.id} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: idx * 0.03 }}>
              <button
                onClick={() =>
                  start(async () => {
                    const next = isDone ? "todo" : "done";
                    set({ id: i.id, status: next });
                    await setPromo(i.id, next);
                  })
                }
                className="group flex w-full items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5 text-left transition-colors hover:border-primary/40"
              >
                <span className={cn("grid size-5 place-items-center rounded-md border transition-colors", isDone ? "border-primary bg-primary text-primary-foreground" : "border-input group-hover:border-primary")}>
                  {isDone && (
                    <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 500, damping: 18 }}>
                      <Check className="size-3.5" />
                    </motion.span>
                  )}
                </span>
                <Icon className="size-4 text-muted-foreground transition-transform group-hover:scale-110" />
                <span className={cn("flex-1 text-sm", isDone && "text-muted-foreground line-through")}>{i.title}</span>
                <span className="text-xs text-muted-foreground">{i.channel} · {new Date(`${i.due_date}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })}</span>
              </button>
            </motion.li>
          );
        })}
      </ul>
      {opt.length === 0 && <p className="text-sm text-muted-foreground">No promotion plan yet, run the agent.</p>}
    </div>
  );
}
