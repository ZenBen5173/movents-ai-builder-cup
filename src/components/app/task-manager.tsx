"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { Check, Link2, Plus, Search, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { KanbanBoard, KanbanCard, KanbanCards, KanbanHeader, KanbanProvider, type DragEndEvent } from "@/components/kibo-ui/kanban";
import { DataTable } from "@/components/gustflow-table/DataTable";
import type { ColumnDef } from "@/components/gustflow-table/types";
import { createTask, deleteTask, updateTask } from "@/app/actions";
import { Icon, fireConfetti } from "@/components/ep/kit";
import { Pill } from "./ui";
import { cn } from "@/lib/utils";
import { SPRING } from "@/lib/motion";
import type { Phase, Task } from "@/lib/types";

export type TaskItem = Task & { owner: string | null };
type Person = { id: string; name: string };
type View = "board" | "list" | "timeline";

const PHASES: { key: Phase; label: string; tone: string }[] = [
  { key: "concept", label: "Concept", tone: "bg-sky" },
  { key: "planning", label: "Planning", tone: "bg-sun" },
  { key: "promotion", label: "Promotion", tone: "bg-peach" },
  { key: "execution", label: "Execution", tone: "bg-tomato" },
  { key: "post", label: "Post-event", tone: "bg-mint" },
];
const COLS = [
  { id: "todo", name: "To do" },
  { id: "doing", name: "In progress" },
  { id: "done", name: "Done" },
];
const short = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const clean = (t: string) => t.replace(/^SOP: /, "");

function blockersOf(t: TaskItem, all: TaskItem[]) {
  return (t.depends_on ?? []).map((d) => all.find((x) => x.id === d)).filter((x): x is TaskItem => Boolean(x) && x!.status !== "done");
}

// ------------------------------------------------------------------ editor drawer

