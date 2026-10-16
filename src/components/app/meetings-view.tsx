"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { ArrowUpRight, CalendarPlus, Check, ChevronLeft, ChevronRight, Clock, ListTodo, MapPin, Plus, Sparkles, Video, X } from "lucide-react";
import { toast } from "sonner";
import { createMeeting } from "@/app/actions-meetings";
import { Btn, Ticket } from "@/components/ep/kit";
import { SharedTooltipAvatars } from "@/components/ui/shared-tooltip-avatars";
import { MeetingDrawer, faceTone, initials, type TaskInfo, type TeamMember } from "@/components/app/meeting-detail";
import { cn } from "@/lib/utils";
import { SPRING } from "@/lib/motion";
import { TZ, endsAt, hasMinutes, isPast, klParts, shortId, type AgendaItem, type Meeting, type MeetingTemplate } from "@/lib/meetings-shared";

type Props = {
  eventId: string;
  eventTitle: string;
  eventDate: string;
  team: TeamMember[];
  meetings: Meeting[];
  tasks: Record<string, TaskInfo>;
  now: number;
  templates: MeetingTemplate[];
};

// ------------------------------------------------------------------ time

/** Ticks from the server's "now", so the countdown agrees with the page. */
function useClock(serverNow: number) {
  const [now, setNow] = useState(serverNow);
  useEffect(() => {
    const offset = serverNow - Date.now();
    const t = setInterval(() => setNow(Date.now() + offset), 1000);
    return () => clearInterval(t);
  }, [serverNow]);
  return now;
}

function parts(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return { d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 };
}

const dayLabel = (iso: string, opts: Intl.DateTimeFormatOptions) => new Date(iso).toLocaleDateString("en-GB", { ...opts, timeZone: TZ });
const endTime = (m: Meeting) => klParts(new Date(endsAt(m)).toISOString()).time;
const hostOf = (u: string) => {
  try {
    return new URL(u).host;
  } catch {
    return u;
  }
};
const openCount = (m: Meeting, tasks: Record<string, TaskInfo>) => m.action_items.filter((a) => !a.done && !(a.task_id && tasks[a.task_id]?.status === "done")).length;

function avatarItems(ids: string[], team: TeamMember[]) {
  return ids
    .map((id) => team.find((t) => t.id === id))
    .filter((t): t is TeamMember => Boolean(t))
    .map((t) => ({ id: t.id, name: t.name, sub: t.member_role === "lead" ? "Lead" : undefined, className: faceTone(t) }));
}

// ------------------------------------------------------------------ next meeting ticket

function Unit({ v, u }: { v: number; u: string }) {
  return (
    <div className="min-w-0 text-center">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div key={v} initial={{ y: -10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 10, opacity: 0 }} transition={{ duration: 0.2 }} className="font-display text-3xl font-bold leading-none tabular">
          {String(v).padStart(2, "0")}
        </motion.div>
      </AnimatePresence>
      <div className="mono-label mt-1 text-[9px] text-ink/70">{u}</div>
    </div>
  );
}

