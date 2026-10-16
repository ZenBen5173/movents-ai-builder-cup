"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { ArrowUpRight, Lock, Plus } from "lucide-react";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { Eyebrow, StageEmpty } from "@/components/ep/kit";
import { Pill } from "./ui";
import { LiveBoxOffice } from "./live-box-office";
import { cn } from "@/lib/utils";
import { SPRING } from "@/lib/motion";

export type DashProject = {
  id: string;
  title: string;
  date: string;
  venue: string | null;
  status: string;
  days: number;
  progress: number;
  tasks: number;
  done: number;
  budgetBase: number;
  allocated: number;
  spent: number;
  pending: number;
  risks: number;
  going: number;
  pax: number;
};
export type DashTask = { id: string; title: string; due: string; eventId: string; eventTitle: string; mine: boolean; owner: string | null; priority: string; blocked: boolean };

const short = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).toUpperCase();
const rm = (n: number) => `RM${Math.round(n).toLocaleString("en-MY")}`;

function Meter({ value, tone }: { value: number; tone: string }) {
  return (
    <span className="block h-2.5 overflow-hidden rounded-full border-[1.5px] border-ink bg-card">
      <motion.span className={cn("block h-full", tone)} initial={{ width: 0 }} animate={{ width: `${Math.min(100, value)}%` }} transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }} />
    </span>
  );
}

function ProjectRow({ p, i }: { p: DashProject; i: number }) {
  const used = p.budgetBase ? (p.spent > 0 ? p.spent : p.allocated) / p.budgetBase : 0;
  const pct = Math.round(used * 100);
  const budgetTone = pct >= 100 ? "bg-tomato-ink" : pct >= 90 ? "bg-tomato" : pct >= 75 ? "bg-sun" : "bg-[#46a758]";
  return (
    <motion.li initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05, duration: 0.35 }}>
      <Link href={`/events/${p.id}`} className="group grid grid-cols-[88px_1fr] items-center gap-x-6 gap-y-3 border-b-[1.5px] border-ink py-5 transition-colors hover:bg-sand/40 md:grid-cols-[110px_1.4fr_1fr_1fr_120px]">
        <div className="row-span-2 md:row-span-1">
          <div className={cn("font-display text-5xl font-bold leading-none tabular", p.days < 0 ? "text-muted-foreground" : p.days <= 14 ? "text-tomato" : "text-ink")}>
            <AnimatedNumber value={Math.abs(p.days)} />
          </div>
          <span className="mono-label text-[9.5px] text-muted-foreground">{p.days >= 0 ? "days to go" : "days ago"}</span>
        </div>
        <div className="min-w-0">
          <p className="truncate font-display text-xl font-bold transition-colors group-hover:text-tomato-ink">{p.title}</p>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span className="font-mono text-xs font-bold text-ink">{short(p.date)}</span>· {p.venue ?? "TBC"} <Pill status={p.status} />
          </p>
        </div>
        <div>
          <div className="mb-1.5 flex justify-between text-xs"><span className="mono-label text-[9.5px] text-muted-foreground">Progress</span><span className="font-mono">{p.progress}%</span></div>
          <Meter value={p.progress} tone="bg-ticket-blue" />
          <p className="mt-1 text-[11px] text-muted-foreground">{p.done}/{p.tasks} tasks</p>
        </div>
        <div>
          <div className="mb-1.5 flex justify-between text-xs"><span className="mono-label text-[9.5px] text-muted-foreground">{p.spent > 0 ? "Budget spent" : "Budget allocated"}</span><span className="font-mono">{pct}%</span></div>
          <Meter value={pct} tone={budgetTone} />
          <p className="mt-1 text-[11px] text-muted-foreground">{rm(p.spent > 0 ? p.spent : p.allocated)} / {rm(p.budgetBase)}</p>
        </div>
        <div className="col-span-2 flex flex-wrap gap-1.5 md:col-span-1 md:flex-col md:items-end">
          {p.pending > 0 && <Pill status="pending_approval" label={`${p.pending} approvals`} />}
          {p.risks > 0 && <Pill status="open" label={`${p.risks} high risks`} />}
          <span className="text-xs text-muted-foreground">{p.going}/{p.pax} going</span>
        </div>
      </Link>
    </motion.li>
  );
}