function TaskEditor({ task, all, people, onClose }: { task: TaskItem; all: TaskItem[]; people: Person[]; onClose: () => void }) {
  const [f, setF] = useState({ title: task.title, owner_id: task.owner_id ?? "", priority: task.priority ?? "medium", start_date: task.start_date ?? task.due_date, due_date: task.due_date, phase: task.phase, description: task.description ?? "" });
  const [deps, setDeps] = useState<string[]>(task.depends_on ?? []);
  const [q, setQ] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const dependents = all.filter((x) => (x.depends_on ?? []).includes(task.id));
  const save = () =>
    start(async () => {
      const r = await updateTask(task.id, { ...f, owner_id: f.owner_id || null, depends_on: deps, description: f.description || null });
      if (!r.ok) return void toast.error(r.error);
      toast.success("Saved");
      router.refresh();
      onClose();
    });
  const field = "h-9 w-full rounded-lg border-[1.5px] border-ink/20 bg-card px-2.5 text-sm outline-none focus:border-ink";
  return (
    <>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="fixed inset-0 z-40 bg-ink/25" />
      <motion.aside initial={{ x: 480 }} animate={{ x: 0 }} exit={{ x: 480 }} transition={SPRING.soft} className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[460px] flex-col border-l-[1.5px] border-ink bg-background">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <span className="mono-label text-[10px] text-tomato">Task · {f.phase}</span>
          <button onClick={onClose} className="grid size-8 place-items-center rounded-lg hover:bg-sand"><X className="size-4" /></button>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto p-5 scrollbar-thin">
          <textarea value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} rows={2} className="w-full resize-none bg-transparent font-display text-2xl font-bold leading-tight outline-none" />
          <dl className="grid grid-cols-[96px_1fr] items-center gap-x-3 gap-y-2.5 text-sm">
            <dt className="mono-label text-[10px] text-muted-foreground">Owner</dt>
            <dd><select value={f.owner_id} onChange={(e) => setF({ ...f, owner_id: e.target.value })} className={field}><option value="">Unassigned</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></dd>
            <dt className="mono-label text-[10px] text-muted-foreground">Priority</dt>
            <dd className="flex gap-1">{(["low", "medium", "high", "urgent"] as const).map((p) => <button key={p} onClick={() => setF({ ...f, priority: p })} className={cn("rounded-md border-[1.5px] px-2 py-1 text-xs capitalize", f.priority === p ? "border-ink bg-ink text-white" : "border-ink/15 hover:border-ink/40")}>{p}</button>)}</dd>
            <dt className="mono-label text-[10px] text-muted-foreground">Phase</dt>
            <dd><select value={f.phase} onChange={(e) => setF({ ...f, phase: e.target.value as Phase })} className={field}>{PHASES.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}</select></dd>
            <dt className="mono-label text-[10px] text-muted-foreground">Start</dt>
            <dd><input type="date" value={f.start_date} onChange={(e) => setF({ ...f, start_date: e.target.value })} className={field} /></dd>
            <dt className="mono-label text-[10px] text-muted-foreground">Due</dt>
            <dd><input type="date" value={f.due_date} onChange={(e) => setF({ ...f, due_date: e.target.value })} className={field} /></dd>
          </dl>
          {task.sop_ref && <p className="rounded-lg bg-sun-soft px-3 py-2 text-xs">SOP deadline: {task.sop_ref}</p>}
          <textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} rows={3} placeholder="Notes…" className="w-full rounded-lg border-[1.5px] border-ink/15 bg-card p-2.5 text-sm outline-none focus:border-ink" />

          <div>
            <p className="mono-label mb-2 flex items-center gap-1.5 text-[10px] font-bold"><Link2 className="size-3" />Waiting on ({deps.length})</p>
            <div className="relative mb-2">
              <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Add a dependency…" className={cn(field, "pl-8")} />
            </div>
            <ul className="max-h-56 space-y-0.5 overflow-y-auto scrollbar-thin">
              {all
                .filter((x) => x.id !== task.id && (deps.includes(x.id) || (q && x.title.toLowerCase().includes(q.toLowerCase()))))
                .slice(0, 30)
                .map((x) => {
                  const on = deps.includes(x.id);
                  return (
                    <li key={x.id}>
                      <button onClick={() => setDeps(on ? deps.filter((d) => d !== x.id) : [...deps, x.id])} className={cn("flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm", on ? "bg-sand" : "hover:bg-sand/50")}>
                        <span className={cn("grid size-4 shrink-0 place-items-center rounded border-[1.5px] border-ink", on && "bg-ink text-white")}>{on && <Check className="size-3" />}</span>
                        <span className="flex-1 truncate">{clean(x.title)}</span>
                        <Pill status={x.status} />
                      </button>
                    </li>
                  );
                })}
            </ul>
          </div>
          {dependents.length > 0 && (
            <div>
              <p className="mono-label mb-1 text-[10px] font-bold">Blocking ({dependents.length})</p>
              <ul className="text-sm text-muted-foreground">{dependents.map((d) => <li key={d.id}>→ {clean(d.title)}</li>)}</ul>
            </div>
          )}
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-border p-4">
          <button
            onClick={() =>
              start(async () => {
                if (!window.confirm("Delete this task?")) return;
                const r = await deleteTask(task.id);
                if (!r.ok) return void toast.error(r.error);
                router.refresh();
                onClose();
              })
            }
            className="inline-flex h-9 items-center gap-1 rounded-lg px-3 text-sm text-tomato-ink hover:bg-peach/50"
          >
            <Trash2 className="size-4" />Delete
          </button>
          <button disabled={pending} onClick={save} className="h-10 rounded-xl bg-ink px-5 text-sm font-medium text-white shadow-[2px_2px_0_0_#ff5a36]">{pending ? "Saving…" : "Save task"}</button>
        </div>
      </motion.aside>
    </>
  );
}

// ------------------------------------------------------------------ board

