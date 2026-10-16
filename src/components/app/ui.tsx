"use client";

import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import StatsCounter from "@/components/ui/stats-counter";
import { Eyebrow, StageEmpty } from "@/components/ep/kit";

/** Page title in the deck's voice: mono eyebrow, big grotesk headline, a hard rule under it. */
/** Helper descriptions are accepted for older call sites but deliberately not shown — words kept to a minimum. */
export function PageHeader({ title, actions, eyebrow }: { title: string; description?: React.ReactNode; actions?: React.ReactNode; eyebrow?: React.ReactNode }) {
  return (
    <motion.header initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }} className="mb-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          {eyebrow && <Eyebrow className="mb-2">{eyebrow}</Eyebrow>}
          <h1 className="font-display text-3xl font-bold tracking-tight md:text-[40px] md:leading-[1.05]">{title}</h1>
          
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      <div className="mt-5 h-[1.5px] bg-ink" />
    </motion.header>
  );
}

/** A section, not a card: mono label, actions on the right, a thin rule, then content on the page. */
export function Card({ title, actions, children, className, surface }: { title?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode; className?: string; description?: React.ReactNode; surface?: boolean }) {
  return (
    <section className={cn("min-w-0", className)}>
      {(title || actions) && (
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2 border-b border-border pb-2">
          <div>
            {title && <h2 className="mono-label font-bold text-ink">{title}</h2>}
            
          </div>
          {actions}
        </div>
      )}
      <div className={surface ? "overflow-hidden rounded-xl border-[1.5px] border-ink bg-card p-4 shadow-[3px_3px_0_0_rgba(22,21,20,.08)]" : undefined}>{children}</div>
    </section>
  );
}

/** Big number, the way the deck shows "100+": no box, a mono label, a colour only when it means something. */
export function Stat({ label, value, prefix, suffix, decimals, hint, tone, index = 0 }: { label: string; value: number; prefix?: string; suffix?: string; decimals?: number; hint?: React.ReactNode; tone?: "ok" | "warn" | "bad"; index?: number }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 * index, duration: 0.4, ease: [0.16, 1, 0.3, 1] }} className={cn("group relative min-w-0 border-l-[1.5px] border-ink/80 pl-4", hint != null && "cursor-default")}>
      <p className="mono-label text-[10px] text-muted-foreground">{label}</p>
      <p className={cn("mt-1 font-display text-[32px] font-bold leading-none tabular", tone === "warn" && "text-[#b4610a]", tone === "bad" && "text-tomato-ink", tone === "ok" && "text-[#2a7e3b]")}>
        <StatsCounter value={value} prefix={prefix} suffix={suffix} decimals={decimals} duration={1} />
      </p>
      {hint != null && hint !== "" && (
        <span className="pointer-events-none absolute left-4 top-full z-20 mt-2 w-max max-w-64 translate-y-1 rounded-lg border-[1.5px] border-ink bg-card px-2 py-1 text-xs opacity-0 shadow-[2px_2px_0_0_#161514] transition-all group-hover:translate-y-0 group-hover:opacity-100">{hint}</span>
      )}
    </motion.div>
  );
}

/** Kept for older call sites: a quiet hover surface, not a card. */
export function Spotlight({ className, children }: { className?: string; children: React.ReactNode; glow?: string; as?: "div" | "section" }) {
  return <div className={cn("group relative rounded-xl transition-colors hover:bg-sand/50", className)}>{children}</div>;
}

const TONES: Record<string, string> = {
  ok: "bg-mint text-[#1f5c2b]",
  done: "bg-mint text-[#1f5c2b]",
  executed: "bg-mint text-[#1f5c2b]",
  approved: "bg-mint text-[#1f5c2b]",
  sent: "bg-mint text-[#1f5c2b]",
  confirmed: "bg-mint text-[#1f5c2b]",
  paid: "bg-mint text-[#1f5c2b]",
  live: "bg-mint text-[#1f5c2b]",
  closed: "bg-mint text-[#1f5c2b]",
  going: "bg-mint text-[#1f5c2b]",
  posted: "bg-mint text-[#1f5c2b]",
  completed: "bg-sky text-[#1d3f9a]",
  warn: "bg-sun-soft text-[#7a5200]",
  pending: "bg-sun-soft text-[#7a5200]",
  pending_approval: "bg-sun text-ink",
  awaiting_faculty: "bg-sky text-[#1d3f9a]",
  waitlist: "bg-sun-soft text-[#7a5200]",
  blocked: "bg-sun text-ink",
  mitigating: "bg-sun-soft text-[#7a5200]",
  draft: "bg-sand text-ink/70",
  outbox: "bg-sky text-[#1d3f9a]",
  contacted: "bg-sky text-[#1d3f9a]",
  followed_up: "bg-sky text-[#1d3f9a]",
  replied: "bg-sky text-[#1d3f9a]",
  running: "bg-sky text-[#1d3f9a]",
  doing: "bg-sky text-[#1d3f9a]",
  fail: "bg-peach text-tomato-ink",
  failed: "bg-peach text-tomato-ink",
  rejected: "bg-peach text-tomato-ink",
  declined: "bg-peach text-tomato-ink",
  cancelled: "bg-peach text-tomato-ink",
  open: "bg-peach text-tomato-ink",
  urgent: "bg-tomato text-ink",
  high: "bg-peach text-tomato-ink",
  medium: "bg-sand text-ink/70",
  low: "bg-muted text-muted-foreground",
};

/** Status tag in mono caps — a little wristband. */
export function Pill({ status, label, className }: { status: string; label?: string; className?: string }) {
  return (
    <span className={cn("mono-label inline-flex items-center whitespace-nowrap rounded-[5px] px-1.5 py-[3px] text-[9.5px] font-bold leading-none", TONES[status] ?? "bg-sand text-ink/70", className)}>
      {label ?? status.replace(/_/g, " ")}
    </span>
  );
}

export function Empty({ title, action }: { icon?: React.ComponentType<{ className?: string }>; title: string; body?: string; action?: React.ReactNode }) {
  return <StageEmpty title={title} action={action} />;
}

export function Stagger({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.div className={className} initial="hidden" animate="show" variants={{ hidden: {}, show: { transition: { staggerChildren: 0.04 } } }}>
      {children}
    </motion.div>
  );
}

export const item = { hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] } } } as const;

export function StaggerItem({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.div variants={item} className={className}>
      {children}
    </motion.div>
  );
}