type Tab = "overdue" | "week" | "upcoming";

const DOTS = ["#ff5a36", "#3b6cf6", "#ffd84d", "#46a758", "#c084fc", "#f59e0b"];
const dot = (id: string) => DOTS[[...id].reduce((n, c) => n + c.charCodeAt(0), 0) % DOTS.length];

function byEvent(tasks: DashTask[]) {
  const m = new Map<string, { ev: { id: string; title: string }; list: DashTask[] }>();
  for (const t of tasks) {
    const g = m.get(t.eventId) ?? { ev: { id: t.eventId, title: t.eventTitle }, list: [] };
    g.list.push(t);
    m.set(t.eventId, g);
  }
  return [...m.values()].map((g) => [g.ev, g.list] as const);
}

function TaskList({ tasks, today }: { tasks: DashTask[]; today: string }) {
  const [tab, setTab] = useState<Tab>("overdue");
  const [mine, setMine] = useState(true);
  const weekEnd = new Date(Date.parse(`${today}T00:00:00Z`) + 7 * 86400000).toISOString().slice(0, 10);
  const pool = mine ? tasks.filter((t) => t.mine) : tasks;
  const groups: Record<Tab, DashTask[]> = useMemo(
    () => ({
      overdue: pool.filter((t) => t.due < today),
      week: pool.filter((t) => t.due >= today && t.due <= weekEnd),
      upcoming: pool.filter((t) => t.due > weekEnd),
    }),
    [pool, today, weekEnd],
  );
  const tabs: { id: Tab; label: string }[] = [
    { id: "overdue", label: "Overdue" },
    { id: "week", label: "This week" },
    { id: "upcoming", label: "Upcoming" },
  ];
  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-3 border-b-[1.5px] border-ink pb-2">
        <h2 className="font-display text-xl font-bold">My tasks</h2>
        <div className="flex items-center gap-3">
          <div className="flex rounded-lg border-[1.5px] border-ink p-0.5 text-xs">
            {[true, false].map((m) => (
              <button key={String(m)} onClick={() => setMine(m)} className={cn("relative rounded-md px-2.5 py-1", mine === m ? "text-white" : "text-ink/70")}>
                {mine === m && <motion.span layoutId="dash-mine" className="absolute inset-0 rounded-md bg-ink" transition={SPRING.default} />}
                <span className="relative">{m ? "Mine" : "Everyone"}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-3 flex gap-5">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className={cn("relative pb-1.5 text-sm", tab === t.id ? "font-semibold" : "text-muted-foreground hover:text-ink")}>
            {t.label} <span className={cn("ml-1 font-mono text-xs", t.id === "overdue" && groups.overdue.length ? "text-tomato-ink" : "")}>{groups[t.id].length}</span>
            {tab === t.id && <motion.span layoutId="dash-tab" className="absolute inset-x-0 -bottom-px h-[3px] rounded-t bg-tomato" transition={SPRING.default} />}
          </button>
        ))}
      </div>
      <div className="mt-2 space-y-5">
        {byEvent(groups[tab]).map(([ev, list], gi) => (
          <motion.div key={ev.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: gi * 0.05 }}>
            <Link href={`/events/${ev.id}/tasks`} className="group mb-1 flex items-center gap-2 pt-1">
              <span className="size-2.5 rounded-full border-[1.5px] border-ink" style={{ background: dot(ev.id) }} />
              <span className="mono-label truncate text-[10.5px] font-bold transition-colors group-hover:text-tomato-ink">{ev.title}</span>
              <span className="font-mono text-[10px] text-muted-foreground">{list.length}</span>
              <ArrowUpRight className="size-3 opacity-0 transition-opacity group-hover:opacity-100" />
            </Link>
            <ul>
              {list.slice(0, 6).map((t) => (
                <li key={t.id}>
                  <Link href={`/events/${t.eventId}/tasks`} title={!mine && t.owner ? t.owner : undefined} className="group flex items-center gap-3 border-b border-border py-2 pl-4 transition-colors hover:bg-sand/40">
                    <span className="min-w-0 flex-1 truncate text-[14px] transition-transform group-hover:translate-x-0.5">{t.title}</span>
                    {t.blocked && <span title="Waiting on another task" className="text-muted-foreground"><Lock className="size-3.5" /></span>}
                    <span className={cn("w-14 text-right font-mono text-[11px]", t.due < today ? "font-bold text-tomato-ink" : "text-muted-foreground")}>{short(t.due)}</span>
                  </Link>
                </li>
              ))}
              {list.length > 6 && <li className="py-1.5 pl-4 font-mono text-[11px] text-muted-foreground">+{list.length - 6}</li>}
            </ul>
          </motion.div>
        ))}
        {groups[tab].length === 0 && <p className="py-6 text-sm text-muted-foreground">Nothing here.</p>}
      </div>
    </section>
  );
}