function Board({ tasks, onOpen }: { tasks: TaskItem[]; onOpen: (t: TaskItem) => void }) {
  const router = useRouter();
  const [data, setData] = useState(() => tasks.map((t) => ({ id: t.id, name: t.title, column: t.status as string })));
  useEffect(() => setData(tasks.map((t) => ({ id: t.id, name: t.title, column: t.status as string }))), [tasks]);
  const byId = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);
  const onDragEnd = async (e: DragEndEvent) => {
    const id = String(e.active.id);
    const before = byId.get(id)?.status;
    const after = data.find((d) => d.id === id)?.column;
    if (!after || after === before) return;
    const r = await updateTask(id, { status: after as Task["status"] });
    if (!r.ok) {
      toast.error(r.error);
      setData(tasks.map((t) => ({ id: t.id, name: t.title, column: t.status as string })));
    } else if (after === "done") {
      fireConfetti();
    }
    router.refresh();
  };
  return (
    <KanbanProvider columns={COLS} data={data} onDataChange={setData} onDragEnd={onDragEnd} className="grid gap-4 md:grid-cols-3">
      {(col) => (
        <KanbanBoard key={col.id} id={col.id} className="rounded-2xl border-[1.5px] border-ink/15 bg-sand/40 shadow-none">
          <KanbanHeader className="flex items-center justify-between px-3 py-2.5">
            <span className="mono-label text-[11px] font-bold">{col.name}</span>
            <span className="font-mono text-xs text-muted-foreground">{data.filter((d) => d.column === col.id).length}</span>
          </KanbanHeader>
          <KanbanCards id={col.id} className="max-h-[62vh]">
            {(item: { id: string; name: string; column: string }) => {
              const t = byId.get(item.id);
              if (!t) return null;
              const blocked = blockersOf(t, tasks);
              return (
                <KanbanCard key={item.id} {...item} className={cn("gap-1.5 rounded-xl border-[1.5px] border-ink bg-card p-3 shadow-[2px_2px_0_0_#161514]", blocked.length && item.column !== "done" && "bg-sun-soft")}>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => onOpen(t)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        // Open the task; don't let the card's keyboard-drag handler pick it up too.
                        e.preventDefault();
                        e.stopPropagation();
                        onOpen(t);
                      }
                    }}
                    className="cursor-pointer rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <p className="text-[13.5px] font-medium leading-snug">{clean(t.title)}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                      <span className="font-mono">{short(t.due_date)}</span>
                      <span>· {t.owner?.split(" ")[0] ?? "—"}</span>
                      {t.sop_ref && <Pill status="pending_approval" label="SOP" />}
                      {t.risk_id && <Pill status="open" label="risk" />}
                      {blocked.length > 0 && item.column !== "done" && <span title={`Waiting on: ${blocked.map((b) => clean(b.title)).join(", ")}`} className="inline-flex"><Icon name="lock" size={12} /></span>}
                    </div>
                    
                  </div>
                </KanbanCard>
              );
            }}
          </KanbanCards>
        </KanbanBoard>
      )}
    </KanbanProvider>
  );
}

// ------------------------------------------------------------------ list

const LIST_COLUMNS: ColumnDef[] = [
  { key: "done", label: "", type: "checkbox", editable: true, width: 56 },
  { key: "title", label: "Task", type: "text", sortable: true, filterable: true, width: 420 },
  { key: "due", label: "Due", type: "date", sortable: true, width: 130 },
  { key: "owner", label: "Owner", type: "person", sortable: true, filterable: true, width: 170 },
  { key: "phase", label: "Phase", type: "select", sortable: true, filterable: true, width: 130, options: PHASES.map((p) => ({ value: p.key, label: p.label })) },
];

function List({ tasks, onOpen }: { tasks: TaskItem[]; onOpen: (t: TaskItem) => void }) {
  const router = useRouter();
  const rows = tasks.map((t) => ({ id: t.id, done: t.status === "done", title: clean(t.title), due: t.due_date, owner: t.owner ?? "", phase: t.phase }));
  return (
    <DataTable
      columns={LIST_COLUMNS}
      data={rows}
      titleKey="title"
      viewId="movents-tasks"
      searchable
      paginated={false}
      onRowClick={(row) => {
        const t = tasks.find((x) => x.id === row.id);
        if (t) onOpen(t);
      }}
      onEdit={async (rowId, key, value) => {
        if (key !== "done") return;
        const r = await updateTask(rowId, { status: value ? "done" : "todo" });
        if (!r.ok) toast.error(r.error);
        else if (value) fireConfetti();
        router.refresh();
      }}
    />
  );
}

