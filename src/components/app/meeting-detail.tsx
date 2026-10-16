"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowUpRight, CalendarPlus, Check, Copy, FileDown, Heading2, List, MapPin, Plus, Trash2, Undo2, Video, X } from "lucide-react";
import { toast } from "sonner";
import { deleteMeeting, makeActionTask, saveMeeting } from "@/app/actions-meetings";
import { ROLE_BAND, Stamp, fireConfetti } from "@/components/ep/kit";
import { cn } from "@/lib/utils";
import { SPRING } from "@/lib/motion";
import { fmtWhen, isPast, klParts, minutesMarkdown, shortId, type ActionItem, type AgendaItem, type Meeting } from "@/lib/meetings-shared";
import type { MeetingPatch } from "@/lib/meetings";
import type { Role } from "@/lib/types";

export type TeamMember = { id: string; name: string; role: Role; member_role: string };
export type TaskInfo = { status: string; title: string };

export const initials = (n: string) => n.replace(/^(Dr\.?|Prof\.?)\s+/i, "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("");
export const faceTone = (p: TeamMember | undefined) => (p ? cn(ROLE_BAND[p.role]?.bg ?? "bg-sand", ROLE_BAND[p.role]?.fg) : "bg-sand");

const TICK = "grid size-5 shrink-0 place-items-center rounded-full border-[1.5px] border-ink transition-[background-color,transform] duration-150 active:scale-90";
const BAR = ["bg-sun", "bg-sky", "bg-mint", "bg-peach", "bg-sand"];

// ------------------------------------------------------------------ small parts

function Tick({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button type="button" aria-label={label} aria-pressed={on} onClick={onClick} className={cn(TICK, on ? "bg-mint" : "bg-card hover:bg-sand")}>
      <AnimatePresence initial={false}>
        {on && (
          <motion.span initial={{ scale: 0, rotate: -30 }} animate={{ scale: 1, rotate: 0 }} exit={{ scale: 0 }} transition={SPRING.bouncy}>
            <Check className="size-3" strokeWidth={3} />
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  );
}

/** Text that saves on blur or Enter; Escape puts it back. */
function Field({ value, onCommit, placeholder, className, multiline = false }: { value: string; onCommit: (v: string) => void; placeholder?: string; className?: string; multiline?: boolean }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  const commit = () => {
    const t = v.replace(/\s+/g, " ").trim();
    if (t !== value.trim()) onCommit(t);
  };
  return (
    <input
      value={v}
      placeholder={placeholder}
      aria-label={placeholder}
      onChange={(e) => setV(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !multiline) (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") {
          setV(value);
          (e.target as HTMLInputElement).blur();
        }
      }}
      className={cn("min-w-0 rounded-md border-[1.5px] border-transparent bg-transparent px-1.5 py-0.5 outline-none transition-colors placeholder:text-muted-foreground/70 hover:border-ink/20 focus:border-ink focus:bg-card", className)}
    />
  );
}

/** Avatar button that opens a team list. */
export function OwnerPick({ team, value, onChange, size = 26 }: { team: TeamMember[]; value: string | null | undefined; onChange: (id: string | null) => void; size?: number }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const p = team.find((t) => t.id === value);
  useEffect(() => {
    if (!open) return;
    const off = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", off);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", off);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  return (
    <div ref={box} className="relative shrink-0">
      <button
        type="button"
        title={p?.name ?? (value || "Owner")}
        aria-label={p ? `Owner ${p.name}` : "Pick owner"}
        onClick={() => setOpen((o) => !o)}
        style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}
        className={cn(
          "grid place-items-center rounded-full border-[1.5px] font-display font-bold leading-none transition-transform duration-150 hover:-rotate-6 hover:scale-110",
          p ? cn("border-ink", faceTone(p)) : value ? "border-ink bg-sand" : "border-dashed border-ink/40 text-muted-foreground",
        )}
      >
        {p ? initials(p.name) : value ? initials(value) : <Plus className="size-3" />}
      </button>
      {open && (
        <ul role="listbox" className="absolute right-0 top-full z-40 mt-1.5 max-h-64 w-52 origin-top-right animate-in fade-in zoom-in-95 slide-in-from-top-1 overflow-auto rounded-xl border-[1.5px] border-ink bg-card p-1 shadow-[2px_2px_0_0_#161514] duration-150">
          {team.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                role="option"
                aria-selected={t.id === value}
                onClick={() => {
                  setOpen(false);
                  onChange(t.id);
                }}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors hover:bg-sand"
              >
                <span className={cn("grid size-6 shrink-0 place-items-center rounded-full border-[1.5px] border-ink font-display text-[10px] font-bold", faceTone(t))}>{initials(t.name)}</span>
                <span className="min-w-0 flex-1 truncate">{t.name}</span>
                {t.id === value && <Check className="size-3.5 text-tomato-ink" />}
              </button>
            </li>
          ))}
          {value && (
            <li className="mt-1 border-t border-ink/10 pt-1">
              <button type="button" onClick={() => (setOpen(false), onChange(null))} className="w-full rounded-lg px-2 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-sand hover:text-ink">
                Clear
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

function Sec({ title, meta, action, children }: { title: string; meta?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="border-b-[1.5px] border-ink/10 px-5 py-4 last:border-b-0">
      <header className="mb-2.5 flex items-center justify-between gap-3">
        <div className="flex items-baseline gap-2.5">
          <h3 className="mono-label font-bold text-ink">{title}</h3>
          {meta != null && <span className="font-mono text-[11px] text-muted-foreground tabular">{meta}</span>}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

function AddLine({ placeholder, onAdd }: { placeholder: string; onAdd: (v: string) => void }) {
  const [v, setV] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!v.trim()) return;
        onAdd(v.trim());
        setV("");
      }}
      className="group/add mt-1.5 flex items-center gap-2 rounded-lg border-[1.5px] border-dashed border-ink/25 px-2 py-1 transition-colors focus-within:border-ink hover:border-ink/60"
    >
      <Plus className="size-3.5 shrink-0 text-muted-foreground transition-transform duration-200 group-focus-within/add:rotate-90 group-hover/add:rotate-90" />
      <input value={v} onChange={(e) => setV(e.target.value)} placeholder={placeholder} aria-label={placeholder} className="h-7 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/70" />
    </form>
  );
}

const RemoveBtn = ({ onClick, label }: { onClick: () => void; label: string }) => (
  <button type="button" aria-label={label} onClick={onClick} className="grid size-6 shrink-0 scale-75 place-items-center rounded-full text-muted-foreground opacity-0 transition-[opacity,transform,background-color] hover:bg-tomato hover:text-ink focus-visible:scale-100 focus-visible:opacity-100 group-hover:scale-100 group-hover:opacity-100">
    <X className="size-3" />
  </button>
);

const rowIn = { initial: { opacity: 0, y: 6 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, x: 16, transition: { duration: 0.15 } } };

// ------------------------------------------------------------------ minutes editor

function MinutesEditor({ value, onSave }: { value: string; onSave: (v: string) => Promise<boolean> }) {
  const [text, setText] = useState(value);
  const [state, setState] = useState<"idle" | "dirty" | "saving" | "saved">("idle");
  const ref = useRef<HTMLTextAreaElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(text);
  const saved = useRef(value);

  const grow = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(176, el.scrollHeight)}px`;
  };
  useEffect(grow, []);

  const flush = async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const v = latest.current;
    if (v === saved.current) return;
    setState("saving");
    const ok = await onSave(v);
    if (ok) saved.current = v;
    setState(ok ? (latest.current === v ? "saved" : "dirty") : "dirty");
  };
  useEffect(
    () => () => {
      if (timer.current) void flush();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const set = (v: string, caret?: number) => {
    setText(v);
    latest.current = v;
    setState("dirty");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), 800);
    requestAnimationFrame(() => {
      grow();
      if (caret != null && ref.current) ref.current.setSelectionRange(caret, caret);
    });
  };

  /** Toggle a prefix ("## " or "- ") on the caret's line. */
  const prefix = (p: string) => {
    const el = ref.current;
    if (!el) return;
    const pos = el.selectionStart;
    const start = text.lastIndexOf("\n", pos - 1) + 1;
    const line = text.slice(start);
    const has = line.startsWith(p);
    const other = p === "## " ? "- " : "## ";
    const strip = has ? p.length : line.startsWith(other) ? other.length : 0;
    const next = text.slice(0, start) + (has ? "" : p) + text.slice(start + strip);
    set(next, Math.max(start, pos + (has ? -p.length : p.length - strip)));
    el.focus();
  };

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== "Enter" || e.shiftKey) return;
    const el = e.currentTarget;
    const pos = el.selectionStart;
    const start = text.lastIndexOf("\n", pos - 1) + 1;
    const line = text.slice(start, pos);
    if (!line.startsWith("- ")) return;
    e.preventDefault();
    if (line.trim() === "-") return set(text.slice(0, start) + text.slice(pos), start);
    set(`${text.slice(0, pos)}\n- ${text.slice(pos)}`, pos + 3);
  };

  const tool = "grid size-7 place-items-center rounded-md border-[1.5px] border-transparent text-muted-foreground transition-[border-color,color,transform] hover:-translate-y-px hover:border-ink hover:text-ink";
  return (
    <div className="overflow-hidden rounded-xl border-[1.5px] border-ink/25 bg-card transition-colors focus-within:border-ink">
      <div className="flex items-center gap-1 border-b border-ink/10 px-1.5 py-1">
        <button type="button" title="Heading" aria-label="Heading" onMouseDown={(e) => e.preventDefault()} onClick={() => prefix("## ")} className={tool}>
          <Heading2 className="size-3.5" />
        </button>
        <button type="button" title="Bullet" aria-label="Bullet" onMouseDown={(e) => e.preventDefault()} onClick={() => prefix("- ")} className={tool}>
          <List className="size-3.5" />
        </button>
        <span className="ml-auto flex items-center gap-1.5 pr-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          <span className={cn("size-1.5 rounded-full transition-colors", state === "saving" ? "animate-pulse bg-sun" : state === "dirty" ? "bg-peach" : state === "saved" ? "bg-[#46a758]" : "bg-ink/15")} />
          {state === "saving" ? "Saving" : state === "dirty" ? "Editing" : state === "saved" ? "Saved" : ""}
        </span>
      </div>
      <textarea
        ref={ref}
        value={text}
        onChange={(e) => set(e.target.value)}
        onKeyDown={onKey}
        onBlur={() => void flush()}
        placeholder={"## Topic\n- What was said"}
        aria-label="Minutes"
        className="block min-h-44 w-full resize-none bg-transparent px-3.5 py-3 text-sm leading-relaxed outline-none placeholder:text-muted-foreground/60"
      />
    </div>
  );
}

// ------------------------------------------------------------------ drawer

export function MeetingDrawer({
  meeting,
  eventId,
  eventTitle,
  team,
  tasks,
  now,
  onClose,
}: {
  meeting: Meeting;
  eventId: string;
  eventTitle: string;
  team: TeamMember[];
  tasks: Record<string, TaskInfo>;
  now: number;
  onClose: () => void;
}) {
  const [m, setM] = useState(meeting);
  const [copied, setCopied] = useState(false);
  const [armed, setArmed] = useState(false);
  const [busyTask, setBusyTask] = useState<string | null>(null);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const names = Object.fromEntries(team.map((t) => [t.id, t.name]));
  const past = isPast(m, now);
  const when = klParts(m.starts_at);

  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(t);
  }, [armed]);

  /** Saves run one after another so a quick add then "Make task" lands in order. */
  const save = (patch: MeetingPatch, local?: Partial<Meeting>) => {
    if (local) setM((cur) => ({ ...cur, ...local }));
    const p = queue.current.then(() => saveMeeting(m.id, patch));
    queue.current = p.catch(() => undefined);
    return p.then((r) => {
      if (!r.ok) toast.error(r.error);
      return r.ok;
    });
  };

  const setAgenda = (agenda: AgendaItem[]) => save({ agenda }, { agenda });
  const setActions = (action_items: ActionItem[]) => save({ action_items }, { action_items });
  const setDecisions = (decisions: string[]) => save({ decisions }, { decisions });

  const makeTask = (a: ActionItem) => {
    setBusyTask(a.id);
    const p = queue.current.then(() => makeActionTask(m.id, a.id));
    queue.current = p.catch(() => undefined);
    p.then((r) => {
      setBusyTask(null);
      if (!r.ok) return void toast.error(r.error);
      const tid = r.data?.task_id;
      setM((cur) => ({ ...cur, action_items: cur.action_items.map((x) => (x.id === a.id ? { ...x, task_id: tid, due_date: r.data?.meeting.action_items.find((y) => y.id === a.id)?.due_date ?? x.due_date } : x)) }));
      toast.success("Added to tasks");
    });
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(minutesMarkdown(m, { eventTitle, names }));
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error("Copy blocked by the browser");
    }
  };

  const markDone = (e: React.MouseEvent) => {
    const done = m.status !== "done";
    if (done) fireConfetti(e.clientX, e.clientY);
    void save({ status: done ? "done" : "scheduled" }, { status: done ? "done" : "scheduled" });
  };

  const remove = () => {
    if (!armed) return setArmed(true);
    deleteMeeting(m.id).then((r) => {
      if (!r.ok) return void toast.error(r.error);
      toast.success("Meeting deleted");
      onClose();
    });
  };

  const attendSet = new Set(m.attended);
  const inviteSet = new Set(m.attendees);
  const totalBox = m.agenda.reduce((s, a) => s + (a.minutes ?? 0), 0);
  const over = totalBox - m.duration_min;
  const openActions = m.action_items.filter((a) => !a.done && !(a.task_id && tasks[a.task_id]?.status === "done")).length;

  const iconBtn = "grid size-8 place-items-center rounded-lg border-[1.5px] border-ink/20 bg-card transition-[border-color,transform,background-color] hover:-translate-y-px hover:border-ink active:translate-y-0";
  const metaInput = "rounded-md border-[1.5px] border-transparent bg-transparent px-1 py-0.5 font-mono text-xs tabular outline-none transition-colors hover:border-ink/20 focus:border-ink focus:bg-card";

  return (
    <>
      <motion.div key="scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="fixed inset-0 z-[80] bg-ink/30 backdrop-blur-[2px]" />
      <motion.aside
        key="panel"
        role="dialog"
        aria-label={m.title}
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={SPRING.soft}
        className="fixed inset-y-0 right-0 z-[81] flex w-full max-w-2xl flex-col border-l-[1.5px] border-ink bg-background"
      >
        {/* header */}
        <div className={cn("border-b-[1.5px] border-ink px-5 pb-3 pt-4", m.status === "cancelled" ? "bg-sand" : past ? "bg-card" : "bg-sun/40")}>
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <p className="mono-label text-[10px] text-tomato-ink">{m.status === "cancelled" ? "Called off" : m.status === "done" ? "Done" : past ? "Needs wrap-up" : "Upcoming"}</p>
              <Field value={m.title} placeholder="Title" onCommit={(title) => title && save({ title }, { title })} className={cn("-ml-1.5 mt-0.5 w-full font-display text-2xl font-bold", m.status === "cancelled" && "line-through")} />
            </div>
            <div className="flex shrink-0 items-center gap-1.5 pt-1">
              <button type="button" title="Copy minutes" aria-label="Copy minutes" onClick={copy} className={iconBtn}>
                <AnimatePresence mode="wait" initial={false}>
                  <motion.span key={copied ? "y" : "n"} initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.5, opacity: 0 }} transition={{ duration: 0.12 }}>
                    {copied ? <Check className="size-3.5 text-[#2a7e3b]" strokeWidth={3} /> : <Copy className="size-3.5" />}
                  </motion.span>
                </AnimatePresence>
              </button>
              <a href={`/api/meetings/${m.id}/minutes?format=pdf`} target="_blank" title="Minutes PDF" aria-label="Minutes PDF" className={iconBtn}>
                <FileDown className="size-3.5" />
              </a>
              <a href={`/api/meetings/${m.id}/minutes`} title="Minutes .md" aria-label="Minutes markdown" className={cn(iconBtn, "w-auto px-2 font-mono text-[10px] font-bold")}>
                .MD
              </a>
              <button type="button" aria-label="Close" onClick={onClose} className="ml-1 grid size-8 place-items-center rounded-lg transition-[background-color,transform] hover:rotate-90 hover:bg-sand">
                <X className="size-4" />
              </button>
            </div>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <input type="date" aria-label="Date" value={when.date} onChange={(e) => e.target.value && save({ date: e.target.value }, { starts_at: new Date(`${e.target.value}T${when.time}:00+08:00`).toISOString() })} className={metaInput} />
            <input type="time" aria-label="Time" value={when.time} onChange={(e) => e.target.value && save({ time: e.target.value }, { starts_at: new Date(`${when.date}T${e.target.value}:00+08:00`).toISOString() })} className={metaInput} />
            <select aria-label="Duration" value={m.duration_min} onChange={(e) => save({ duration_min: Number(e.target.value) }, { duration_min: Number(e.target.value) })} className={cn(metaInput, "cursor-pointer")}>
              {[...new Set([15, 30, 45, 60, 90, 120, m.duration_min])].sort((a, b) => a - b).map((d) => (
                <option key={d} value={d}>
                  {d} min
                </option>
              ))}
            </select>
            <span className="inline-flex min-w-0 items-center gap-0.5">
              <MapPin className="size-3 shrink-0" />
              <Field value={m.location ?? ""} placeholder="Place" onCommit={(location) => save({ location }, { location: location || null })} className="w-36 text-xs" />
            </span>
            <span className="inline-flex min-w-0 items-center gap-0.5">
              <Video className="size-3 shrink-0" />
              <Field value={m.meeting_url ?? ""} placeholder="Link" onCommit={(meeting_url) => save({ meeting_url }, { meeting_url: meeting_url || null })} className="w-44 font-mono text-[11px]" />
            </span>
          </div>
          {!past && (
            <div className="mt-3 flex flex-wrap gap-2">
              {m.meeting_url && (
                <a href={m.meeting_url} target="_blank" rel="noreferrer" className="group inline-flex h-8 items-center gap-1.5 rounded-lg border-[1.5px] border-ink bg-ink px-3 text-xs font-semibold text-white shadow-[2px_2px_0_0_#ff5a36] transition-[transform,box-shadow] hover:-translate-y-px hover:shadow-[3px_3px_0_0_#ff5a36]">
                  <Video className="size-3.5" />
                  Join
                  <ArrowUpRight className="size-3 transition-transform group-hover:-translate-y-px group-hover:translate-x-px" />
                </a>
              )}
              <a href={`/api/meetings/${m.id}/ics`} className="group inline-flex h-8 items-center gap-1.5 rounded-lg border-[1.5px] border-ink bg-card px-3 text-xs font-semibold transition-[transform,box-shadow] hover:-translate-y-px hover:shadow-[2px_2px_0_0_#161514]">
                <CalendarPlus className="size-3.5 transition-transform group-hover:scale-110" />
                Calendar
              </a>
            </div>
          )}
        </div>

        {/* body */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          <Sec title="Agenda" meta={m.agenda.length ? `${m.agenda.filter((a) => a.done).length}/${m.agenda.length}` : undefined}>
            {m.agenda.length > 0 && totalBox > 0 && (
              <div className="mb-3" title={`${totalBox} of ${m.duration_min} min planned`}>
                <div className={cn("flex h-2.5 overflow-hidden rounded-full border-[1.5px]", over > 0 ? "border-tomato-ink" : "border-ink")}>
                  {m.agenda.map((a, i) =>
                    a.minutes ? (
                      <motion.span
                        key={a.id ?? i}
                        title={`${a.item} · ${a.minutes} min`}
                        initial={{ width: 0 }}
                        animate={{ width: `${(a.minutes / Math.max(totalBox, m.duration_min)) * 100}%` }}
                        transition={SPRING.soft}
                        className={cn("h-full border-r border-ink/40 last:border-r-0 transition-opacity hover:opacity-70", a.done ? "bg-ink/25" : BAR[i % BAR.length])}
                      />
                    ) : null,
                  )}
                </div>
                <div className="mt-1 flex justify-between font-mono text-[10px] text-muted-foreground tabular">
                  <span>{totalBox} min</span>
                  <span className={over > 0 ? "font-bold text-tomato-ink" : ""}>{over > 0 ? `${over} over` : `${m.duration_min} min`}</span>
                </div>
              </div>
            )}
            <ul className="space-y-0.5">
              <AnimatePresence initial={false}>
                {m.agenda.map((a, i) => (
                  <motion.li key={a.id ?? i} layout {...rowIn} className="group flex items-center gap-2 rounded-lg px-1 py-0.5 transition-colors hover:bg-sand/40">
                    <Tick on={Boolean(a.done)} label={`Covered ${a.item}`} onClick={() => setAgenda(m.agenda.map((x, j) => (j === i ? { ...x, done: !x.done } : x)))} />
                    <Field value={a.item} placeholder="Item" onCommit={(item) => item && setAgenda(m.agenda.map((x, j) => (j === i ? { ...x, item } : x)))} className={cn("flex-1 text-sm", a.done && "text-muted-foreground line-through")} />
                    <label className="flex shrink-0 items-center rounded-md border-[1.5px] border-transparent font-mono text-[11px] text-muted-foreground transition-colors focus-within:border-ink hover:border-ink/20" title="Time box">
                      <input
                        type="number"
                        min={0}
                        max={240}
                        defaultValue={a.minutes ?? ""}
                        aria-label="Minutes"
                        onBlur={(e) => {
                          const n = Number(e.target.value) || null;
                          if (n !== (a.minutes ?? null)) setAgenda(m.agenda.map((x, j) => (j === i ? { ...x, minutes: n } : x)));
                        }}
                        className="w-8 bg-transparent py-0.5 text-right outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                      />
                      <span className="pr-1.5">m</span>
                    </label>
                    <OwnerPick team={team} value={a.owner} size={24} onChange={(owner) => setAgenda(m.agenda.map((x, j) => (j === i ? { ...x, owner } : x)))} />
                    <RemoveBtn label={`Remove ${a.item}`} onClick={() => setAgenda(m.agenda.filter((_, j) => j !== i))} />
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
            <AddLine placeholder="Agenda item" onAdd={(item) => setAgenda([...m.agenda, { id: shortId(), item, minutes: 10, owner: null, done: false }])} />
          </Sec>

          <Sec title={past ? "Attended" : "Invited"} meta={past ? `${m.attendees.filter((a) => attendSet.has(a)).length}/${m.attendees.length}` : String(m.attendees.length)}>
            <ul className="flex flex-wrap gap-1.5">
              {team.map((t, i) => {
                const invited = inviteSet.has(t.id);
                const on = past ? attendSet.has(t.id) : invited;
                if (past && !invited) return null;
                const toggle = () => {
                  if (past) {
                    const attended = on ? m.attended.filter((x) => x !== t.id) : [...m.attended, t.id];
                    return void save({ attended }, { attended });
                  }
                  const attendees = on ? m.attendees.filter((x) => x !== t.id) : [...m.attendees, t.id];
                  void save({ attendees }, { attendees });
                };
                return (
                  <motion.li key={t.id} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.03 }}>
                    <button
                      type="button"
                      aria-pressed={on}
                      onClick={toggle}
                      className={cn(
                        "group/p flex h-9 items-center gap-2 rounded-full border-[1.5px] py-1 pl-1 pr-3 text-sm transition-[transform,box-shadow,background-color,opacity] duration-150 hover:-translate-y-0.5 active:translate-y-0",
                        on ? "border-ink bg-card hover:shadow-[2px_2px_0_0_#161514]" : "border-dashed border-ink/30 text-muted-foreground opacity-70 hover:opacity-100",
                      )}
                    >
                      <span className={cn("relative grid size-7 place-items-center rounded-full border-[1.5px] font-display text-[10px] font-bold transition-transform group-hover/p:-rotate-6", on ? cn("border-ink", faceTone(t)) : "border-dashed border-ink/40")}>
                        {initials(t.name)}
                        {on && past && (
                          <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={SPRING.bouncy} className="absolute -bottom-1 -right-1 grid size-3.5 place-items-center rounded-full border border-ink bg-mint text-ink">
                            <Check className="size-2" strokeWidth={4} />
                          </motion.span>
                        )}
                      </span>
                      {t.name.split(/\s+/)[0]}
                    </button>
                  </motion.li>
                );
              })}
            </ul>
          </Sec>

          <Sec title="Minutes">
            <MinutesEditor value={m.minutes ?? ""} onSave={(minutes) => save({ minutes }, { minutes })} />
          </Sec>

          <Sec title="Decisions" meta={m.decisions.length || undefined}>
            <ol className="space-y-1">
              <AnimatePresence initial={false}>
                {m.decisions.map((d, i) => (
                  <motion.li key={`${i}-${d}`} layout {...rowIn} className="group flex items-center gap-2 rounded-lg px-1 py-0.5 transition-colors hover:bg-sand/40">
                    <span className="grid size-5 shrink-0 place-items-center rounded-md border-[1.5px] border-ink bg-sky font-mono text-[10px] font-bold transition-transform group-hover:-rotate-6">{i + 1}</span>
                    <Field value={d} placeholder="Decision" onCommit={(v) => setDecisions(v ? m.decisions.map((x, j) => (j === i ? v : x)) : m.decisions.filter((_, j) => j !== i))} className="flex-1 text-sm" />
                    <RemoveBtn label="Remove decision" onClick={() => setDecisions(m.decisions.filter((_, j) => j !== i))} />
                  </motion.li>
                ))}
              </AnimatePresence>
            </ol>
            <AddLine placeholder="Decision" onAdd={(d) => setDecisions([...m.decisions, d])} />
          </Sec>

          <Sec title="Action items" meta={m.action_items.length ? `${openActions} open` : undefined}>
            <ul className="space-y-1">
              <AnimatePresence initial={false}>
                {m.action_items.map((a) => {
                  const task = a.task_id ? tasks[a.task_id] : undefined;
                  const done = a.done || task?.status === "done";
                  return (
                    <motion.li key={a.id} layout {...rowIn} className="group flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg px-1 py-1 transition-colors hover:bg-sand/40 sm:flex-nowrap">
                      <Tick on={done} label={`Done ${a.text}`} onClick={() => setActions(m.action_items.map((x) => (x.id === a.id ? { ...x, done: !done } : x)))} />
                      <Field value={a.text} placeholder="Action" onCommit={(text) => text && setActions(m.action_items.map((x) => (x.id === a.id ? { ...x, text } : x)))} className={cn("min-w-40 flex-1 text-sm", done && "text-muted-foreground line-through")} />
                      <input
                        type="date"
                        aria-label="Due"
                        value={a.due_date ?? ""}
                        onChange={(e) => setActions(m.action_items.map((x) => (x.id === a.id ? { ...x, due_date: e.target.value || null } : x)))}
                        className={cn(metaInput, "w-[118px] text-muted-foreground", !a.due_date && "opacity-60")}
                      />
                      <OwnerPick team={team} value={a.owner_id} size={24} onChange={(owner_id) => setActions(m.action_items.map((x) => (x.id === a.id ? { ...x, owner_id } : x)))} />
                      {a.task_id ? (
                        <Link
                          href={`/events/${eventId}/tasks`}
                          title={task?.title ?? "Open tasks"}
                          className={cn("inline-flex h-6 shrink-0 items-center gap-1 rounded-full border-[1.5px] border-ink px-2 font-mono text-[10px] font-bold uppercase transition-transform hover:-translate-y-px", task?.status === "done" ? "bg-mint" : task?.status === "doing" ? "bg-sun" : "bg-sky")}
                        >
                          {task?.status === "doing" ? "Doing" : task?.status === "done" ? "Done" : "Task"}
                          <ArrowUpRight className="size-3" />
                        </Link>
                      ) : (
                        <button
                          type="button"
                          onClick={() => makeTask(a)}
                          disabled={busyTask === a.id}
                          className={cn("inline-flex h-6 shrink-0 items-center gap-1 rounded-full border-[1.5px] border-dashed border-ink/40 px-2 font-mono text-[10px] font-bold uppercase text-muted-foreground transition-[border-color,color,background-color,transform] hover:-translate-y-px hover:border-solid hover:border-ink hover:bg-sun hover:text-ink", busyTask === a.id && "animate-pulse")}
                        >
                          <Plus className="size-3" />
                          Task
                        </button>
                      )}
                      <RemoveBtn label={`Remove ${a.text}`} onClick={() => setActions(m.action_items.filter((x) => x.id !== a.id))} />
                    </motion.li>
                  );
                })}
              </AnimatePresence>
            </ul>
            <AddLine placeholder="Action item" onAdd={(text) => setActions([...m.action_items, { id: shortId(), text, owner_id: null, due_date: null, task_id: null, done: false }])} />
          </Sec>
        </div>

        {/* footer */}
        <div className="flex items-center gap-2 border-t-[1.5px] border-ink bg-card px-5 py-3">
          <button
            type="button"
            onClick={remove}
            title="Delete meeting"
            className={cn("inline-flex h-9 items-center gap-1.5 rounded-lg border-[1.5px] px-2.5 text-xs font-semibold transition-[background-color,border-color,width]", armed ? "border-ink bg-tomato" : "border-transparent text-muted-foreground hover:border-ink/25 hover:text-ink")}
          >
            <Trash2 className="size-3.5" />
            {armed && "Delete?"}
          </button>
          {m.status === "scheduled" && !past && (
            <button type="button" onClick={() => save({ status: "cancelled" }, { status: "cancelled" })} className="h-9 rounded-lg px-2.5 text-xs text-muted-foreground transition-colors hover:bg-sand hover:text-ink">
              Call off
            </button>
          )}
          <span className="font-mono text-[10px] text-muted-foreground">{fmtWhen(m.starts_at)}</span>
          <div className="ml-auto flex items-center gap-3">
            <AnimatePresence>{m.status === "done" && <Stamp key="stamp" tone="green" animate>Minuted</Stamp>}</AnimatePresence>
            {m.status === "cancelled" ? (
              <button type="button" onClick={() => save({ status: "scheduled" }, { status: "scheduled" })} className="inline-flex h-9 items-center gap-1.5 rounded-xl border-[1.5px] border-ink bg-card px-3 text-sm font-semibold transition-transform hover:-translate-y-px">
                <Undo2 className="size-3.5" />
                Restore
              </button>
            ) : (
              <motion.button
                type="button"
                whileTap={{ scale: 0.96 }}
                onClick={markDone}
                className={cn(
                  "inline-flex h-9 items-center gap-1.5 rounded-xl border-[1.5px] border-ink px-3.5 text-sm font-semibold transition-[transform,box-shadow] hover:-translate-y-px",
                  m.status === "done" ? "bg-card text-muted-foreground hover:text-ink" : "bg-tomato shadow-[2px_2px_0_0_#161514] hover:shadow-[3px_3px_0_0_#161514]",
                )}
              >
                {m.status === "done" ? <Undo2 className="size-3.5" /> : <Check className="size-3.5" strokeWidth={3} />}
                {m.status === "done" ? "Reopen" : "Mark done"}
              </motion.button>
            )}
          </div>
        </div>
      </motion.aside>
    </>
  );
}
