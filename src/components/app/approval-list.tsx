"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { decideAll } from "@/app/actions";
import { ACTION_LABEL } from "@/lib/rbac";
import { cn } from "@/lib/utils";
import { SPRING } from "@/lib/motion";
import { Pill } from "./ui";
import { Icon, Stamp, Wristband, fireConfetti, useRowIcon } from "@/components/ep/kit";
import { ACTION_ICON, ApprovalDrawer, DecisionStamp, EventChip, ago, approverTip, isLive, useDecision, when, type ApprovalItem } from "./approval-detail";

type TabId = "door" | "faculty" | "logged";
const TABS: { id: TabId; label: string }[] = [
  { id: "door", label: "At the door" },
  { id: "faculty", label: "With faculty" },
  { id: "logged", label: "Logged" },
];
const tabOf = (a: ApprovalItem): TabId => (a.status === "pending" ? "door" : a.status === "awaiting_faculty" ? "faculty" : "logged");

/** Same columns for the header and every row, so they line up. */
const COLS = "grid grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-3 md:grid-cols-[36px_minmax(0,1fr)_128px_48px_184px]";

function Row({ a, index, selected, onOpen }: { a: ApprovalItem; index: number; selected: boolean; onOpen: () => void }) {
  const { stamped, pending, act } = useDecision(a);
  const row = useRowIcon();
  const live = isLive(a);
  return (
    <motion.li
      layout
      id={a.id}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: 60 }}
      transition={{ delay: Math.min(index, 12) * 0.035, duration: 0.3 }}
      onMouseEnter={row.onMouseEnter}
      onMouseLeave={row.onMouseLeave}
      className="relative border-b-[1.5px] border-ink/10 last:border-b-0"
    >
      {selected && <motion.span layoutId="backstage-sel" className="absolute inset-y-0 left-0 w-[3px] bg-tomato" transition={SPRING.default} />}
      <DecisionStamp d={stamped} className="right-48 top-2" />
      <div
        role="button"
        tabIndex={0}
        onClick={onOpen}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onOpen();
          }
        }}
        className={cn(COLS, "group cursor-pointer px-4 py-3 outline-none transition-colors hover:bg-sand/40 focus-visible:bg-sand/40", selected && "bg-sun/15")}
      >
        <span className={cn("grid size-9 place-items-center rounded-xl border-[1.5px] border-ink transition-transform group-hover:-rotate-6", live ? "bg-sun" : "bg-background")} title={ACTION_LABEL[a.action_type]}>
          <Icon ref={row.ref} name={ACTION_ICON[a.action_type] ?? "lock"} size={16} manual />
        </span>
        <div className="min-w-0">
          <p className="flex items-center gap-1 text-[15px] font-semibold">
            <span className="truncate">{a.title}</span>
            <ChevronRight className="size-4 shrink-0 -translate-x-1 opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" />
          </p>
          <div className="mt-1 flex min-w-0 items-center gap-2">
            <EventChip id={a.event_id} title={a.event_title} className="max-w-[260px]" />
            <span className="font-mono text-[10.5px] text-muted-foreground md:hidden">{ago(a.created_at)}</span>
          </div>
        </div>
        <span className="hidden md:block" title={approverTip(a)}>
          <Wristband role={a.approver_role} size="xs" label={a.approver_department ?? undefined} />
        </span>
        <span className="hidden font-mono text-xs tabular text-muted-foreground md:block" title={when(a.created_at)}>
          {ago(a.created_at)}
        </span>
        <div className="flex items-center justify-end gap-1.5">
          {live && !stamped ? (
            <>
              <motion.button whileTap={{ scale: 0.95 }} disabled={pending} onClick={(e) => act("reject", e)} className="h-8 rounded-lg border-[1.5px] border-ink bg-card px-2.5 text-xs font-semibold transition-colors hover:bg-peach disabled:opacity-50">
                Reject
              </motion.button>
              <motion.button whileTap={{ scale: 0.95 }} whileHover={{ y: -1 }} disabled={pending} onClick={(e) => act("approve", e)} className="h-8 min-w-[84px] rounded-lg border-[1.5px] border-ink bg-tomato px-3 text-xs font-bold shadow-[2px_2px_0_0_#161514] disabled:opacity-50">
                {pending ? "…" : "Approve"}
              </motion.button>
            </>
          ) : (
            <Pill status={stamped ? (stamped === "approve" ? "approved" : "rejected") : a.status} label={!stamped && a.status === "awaiting_faculty" ? "with faculty" : undefined} />
          )}
        </div>
      </div>
    </motion.li>
  );
}