function NextUp({ m, team, now, onOpen, onNew }: { m: Meeting | null; team: TeamMember[]; now: number; onOpen: (id: string) => void; onNew: () => void }) {
  if (!m) {
    return (
      <button type="button" onClick={onNew} className="group flex min-h-56 w-full flex-col items-center justify-center gap-3 rounded-2xl border-[1.5px] border-dashed border-ink/35 text-muted-foreground transition-colors hover:border-ink hover:bg-sun/30 hover:text-ink">
        <span className="grid size-14 place-items-center rounded-full border-[1.5px] border-dashed border-current transition-transform duration-300 group-hover:rotate-90">
          <Plus className="size-6" />
        </span>
        <span className="font-display text-lg font-semibold">Nothing booked</span>
      </button>
    );
  }
  const start = Date.parse(m.starts_at);
  const live = now >= start && now < endsAt(m);
  const left = parts(start - now);
  const k = klParts(m.starts_at);
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}>
      <Ticket
        className="transition-transform duration-200 hover:-translate-y-0.5"
        stubClassName={live ? "bg-[#7fd18b]" : undefined}
        stub={
          <div className="flex h-full flex-col justify-between gap-4" onClick={(e) => e.stopPropagation()}>
            <div>
              <p className="mono-label text-[10px] font-bold">{live ? "Live now" : "Starts in"}</p>
              {live ? (
                <p className="mt-2 flex items-center gap-2 font-display text-3xl font-bold">
                  <span className="relative flex size-3">
                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-ink/60" />
                    <span className="relative inline-flex size-3 rounded-full bg-ink" />
                  </span>
                  On air
                </p>
              ) : (
                <div className="mt-2 grid grid-cols-4 gap-1">
                  <Unit v={left.d} u="days" />
                  <Unit v={left.h} u="hrs" />
                  <Unit v={left.m} u="min" />
                  <Unit v={left.s} u="sec" />
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {m.meeting_url && (
                <a href={m.meeting_url} target="_blank" rel="noreferrer" className="group/j inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl bg-ink px-3 text-sm font-semibold text-white shadow-[2px_2px_0_0_#fffdf7] transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-[3px_3px_0_0_#fffdf7]">
                  <Video className="size-4" />
                  Join
                  <ArrowUpRight className="size-3.5 transition-transform group-hover/j:-translate-y-px group-hover/j:translate-x-px" />
                </a>
              )}
              <a href={`/api/meetings/${m.id}/ics`} title="Add to calendar" className="group/c inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl border-[1.5px] border-ink bg-card px-3 text-sm font-semibold transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-[2px_2px_0_0_#161514]">
                <CalendarPlus className="size-4 transition-transform group-hover/c:rotate-[-8deg] group-hover/c:scale-110" />
                .ics
              </a>
            </div>
          </div>
        }
      >
        <div role="button" tabIndex={0} onClick={() => onOpen(m.id)} onKeyDown={(e) => e.key === "Enter" && onOpen(m.id)} className="group/t flex h-full flex-col gap-4 outline-none">
          <div className="flex items-start justify-between gap-3">
            <p className="mono-label text-tomato">Next meeting</p>
            <span className="mono-label flex items-center gap-1 text-[10px] text-muted-foreground transition-colors group-hover/t:text-ink">
              Open
              <ChevronRight className="size-3 transition-transform group-hover/t:translate-x-0.5" />
            </span>
          </div>
          <div className="flex items-end gap-4">
            <div className="text-center">
              <div className="font-display text-[64px] font-bold leading-[0.85] tracking-tight tabular">{dayLabel(m.starts_at, { day: "numeric" })}</div>
              <div className="mono-label mt-1 text-[11px]">{dayLabel(m.starts_at, { month: "short" })}</div>
            </div>
            <div className="min-w-0 pb-1">
              <h2 className="truncate font-display text-2xl font-bold leading-tight">{m.title}</h2>
              <p className="mt-1 font-mono text-sm tabular text-muted-foreground">
                {dayLabel(m.starts_at, { weekday: "long" })} · <b className="text-ink">{k.time}</b> to {endTime(m)}
              </p>
            </div>
          </div>
          <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-dashed border-ink/25 pt-3">
            <span className="inline-flex min-w-0 items-center gap-1.5 text-sm">
              {m.location ? <MapPin className="size-4 shrink-0 text-tomato" /> : <Video className="size-4 shrink-0 text-ticket-blue" />}
              <span className="truncate">{m.location ?? (m.meeting_url ? hostOf(m.meeting_url) : "TBC")}</span>
            </span>
            <SharedTooltipAvatars items={avatarItems(m.attendees, team)} size={30} />
          </div>
        </div>
      </Ticket>
    </motion.div>
  );
}

// ------------------------------------------------------------------ mini month

const WD = ["M", "T", "W", "T", "F", "S", "S"];

