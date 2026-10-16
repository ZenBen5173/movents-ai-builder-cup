"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { ArrowUpRight, Mail } from "lucide-react";
import { cn } from "@/lib/utils";

export type EventMailGroup = { eventId: string; title: string; count: number; latest: { id: string; subject: string; status: string; at: string }[] };

const DOT: Record<string, string> = { sent: "bg-[#46a758]", outbox: "bg-ticket-blue", queued: "bg-sun", failed: "bg-tomato" };
const TONES = ["bg-tomato", "bg-sun", "bg-sky", "bg-mint", "bg-peach"];

const when = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Asia/Kuala_Lumpur" });

export function OutboxList({ groups }: { groups: EventMailGroup[] }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {groups.map((g, i) => (
        <motion.section
          key={g.eventId}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: Math.min(i, 10) * 0.05, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          whileHover={{ y: -2 }}
          className="group overflow-hidden rounded-xl border-[1.5px] border-ink bg-card transition-shadow hover:shadow-[3px_3px_0_0_#161514]"
        >
          <Link href={`/events/${g.eventId}/inbox`} className="flex items-center gap-3 border-b-[1.5px] border-ink px-4 py-3">
            <span className={cn("grid size-9 shrink-0 place-items-center rounded-lg border-[1.5px] border-ink transition-transform duration-200 group-hover:-rotate-6", TONES[i % TONES.length])}>
              <Mail className="size-4" />
            </span>
            <span className="min-w-0 flex-1 truncate font-display text-lg font-bold">{g.title}</span>
            <span className="mono-label rounded-full border-[1.5px] border-ink bg-background px-2 py-0.5 text-[10px] font-bold">{g.count}</span>
            <ArrowUpRight className="size-4 shrink-0 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
          </Link>
          <ul>
            {g.latest.map((m) => (
              <li key={m.id} className="border-b border-border last:border-b-0">
                <Link href={`/events/${g.eventId}/inbox#${m.id}`} className="flex items-center gap-2.5 px-4 py-2 text-sm transition-colors hover:bg-sand/50">
                  <span className={cn("size-2 shrink-0 rounded-full", DOT[m.status] ?? "bg-sand")} />
                  <span className="min-w-0 flex-1 truncate">{m.subject}</span>
                  <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{when(m.at)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </motion.section>
      ))}
    </div>
  );
}