// ------------------------------------------------------------------ timeline (gantt with dependency arrows)

const ROW = 32;
const HEAD = 46;

function Timeline({ tasks, critical, eventDate, onOpen }: { tasks: TaskItem[]; critical: Set<string>; eventDate: string; onOpen: (t: TaskItem) => void }) {
  const byId = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);
  const shift = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
  // A task with no real duration still reads as work: from the day after its latest blocker, or 4 days before it is due.
  const startOf = (t: TaskItem) => {
    const s0 = t.start_date ?? t.due_date;
    if (s0 < t.due_date) return s0;
    const after = (t.depends_on ?? []).map((d) => byId.get(d)?.due_date).filter((d): d is string => Boolean(d)).sort().pop();
    const s1 = after ? shift(after, 1) : shift(t.due_date, -4);
    return s1 < t.due_date ? s1 : t.due_date;
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const rows = useMemo(() => [...tasks].sort((a, b) => startOf(a).localeCompare(startOf(b)) || a.due_date.localeCompare(b.due_date)), [tasks]);
  const toDay = (d: string) => Math.round(Date.parse(`${d}T00:00:00Z`) / 86400000);
  const min = Math.min(...rows.map((t) => toDay(startOf(t))), toDay(eventDate)) - 2;
  const max = Math.max(...rows.map((t) => toDay(t.due_date)), toDay(eventDate)) + 7;
  const span = Math.max(1, max - min);
  const scroller = useRef<HTMLDivElement>(null);
  const [DAY, setDay] = useState(34);
  const [tip, setTip] = useState<{ t: TaskItem; x: number; y: number } | null>(null);
  const width = span * DAY;
  const x = (d: string) => (toDay(d) - min) * DAY;
  const todayX = (Math.round(Date.now() / 86400000 + 8 / 24) - min) * DAY;
  const index = new Map(rows.map((t, i) => [t.id, i]));
  const months: { label: string; left: number }[] = [];
  const ticks: { label: string; left: number }[] = [];
  const everyWeek = DAY * 7 >= 56;
  const todayLeft = todayX;
  for (let d = min; d <= max; d++) {
    const date = new Date(d * 86400000);
    if (date.getUTCDate() === 1 || d === min) months.push({ label: date.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }), left: (d - min) * DAY });
    if (date.getUTCDay() === 1 && (everyWeek || Math.floor(d / 7) % 2 === 0)) ticks.push({ label: date.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }), left: (d - min) * DAY });
  }
  const height = rows.length * ROW;
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollLeft = Math.max(0, todayLeft - 80);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="relative overflow-hidden rounded-2xl border-[1.5px] border-ink bg-card">
      <div className="absolute right-2 top-1.5 z-20 flex items-center gap-0.5 rounded-lg border-[1.5px] border-ink bg-card p-0.5 shadow-[2px_2px_0_0_#161514]">
        {[
          ["Weeks", 14],
          ["Days", 34],
          ["Zoom", 60],
        ].map(([label, d]) => (
          <button key={label} onClick={() => setDay(d as number)} className={cn("rounded-md px-2 py-0.5 font-mono text-[10px] font-bold uppercase transition-colors", DAY === d ? "bg-ink text-white" : "text-ink/60 hover:bg-sand hover:text-ink")}>
            {label}
          </button>
        ))}
      </div>
      <div ref={scroller} className="relative overflow-x-auto scrollbar-thin" onMouseLeave={() => setTip(null)}>
        <div style={{ width }} className="relative">
          <div className="relative border-b-[1.5px] border-ink bg-card" style={{ height: HEAD }}>
            {months.map((m) => (
              <span key={m.left} style={{ left: m.left }} className="absolute top-0 h-full border-l border-ink/25 pl-1.5 pt-1.5">
                <span className="mono-label whitespace-nowrap text-[10px] font-bold">{m.label}</span>
              </span>
            ))}
            {ticks.map((t) => (
              <span key={t.left} style={{ left: t.left }} className="absolute bottom-1 -translate-x-1/2 font-mono text-[10px] text-muted-foreground">{t.label}</span>
            ))}
            {todayX > 0 && todayX < width && <span style={{ left: todayX }} className="mono-label absolute bottom-0 z-[3] -translate-x-1/2 rounded-t bg-tomato px-1.5 pt-0.5 text-[8.5px] font-bold text-ink">today</span>}
            <span style={{ left: x(eventDate) + DAY / 2 }} className="mono-label absolute bottom-0 z-[3] -translate-x-1/2 whitespace-nowrap rounded-t bg-ink px-1.5 pt-0.5 text-[8.5px] font-bold text-white">showtime</span>
          </div>
          <div className="relative" style={{ height }}>
            {ticks.map((t) => <div key={t.left} style={{ left: t.left }} className="absolute inset-y-0 w-px bg-ink/[0.06]" />)}
            {rows.map((_, i) => (i % 2 === 1 ? <div key={i} style={{ top: i * ROW, height: ROW }} className="absolute inset-x-0 bg-sand/25" /> : null))}
            {todayX > 0 && todayX < width && (
              <div style={{ left: todayX }} className="absolute inset-y-0 z-[1] w-px bg-tomato">
              </div>
            )}
            <div style={{ left: x(eventDate) + DAY / 2 }} className="absolute inset-y-0 z-[1] w-0.5 bg-ink">
            </div>
            <svg className="pointer-events-none absolute inset-0" width={width} height={height}>
              <defs>
                <marker id="arrow" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0 L6 3 L0 6 Z" fill="#161514" /></marker>
                <marker id="arrow-hot" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0 L6 3 L0 6 Z" fill="#ff5a36" /></marker>
              </defs>
              {rows.flatMap((t) =>
                (t.depends_on ?? []).map((d) => {
                  const from = rows.find((r) => r.id === d);
                  if (!from) return null;
                  const fi = index.get(d)!;
                  const ti = index.get(t.id)!;
                  const x1 = x(from.due_date) + DAY;
                  const y1 = fi * ROW + ROW / 2;
                  const x2 = x(startOf(t));
                  const y2 = ti * ROW + ROW / 2;
                  const hot = critical.has(t.id) && critical.has(d);
                  const mid = Math.max(x1 + 6, x2 - 8);
                  return <path key={`${d}-${t.id}`} d={`M${x1} ${y1} H${mid} V${y2} H${x2 - 1}`} fill="none" stroke={hot ? "#ff5a36" : "#161514"} strokeOpacity={hot ? 0.9 : 0.25} strokeWidth={hot ? 1.5 : 1} markerEnd={`url(#${hot ? "arrow-hot" : "arrow"})`} />;
                }),
              )}
            </svg>
            {rows.map((t, i) => {
              const left = x(startOf(t));
              const w = Math.max(DAY, x(t.due_date) + DAY - left);
              const blocked = blockersOf(t, tasks).length > 0 && t.status !== "done";
              const inside = w >= 56;
              return (
                <motion.button
                  key={t.id}
                  onClick={() => onOpen(t)}
                  onMouseMove={(e) => {
                    const r = scroller.current!.getBoundingClientRect();
                    setTip({ t, x: e.clientX - r.left, y: i * ROW + HEAD });
                  }}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: Math.min(i * 0.012, 0.4), duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                  style={{ left, top: i * ROW + 5, height: ROW - 10 }}
                  className="group absolute z-[2] flex items-center"
                >
                  <span
                    style={{ width: w }}
                    className={cn(
                      "flex h-full items-center overflow-hidden rounded-md border-[1.5px] border-ink px-1.5 text-left text-[11.5px] font-medium leading-none transition-transform group-hover:-translate-y-px",
                      PHASES.find((p) => p.key === t.phase)?.tone,
                      t.status === "done" && "text-ink/60 [background-image:repeating-linear-gradient(45deg,transparent_0_4px,rgba(22,21,20,.12)_4px_6px)]",
                      blocked && "border-dashed",
                      critical.has(t.id) && t.status !== "done" && "shadow-[2px_2px_0_0_#ff5a36]",
                    )}
                  >
                    {inside && <span className={cn("truncate", t.status === "done" && "line-through")}>{clean(t.title)}</span>}
                  </span>
                  {!inside && <span className={cn("ml-1.5 max-w-48 truncate whitespace-nowrap text-[11.5px]", t.status === "done" ? "text-muted-foreground line-through" : "text-ink/80")}>{clean(t.title)}</span>}
                </motion.button>
              );
            })}
          </div>
        </div>
        <AnimatePresence>
          {tip && (
            <motion.div
              key="tip"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, left: tip.x + 12, top: tip.y - 6 }}
              exit={{ opacity: 0 }}
              transition={{ type: "spring", stiffness: 500, damping: 40 }}
              className="pointer-events-none absolute z-30 w-max max-w-72 -translate-y-full rounded-lg border-[1.5px] border-ink bg-card px-2.5 py-1.5 text-xs shadow-[2px_2px_0_0_#161514]"
            >
              <p className="font-semibold">{clean(tip.t.title)}</p>
              <p className="mt-0.5 font-mono text-[10.5px] text-muted-foreground">
                {short(startOf(tip.t))} to {short(tip.t.due_date)}
                {tip.t.owner ? `  ·  ${tip.t.owner}` : ""}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ add task