function MiniMonth({ meetings, eventDate, today, start, onPick }: { meetings: Meeting[]; eventDate: string; today: string; start: string; onPick: (id: string) => void }) {
  const [month, setMonth] = useState(start.slice(0, 7));
  const [dir, setDir] = useState(1);
  const byDay = useMemo(() => {
    const map = new Map<string, Meeting[]>();
    for (const m of meetings) {
      if (m.status === "cancelled") continue;
      const d = klParts(m.starts_at).date;
      map.set(d, [...(map.get(d) ?? []), m]);
    }
    return map;
  }, [meetings]);

  const first = new Date(`${month}-01T00:00:00Z`);
  const lead = (first.getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  const cells = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`)];
  const shift = (n: number) => {
    setDir(n);
    const d = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + n, 1));
    setMonth(d.toISOString().slice(0, 7));
  };
  const nav = "grid size-7 place-items-center rounded-md border-[1.5px] border-transparent transition-[border-color,transform] hover:border-ink active:scale-90";

  return (
    <div className="rounded-2xl border-[1.5px] border-ink bg-card p-3">
      <div className="mb-2 flex items-center justify-between">
        <button type="button" aria-label="Previous month" onClick={() => shift(-1)} className={nav}>
          <ChevronLeft className="size-4" />
        </button>
        <AnimatePresence mode="wait" initial={false}>
          <motion.span key={month} initial={{ opacity: 0, x: dir * 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: dir * -12 }} transition={{ duration: 0.15 }} className="mono-label font-bold">
            {first.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" })}
          </motion.span>
        </AnimatePresence>
        <button type="button" aria-label="Next month" onClick={() => shift(1)} className={nav}>
          <ChevronRight className="size-4" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center">
        {WD.map((d, i) => (
          <span key={i} className="mono-label pb-1 text-[9px] text-muted-foreground">
            {d}
          </span>
        ))}
        {cells.map((d, i) => {
          if (!d) return <span key={`x${i}`} />;
          const ms = byDay.get(d) ?? [];
          const isEvent = d === eventDate;
          const isToday = d === today;
          const past = d < today;
          return (
            <motion.div key={d} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.006 }} className="group/d relative">
              <button
                type="button"
                disabled={!ms.length}
                onClick={() => ms[0] && onPick(ms[0].id)}
                className={cn(
                  "relative grid aspect-square w-full place-items-center rounded-lg font-mono text-xs tabular transition-[transform,background-color]",
                  isEvent ? "border-[1.5px] border-ink bg-tomato font-bold" : ms.length ? "cursor-pointer font-bold hover:-translate-y-0.5 hover:bg-sun/60" : "cursor-default",
                  ms.length && !isEvent && (past ? "bg-sand/70" : "bg-sun"),
                  !ms.length && !isEvent && past && "text-muted-foreground/60",
                  isToday && "ring-[1.5px] ring-ink ring-offset-1 ring-offset-card",
                )}
              >
                {Number(d.slice(8))}
                {ms.length > 1 && <span className="absolute right-0.5 top-0.5 size-1.5 rounded-full bg-ink" />}
              </button>
              {(ms.length > 0 || isEvent) && (
                <div className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-1.5 w-max max-w-48 -translate-x-1/2 translate-y-1 rounded-lg border-[1.5px] border-ink bg-card px-2 py-1 text-left text-[11px] opacity-0 shadow-[2px_2px_0_0_#161514] transition-all duration-150 group-hover/d:translate-y-0 group-hover/d:opacity-100">
                  {isEvent && <div className="font-bold text-tomato-ink">Event day</div>}
                  {ms.map((m) => (
                    <div key={m.id} className="truncate">
                      <span className="font-mono text-muted-foreground">{klParts(m.starts_at).time}</span> {m.title}
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          );
        })}
      </div>
      <div className="mt-2.5 flex items-center gap-3 border-t border-ink/10 pt-2 font-mono text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="size-2.5 rounded-sm border border-ink bg-sun" />
          Meeting
        </span>
        <span className="flex items-center gap-1">
          <span className="size-2.5 rounded-sm border border-ink bg-tomato" />
          Event
        </span>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ list

function MeetingRow({ m, index, team, tasks, past, isNext, onOpen }: { m: Meeting; index: number; team: TeamMember[]; tasks: Record<string, TaskInfo>; past: boolean; isNext: boolean; onOpen: () => void }) {
  const open = openCount(m, tasks);
  const minuted = hasMinutes(m);
  const cancelled = m.status === "cancelled";
  return (
    <motion.li layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6, transition: { duration: 0.12 } }} transition={{ delay: index * 0.04, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}>
      <div
        role="button"
        tabIndex={0}
        onClick={onOpen}
        onKeyDown={(e) => e.key === "Enter" && onOpen()}
        className={cn(
          "group flex cursor-pointer items-center gap-4 rounded-xl border-[1.5px] bg-card p-2.5 pr-3 outline-none transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.5 hover:border-ink hover:shadow-[3px_3px_0_0_#161514] focus-visible:border-ink",
          cancelled ? "border-dashed border-ink/25 opacity-70" : "border-ink/15",
        )}
      >
        <div className="w-14 shrink-0 overflow-hidden rounded-lg border-[1.5px] border-ink text-center transition-transform duration-200 group-hover:-rotate-3">
          <div className={cn("mono-label py-0.5 text-[9px] font-bold", isNext ? "bg-tomato" : past ? "bg-sand" : "bg-sun")}>{dayLabel(m.starts_at, { month: "short" })}</div>
          <div className="font-display text-2xl font-bold leading-tight tabular">{dayLabel(m.starts_at, { day: "numeric" })}</div>
          <div className="mono-label pb-0.5 text-[8px] text-muted-foreground">{dayLabel(m.starts_at, { weekday: "short" })}</div>
        </div>
        <div className="min-w-0 flex-1">
          <p className={cn("truncate font-semibold", cancelled && "line-through")}>{m.title}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1 font-mono tabular">
              <Clock className="size-3" />
              {klParts(m.starts_at).time} to {endTime(m)}
            </span>
            {(m.location || m.meeting_url) && (
              <span className="inline-flex min-w-0 items-center gap-1">
                {m.location ? <MapPin className="size-3 shrink-0" /> : <Video className="size-3 shrink-0" />}
                <span className="truncate">{m.location ?? "Online"}</span>
              </span>
            )}
            {m.agenda.length > 0 && <span className="hidden font-mono sm:inline">{m.agenda.length} items</span>}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {past && !cancelled && (
            <>
              <span className={cn("inline-flex h-6 items-center gap-1 rounded-full border-[1.5px] px-2 text-[11px] font-semibold", minuted ? "border-ink bg-mint" : "border-dashed border-tomato-ink text-tomato-ink")}>
                {minuted ? <Check className="size-3" strokeWidth={3} /> : <span className="size-1.5 animate-pulse rounded-full bg-tomato" />}
                {minuted ? "Minutes done" : "Needs minutes"}
              </span>
              {open > 0 && (
                <span title={`${open} open action items`} className="inline-flex h-6 items-center gap-1 rounded-full border-[1.5px] border-ink bg-sun px-2 font-mono text-[11px] font-bold tabular">
                  <ListTodo className="size-3" />
                  {open}
                </span>
              )}
            </>
          )}
          {cancelled && <span className="mono-label text-[10px] text-muted-foreground">Called off</span>}
          <div className="hidden sm:block">
            <SharedTooltipAvatars items={avatarItems(m.attendees, team).slice(0, 5)} size={26} />
          </div>
          <ChevronRight className="size-4 text-muted-foreground transition-transform duration-200 group-hover:translate-x-1 group-hover:text-ink" />
        </div>
      </div>
    </motion.li>
  );
}

// ------------------------------------------------------------------ new meeting

function NewMeeting({ eventId, team, templates, defaultDate, onClose, onCreated }: { eventId: string; team: TeamMember[]; templates: MeetingTemplate[]; defaultDate: string; onClose: () => void; onCreated: (m: Meeting) => void }) {
  const [tpl, setTpl] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(defaultDate);
  const [time, setTime] = useState("20:00");
  const [duration, setDuration] = useState(30);
  const [where, setWhere] = useState("");
  const [who, setWho] = useState<string[]>(team.map((t) => t.id));
  const [agenda, setAgenda] = useState<AgendaItem[]>([]);
  const [line, setLine] = useState("");
  const [pending, start] = useTransition();
  const titleRef = useRef<HTMLInputElement>(null);
  const online = /^https?:\/\//i.test(where.trim());

  useEffect(() => titleRef.current?.focus(), []);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);

  const pick = (t: MeetingTemplate) => {
    setTpl(t.key);
    setTitle(t.title);
    setDuration(t.duration);
    setAgenda(t.agenda.map((a) => ({ ...a, id: shortId() })));
  };

  const submit = () => {
    if (!title.trim()) return titleRef.current?.focus();
    start(async () => {
      const r = await createMeeting(eventId, { title, date, time, duration_min: duration, location: online ? null : where, meeting_url: online ? where : null, attendees: who, agenda });
      if (!r.ok || !r.data) return void toast.error(r.ok ? "Could not save" : r.error);
      toast.success("Meeting booked");
      onCreated(r.data);
    });
  };

  const field = "h-9 w-full rounded-lg border-[1.5px] border-ink/25 bg-card px-2.5 text-sm outline-none transition-colors hover:border-ink/50 focus:border-ink";
  const label = "mono-label mb-1 block text-[10px] text-muted-foreground";
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="fixed inset-0 z-[80] grid place-items-center overflow-y-auto bg-ink/35 p-4 backdrop-blur-[2px]">
      <motion.form
        initial={{ y: 24, scale: 0.97 }}
        animate={{ y: 0, scale: 1 }}
        exit={{ y: 24, scale: 0.97 }}
        transition={{ type: "spring", stiffness: 380, damping: 32 }}
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="w-full max-w-xl overflow-hidden rounded-2xl border-[1.5px] border-ink bg-background shadow-[6px_6px_0_0_#161514]"
      >
        <div className="flex items-center justify-between border-b-[1.5px] border-ink bg-sun px-5 py-3">
          <p className="font-display text-lg font-bold">New meeting</p>
          <button type="button" aria-label="Close" onClick={onClose} className="grid size-8 place-items-center rounded-lg transition-[transform,background-color] hover:rotate-90 hover:bg-card">
            <X className="size-4" />
          </button>
        </div>
        <div className="space-y-4 p-5">
          <div className="flex flex-wrap gap-1.5">
            {templates.map((t, i) => (
              <motion.button
                key={t.key}
                type="button"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => pick(t)}
                title={`${t.duration} min · ${t.agenda.length} items`}
                className={cn("inline-flex h-8 items-center gap-1.5 rounded-full border-[1.5px] px-3 text-xs font-semibold transition-[transform,background-color,border-color] hover:-translate-y-0.5", tpl === t.key ? "border-ink bg-tomato shadow-[2px_2px_0_0_#161514]" : "border-ink/25 bg-card hover:border-ink")}
              >
                {tpl === t.key && <Sparkles className="size-3" />}
                {t.title}
              </motion.button>
            ))}
          </div>

          <div>
            <label htmlFor="mtg-title" className={label}>Title</label>
            <input id="mtg-title" ref={titleRef} value={title} onChange={(e) => setTitle(e.target.value)} className={cn(field, "h-10 font-display text-base font-semibold")} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="mtg-date" className={label}>Date</label>
              <input id="mtg-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className={cn(field, "font-mono")} />
            </div>
            <div>
              <label htmlFor="mtg-time" className={label}>Time</label>
              <input id="mtg-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} className={cn(field, "font-mono")} />
            </div>
          </div>

          <div>
            <span className={label}>Length</span>
            <div className="flex flex-wrap gap-1.5">
              {[15, 30, 45, 60, 90].map((d) => (
                <button key={d} type="button" onClick={() => setDuration(d)} className={cn("relative h-8 rounded-lg border-[1.5px] px-3 font-mono text-xs transition-colors", duration === d ? "border-ink font-bold" : "border-ink/20 text-muted-foreground hover:border-ink/60 hover:text-ink")}>
                  {duration === d && <motion.span layoutId="mtg-dur" transition={SPRING.default} className="absolute inset-0 -z-10 rounded-[7px] bg-sun" />}
                  {d}m
                </button>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="mtg-where" className={label}>Where</label>
            <div className="relative">
              <AnimatePresence mode="wait" initial={false}>
                <motion.span key={online ? "v" : "p"} initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.4, opacity: 0 }} transition={{ duration: 0.12 }} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2">
                  {online ? <Video className="size-4 text-ticket-blue" /> : <MapPin className="size-4 text-tomato" />}
                </motion.span>
              </AnimatePresence>
              <input id="mtg-where" value={where} onChange={(e) => setWhere(e.target.value)} placeholder="Room or https:// link" className={cn(field, "pl-8")} />
            </div>
          </div>

          <div>
            <span className={label}>
              Who <span className="tabular">{who.length}/{team.length}</span>
            </span>
            <div className="flex flex-wrap gap-1.5">
              {team.map((t) => {
                const on = who.includes(t.id);
                return (
                  <button
                    key={t.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setWho((w) => (on ? w.filter((x) => x !== t.id) : [...w, t.id]))}
                    className={cn("group flex h-8 items-center gap-1.5 rounded-full border-[1.5px] py-0.5 pl-0.5 pr-2.5 text-xs transition-[transform,opacity] hover:-translate-y-0.5", on ? "border-ink bg-card" : "border-dashed border-ink/30 text-muted-foreground opacity-60 hover:opacity-100")}
                  >
                    <span className={cn("grid size-6 place-items-center rounded-full border-[1.5px] font-display text-[9px] font-bold transition-transform group-hover:-rotate-6", on ? cn("border-ink", faceTone(t)) : "border-dashed border-ink/40")}>{initials(t.name)}</span>
                    {t.name.split(/\s+/)[0]}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <span className={label}>Agenda</span>
            <ul className="space-y-1">
              <AnimatePresence initial={false}>
                {agenda.map((a, i) => (
                  <motion.li key={a.id ?? i} layout initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 12 }} transition={{ delay: i * 0.03 }} className="group flex items-center gap-2 rounded-lg border-[1.5px] border-ink/10 bg-card px-2 py-1 text-sm transition-colors hover:border-ink/40">
                    <span className="font-mono text-[10px] text-muted-foreground tabular">{String(i + 1).padStart(2, "0")}</span>
                    <span className="min-w-0 flex-1 truncate">{a.item}</span>
                    {a.minutes ? <span className="font-mono text-[10px] text-muted-foreground">{a.minutes}m</span> : null}
                    <button type="button" aria-label={`Remove ${a.item}`} onClick={() => setAgenda((xs) => xs.filter((_, j) => j !== i))} className="grid size-5 place-items-center rounded-full opacity-0 transition-[opacity,background-color] hover:bg-tomato group-hover:opacity-100 focus-visible:opacity-100">
                      <X className="size-3" />
                    </button>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
            <div className="mt-1.5 flex items-center gap-2 rounded-lg border-[1.5px] border-dashed border-ink/25 px-2 transition-colors focus-within:border-ink">
              <Plus className="size-3.5 text-muted-foreground" />
              <input
                value={line}
                onChange={(e) => setLine(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  if (!line.trim()) return;
                  setAgenda((xs) => [...xs, { id: shortId(), item: line.trim(), minutes: null }]);
                  setLine("");
                }}
                placeholder="Agenda item"
                aria-label="Agenda item"
                className="h-8 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/70"
              />
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 border-t-[1.5px] border-ink bg-card px-5 py-3">
          <Btn type="button" variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Btn>
          <Btn type="submit" variant="tomato" size="sm" icon="calendar-plus" disabled={pending} className={pending ? "animate-pulse" : undefined}>
            Book it
          </Btn>
        </div>
      </motion.form>
    </motion.div>
  );
}

// ------------------------------------------------------------------ page

export function MeetingsView({ eventId, eventTitle, eventDate, team, meetings, tasks, now: serverNow, templates }: Props) {
  const now = useClock(serverNow);
  const [tab, setTab] = useState<"up" | "past">("up");
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [extra, setExtra] = useState<Meeting[]>([]);

  // freshly booked meetings show at once, before the server refresh lands
  const all = useMemo(() => [...meetings, ...extra.filter((x) => !meetings.some((m) => m.id === x.id))].sort((a, b) => a.starts_at.localeCompare(b.starts_at)), [meetings, extra]);
  const upcoming = all.filter((m) => !isPast(m, serverNow));
  const past = all.filter((m) => isPast(m, serverNow)).reverse();
  const next = upcoming[0] ?? null;
  const today = klParts(new Date(serverNow).toISOString()).date;
  const open = all.find((m) => m.id === openId) ?? null;
  const needs = past.filter((m) => m.status !== "cancelled" && !hasMinutes(m)).length;

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    const read = () => {
      const id = window.location.hash.slice(1) || null;
      setOpenId(id);
      const target = id ? meetings.find((m) => m.id === id) : undefined;
      if (target) setTab(isPast(target, serverNow) ? "past" : "up");
    };
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!open && !creating) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const esc = (e: KeyboardEvent) => e.key === "Escape" && open && !creating && show(null);
    window.addEventListener("keydown", esc);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", esc);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, creating]);

  const show = (id: string | null) => {
    setOpenId(id);
    const url = `${window.location.pathname}${window.location.search}${id ? `#${id}` : ""}`;
    window.history.replaceState(null, "", url);
    const target = id ? all.find((m) => m.id === id) : undefined;
    if (target) setTab(isPast(target, serverNow) ? "past" : "up");
  };

  const list = tab === "up" ? upcoming : past;
  const tabs = [
    { key: "up" as const, label: "Upcoming", n: upcoming.length },
    { key: "past" as const, label: "Past", n: past.length, flag: needs },
  ];
  const tomorrow = new Date(Date.parse(`${today}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

  return (
    <div className="space-y-8">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <NextUp m={next} team={team} now={now} onOpen={show} onNew={() => setCreating(true)} />
        <MiniMonth meetings={all} eventDate={eventDate} today={today} start={next ? klParts(next.starts_at).date : today} onPick={show} />
      </div>

      <section>
        <div className="mb-3 flex items-end justify-between gap-3 border-b-[1.5px] border-ink">
          <div role="tablist" className="flex gap-6">
            {tabs.map((t) => (
              <button key={t.key} role="tab" aria-selected={tab === t.key} type="button" onClick={() => setTab(t.key)} className={cn("relative flex items-center gap-2 px-1 pb-2.5 pt-1 text-sm transition-colors", tab === t.key ? "font-semibold" : "text-muted-foreground hover:text-ink")}>
                {t.label}
                <span className={cn("rounded-md border px-1.5 font-mono text-[10px] tabular transition-colors", tab === t.key ? "border-ink bg-card" : "border-ink/20")}>{t.n}</span>
                {t.flag ? <span title={`${t.flag} need minutes`} className="size-1.5 animate-pulse rounded-full bg-tomato" /> : null}
                {tab === t.key && <motion.span layoutId="mtg-tab" className="absolute inset-x-0 -bottom-[1.5px] h-[3px] rounded-t bg-tomato" transition={SPRING.default} />}
              </button>
            ))}
          </div>
          <Btn variant="tomato" size="sm" icon="calendar-plus" className="mb-2" onClick={() => setCreating(true)}>
            Meeting
          </Btn>
        </div>
        <ul className="space-y-2">
          <AnimatePresence mode="popLayout" initial={false}>
            {list.map((m, i) => (
              <MeetingRow key={m.id} m={m} index={i} team={team} tasks={tasks} past={tab === "past"} isNext={m.id === next?.id} onOpen={() => show(m.id)} />
            ))}
          </AnimatePresence>
        </ul>
        {list.length === 0 && (
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-xl border-[1.5px] border-dashed border-ink/25 py-8 text-center font-display text-muted-foreground">
            {tab === "up" ? "Nothing booked" : "No past meetings"}
          </motion.p>
        )}
      </section>

      {mounted &&
        createPortal(
          <>
            <AnimatePresence>{open && <MeetingDrawer key={open.id} meeting={open} eventId={eventId} eventTitle={eventTitle} team={team} tasks={tasks} now={serverNow} onClose={() => show(null)} />}</AnimatePresence>
            <AnimatePresence>
              {creating && (
                <NewMeeting
                  key="new"
                  eventId={eventId}
                  team={team}
                  templates={templates}
                  defaultDate={tomorrow}
                  onClose={() => setCreating(false)}
                  onCreated={(m) => {
                    setExtra((xs) => [...xs, m]);
                    setCreating(false);
                    setTab(isPast(m, serverNow) ? "past" : "up");
                    show(m.id);
                  }}
                />
              )}
            </AnimatePresence>
          </>,
          document.body,
        )}
    </div>
  );
}