export function ApprovalList({ items }: { items: ApprovalItem[] }) {
  const groups = useMemo(() => {
    const g: Record<TabId, ApprovalItem[]> = { door: [], faculty: [], logged: [] };
    for (const i of items) g[tabOf(i)].push(i);
    return g;
  }, [items]);
  const [tab, setTab] = useState<TabId>(() => (groups.door.length ? "door" : groups.faculty.length ? "faculty" : "logged"));
  const [sel, setSel] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const rows = groups[tab];
  const mine = groups.door.filter((i) => i.canDecide);
  const cur = items.find((i) => i.id === sel) ?? null;
  const idx = cur ? rows.findIndex((r) => r.id === cur.id) : -1;

  const open = useCallback((id: string) => {
    setSel(id);
    history.replaceState(null, "", `#${id}`);
  }, []);
  const close = useCallback(() => {
    setSel(null);
    history.replaceState(null, "", window.location.pathname + window.location.search);
  }, []);

  // Deep links: /approvals#apr_xxx opens that request.
  useEffect(() => {
    const fromHash = () => {
      const h = decodeURIComponent(window.location.hash.slice(1));
      const hit = h && items.find((i) => i.id === h);
      if (!hit) return;
      setTab(tabOf(hit));
      setSel(hit.id);
      requestAnimationFrame(() => document.getElementById(hit.id)?.scrollIntoView({ block: "center", behavior: "smooth" }));
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const prev = idx > 0 ? () => open(rows[idx - 1].id) : undefined;
  const next = idx >= 0 && idx < rows.length - 1 ? () => open(rows[idx + 1].id) : undefined;

  useEffect(() => {
    if (!cur) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, [contenteditable=true]")) return;
      if (e.key === "Escape") close();
      else if ((e.key === "ArrowDown" || e.key === "j") && next) {
        e.preventDefault();
        next();
      } else if ((e.key === "ArrowUp" || e.key === "k") && prev) {
        e.preventDefault();
        prev();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cur, next, prev, close]);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3 border-b-[1.5px] border-ink">
        <div className="flex gap-6">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} className={cn("relative pb-2.5 text-sm transition-colors", tab === t.id ? "font-semibold text-ink" : "text-muted-foreground hover:text-ink")}>
              {t.label}
              <span className={cn("ml-1.5 rounded-md px-1.5 py-0.5 font-mono text-[11px]", t.id === "door" && groups.door.length ? "bg-sun text-ink" : "bg-sand/70")}>{groups[t.id].length}</span>
              {tab === t.id && <motion.span layoutId="backstage-tab" className="absolute inset-x-0 -bottom-[1.5px] h-[3px] rounded-t bg-tomato" transition={SPRING.default} />}
            </button>
          ))}
        </div>
        {tab === "door" && mine.length > 1 && (
          <motion.button
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            whileTap={{ scale: 0.97 }}
            whileHover={{ y: -1 }}
            disabled={pending}
            onClick={(e) => {
              const { clientX, clientY } = e;
              start(async () => {
                const r = await decideAll(mine.map((m) => m.id));
                if (r.ok) {
                  fireConfetti(clientX, clientY);
                  toast.success(r.message ?? "Approved");
                } else toast.error(r.error);
                router.refresh();
              });
            }}
            className="mb-2 inline-flex h-9 items-center gap-2 rounded-xl border-[1.5px] border-ink bg-tomato px-3.5 text-xs font-bold shadow-[2px_2px_0_0_#161514]"
          >
            {pending ? "Stamping…" : `Approve all ${mine.length}`}
          </motion.button>
        )}
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border-[1.5px] border-ink bg-card">
        <div className={cn(COLS, "hidden border-b-[1.5px] border-ink bg-background/60 px-4 py-2 md:grid")}>
          <span />
          <span className="mono-label text-[10px] text-muted-foreground">Task</span>
          <span className="mono-label text-[10px] text-muted-foreground">Needs</span>
          <span className="mono-label text-[10px] text-muted-foreground">Age</span>
          <span />
        </div>
        {rows.length ? (
          <ul key={tab}>
            <AnimatePresence>
              {rows.map((a, i) => (
                <Row key={a.id} a={a} index={i} selected={sel === a.id} onOpen={() => open(a.id)} />
              ))}
            </AnimatePresence>
          </ul>
        ) : (
          <div className="grid place-items-center py-14">
            <Stamp tone="green" className="text-base">All clear</Stamp>
          </div>
        )}
      </div>

      <ApprovalDrawer item={cur} onClose={close} onPrev={prev} onNext={next} pos={idx >= 0 ? `${idx + 1}/${rows.length}` : undefined} />
    </div>
  );
}