function AddTask({ eventId, defaultDate }: { eventId: string; defaultDate: string }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [phase, setPhase] = useState<Phase>("planning");
  const [due, setDue] = useState(defaultDate);
  const [pending, start] = useTransition();
  const router = useRouter();
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (open) ref.current?.focus();
  }, [open]);
  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-ink px-3.5 text-sm font-medium text-white shadow-[2px_2px_0_0_#ff5a36]">
        <Plus className={cn("size-4 transition-transform", open && "rotate-45")} /> Task
      </button>
      <AnimatePresence>
        {open && (
          <motion.form
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={SPRING.snappy}
            onSubmit={(e) => {
              e.preventDefault();
              start(async () => {
                const r = await createTask(eventId, { title, phase, due_date: due });
                if (!r.ok) return void toast.error(r.error);
                setTitle("");
                setOpen(false);
                router.refresh();
              });
            }}
            className="absolute right-0 top-full z-30 mt-2 w-80 space-y-2 rounded-2xl border-[1.5px] border-ink bg-card p-3 shadow-[4px_4px_0_0_#161514]"
          >
            <input ref={ref} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What needs doing?" className="h-9 w-full rounded-lg border-[1.5px] border-ink/20 px-2.5 text-sm outline-none focus:border-ink" />
            <div className="flex gap-2">
              <select value={phase} onChange={(e) => setPhase(e.target.value as Phase)} className="h-9 flex-1 rounded-lg border-[1.5px] border-ink/20 px-2 text-sm">{PHASES.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}</select>
              <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="h-9 rounded-lg border-[1.5px] border-ink/20 px-2 text-sm" />
            </div>
            <button disabled={pending || !title.trim()} className="h-9 w-full rounded-lg bg-tomato text-sm font-semibold text-ink disabled:opacity-50">{pending ? "Adding…" : "Add task"}</button>
          </motion.form>
        )}
      </AnimatePresence>
    </div>
  );
}