export function Dashboard({ projects, tasks, today, firstName }: { projects: DashProject[]; tasks: DashTask[]; today: string; firstName: string }) {
  const live = projects.filter((p) => p.status !== "completed" && p.days >= 0);
  const past = projects.filter((p) => !(p.status !== "completed" && p.days >= 0)).reverse();
  const next = live[0];
  const [when, setWhen] = useState<"upcoming" | "past">("upcoming");
  return (
    <div>
      <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Eyebrow>Box office</Eyebrow>
          <h1 className="mt-2 font-display text-4xl font-bold tracking-tight md:text-5xl">Hi {firstName}</h1>
        </div>
        <Link href="/new" className="inline-flex h-11 items-center gap-1.5 rounded-xl bg-ink px-5 text-sm font-medium text-white shadow-[3px_3px_0_0_#ff5a36] transition-shadow hover:shadow-[4px_4px_0_0_#ff5a36]">
          <Plus className="size-4" /> New event
        </Link>
      </div>

      {next && (
        <div className="mb-12 grid grid-cols-2 gap-6 md:grid-cols-4">
          {[
            { label: "Next show", value: next.days, suffix: "days", tone: "text-tomato" },
            { label: "Live projects", value: live.length },
            { label: "Open tasks", value: tasks.length },
            { label: "Overdue", value: tasks.filter((t) => t.due < today).length, tone: "text-tomato-ink" },
          ].map((s, i) => (
            <motion.div key={s.label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="border-l-[1.5px] border-ink pl-4">
              <p className="mono-label text-[10px] text-muted-foreground">{s.label}</p>
              <div className={cn("mt-1 flex items-end gap-1.5 font-display text-4xl font-bold leading-none", s.tone)}>
                <AnimatedNumber value={s.value} />
                {s.suffix && <span className="pb-1 text-sm font-medium text-muted-foreground">{s.suffix}</span>}
              </div>
            </motion.div>
          ))}
        </div>
      )}

      <div className="grid gap-12 2xl:grid-cols-[1.7fr_1fr]">
        <section>
          <div className="flex items-end justify-between border-b-[1.5px] border-ink pb-2">
            <h2 className="font-display text-xl font-bold">Projects</h2>
            <div className="flex rounded-lg border-[1.5px] border-ink p-0.5 text-xs">
              {(["upcoming", "past"] as const).map((w) => (
                <button key={w} onClick={() => setWhen(w)} className={cn("relative rounded-md px-2.5 py-1 capitalize", when === w ? "text-white" : "text-ink/70")}>
                  {when === w && <motion.span layoutId="dash-when" className="absolute inset-0 rounded-md bg-ink" transition={SPRING.default} />}
                  <span className="relative">{w} <span className="font-mono opacity-70">{w === "upcoming" ? live.length : past.length}</span></span>
                </button>
              ))}
            </div>
          </div>
          <LiveBoxOffice />
          {projects.length === 0 ? (
            <div className="mt-6"><StageEmpty title="No events yet" action={<Link href="/new" className="inline-flex h-10 items-center rounded-xl bg-ink px-4 text-sm text-white">New event</Link>} /></div>
          ) : (
            <ul>
              {(when === "upcoming" ? live : past).map((p, i) => <ProjectRow key={p.id} p={p} i={i} />)}
              {(when === "upcoming" ? live : past).length === 0 && <li className="py-8 text-sm text-muted-foreground">Nothing here.</li>}
            </ul>
          )}
        </section>
        <TaskList tasks={tasks} today={today} />
      </div>
    </div>
  );
}