// ------------------------------------------------------------------ manager

export function TaskManager({ eventId, eventDate, tasks, people, critical, today }: { eventId: string; eventDate: string; tasks: TaskItem[]; people: Person[]; critical: string[]; today: string }) {
  const [view, setView] = useState<View>("list");
  const [when, setWhen] = useState<"current" | "blocked" | "upcoming" | "past">("current");
  const [openId, setOpenId] = useState<string | null>(null);
  const [mine, setMine] = useState(false);
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("task");
    if (t) setOpenId(t);
  }, []);
  const [me, setMe] = useState<string | null>(null);
  useEffect(() => {
    try {
      const v = localStorage.getItem("ep-task-view") as View | null;
      if (v) setView(v);
    } catch {}
  }, []);
  const choose = (v: View) => {
    setView(v);
    try {
      localStorage.setItem("ep-task-view", v);
    } catch {}
  };
  const weekEnd = new Date(Date.parse(`${today}T00:00:00Z`) + 7 * 86400000).toISOString().slice(0, 10);
  const groups = useMemo(() => {
    const pool = mine && me ? tasks.filter((t) => t.owner === me) : tasks;
    const isBlocked = (t: TaskItem) => t.status !== "done" && blockersOf(t, tasks).length > 0;
    return {
      current: pool.filter((t) => t.status !== "done" && !isBlocked(t) && (t.status === "doing" || t.due_date <= weekEnd)),
      blocked: pool.filter(isBlocked),
      upcoming: pool.filter((t) => t.status !== "done" && !isBlocked(t) && t.status !== "doing" && t.due_date > weekEnd),
      past: pool.filter((t) => t.status === "done"),
    };
  }, [tasks, mine, me, weekEnd]);
  const shown = view === "timeline" ? (mine && me ? tasks.filter((t) => t.owner === me) : tasks) : groups[when];
  const open = tasks.find((t) => t.id === openId) ?? null;
  const crit = useMemo(() => new Set(critical), [critical]);
  const views: { id: View; label: string; icon: "kanban" | "list-todo" | "gantt-chart" }[] = [
    { id: "list", label: "List", icon: "list-todo" },
    { id: "board", label: "Board", icon: "kanban" },
    { id: "timeline", label: "Timeline", icon: "gantt-chart" },
  ];
  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="flex rounded-xl border-[1.5px] border-ink bg-card p-0.5">
          {views.map((v) => (
            <button key={v.id} onClick={() => choose(v.id)} className={cn("relative flex items-center gap-1.5 rounded-[9px] px-3 py-1.5 text-sm", view === v.id ? "text-white" : "text-ink/70 hover:text-ink")}>
              {view === v.id && <motion.span layoutId="task-view" className="absolute inset-0 rounded-[9px] bg-ink" transition={SPRING.default} />}
              <span className="relative flex items-center gap-1.5"><Icon name={v.icon} size={14} />{v.label}</span>
            </button>
          ))}
        </div>
        <select value={me ?? ""} onChange={(e) => { setMe(e.target.value || null); setMine(Boolean(e.target.value)); }} className="h-8 rounded-lg border-[1.5px] border-ink/20 bg-card px-2 text-sm">
          <option value="">Everyone</option>
          {people.map((p) => <option key={p.id} value={p.name}>{p.name}</option>)}
        </select>
        {view !== "timeline" && (
          <div className="flex gap-4">
            {(["current", "blocked", "upcoming", "past"] as const).map((w) => (
              <button key={w} onClick={() => setWhen(w)} className={cn("relative pb-1 text-sm capitalize", when === w ? "font-semibold" : "text-muted-foreground hover:text-ink")}>
                {w} <span className="font-mono text-xs">{groups[w].length}</span>
                {when === w && <motion.span layoutId="task-when" className="absolute inset-x-0 -bottom-0.5 h-[3px] rounded-t bg-tomato" transition={SPRING.default} />}
              </button>
            ))}
          </div>
        )}
        <div className="ml-auto"><AddTask eventId={eventId} defaultDate={eventDate} /></div>
      </div>
      {view === "board" && <Board tasks={shown} onOpen={(t) => setOpenId(t.id)} />}
      {view === "list" && <List tasks={shown} onOpen={(t) => setOpenId(t.id)} />}
      {view === "timeline" && (
        <>
          <Timeline tasks={shown} critical={crit} eventDate={eventDate} onOpen={(t) => setOpenId(t.id)} />

        </>
      )}
      <AnimatePresence>{open && <TaskEditor key={open.id} task={open} all={tasks} people={people} onClose={() => setOpenId(null)} />}</AnimatePresence>
    </div>
  );
}

/** Overview: the critical path drawn on the same timeline as the Tasks page. */
export function CriticalPathTimeline({ eventId, eventDate, tasks }: { eventId: string; eventDate: string; tasks: TaskItem[] }) {
  const router = useRouter();
  const ids = useMemo(() => new Set(tasks.map((t) => t.id)), [tasks]);
  return <Timeline tasks={tasks} critical={ids} eventDate={eventDate} onOpen={(t) => router.push(`/events/${eventId}/tasks?task=${t.id}`)} />;
}
