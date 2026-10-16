"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { ArrowUpRight, ChevronDown, ChevronUp, Lock, Maximize2, Minimize2, X } from "lucide-react";
import { toast } from "sonner";
import { decide, facultyDecide } from "@/app/actions";
import { ACTION_LABEL } from "@/lib/rbac";
import { ROLE_LABEL, type ActionType, type ApprovalRequest } from "@/lib/types";
import { cn } from "@/lib/utils";
import { SPRING } from "@/lib/motion";
import { Pill } from "./ui";
import { Icon, Stamp, Wristband, fireConfetti } from "@/components/ep/kit";
import type { IconName } from "@/components/ep/icons";

export type ApprovalItem = ApprovalRequest & {
  requester: string | null;
  decider: string | null;
  event_title: string | null;
  vendor_name: string | null;
  speaker_name: string | null;
  reason: string | null;
  canDecide: boolean;
  canFaculty: boolean;
  preview: string | null;
};

export const ACTION_ICON: Record<ActionType, IconName> = {
  "email.speaker": "mail",
  "email.sponsor": "handshake",
  "email.vendor": "mail",
  "email.faculty": "landmark",
  "publish.luma": "rocket",
  "publish.meetup": "rocket",
  "publish.social": "megaphone",
  "budget.approve": "wallet",
  "calendar.push": "calendar-plus",
  "payment.deposit": "credit-card",
  "speaker.confirm": "user-check",
};

/** Compact age: now, 5m, 3h, 2d. */
export const ago = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  return m < 1 ? "now" : m < 60 ? `${m}m` : m < 1440 ? `${Math.floor(m / 60)}h` : `${Math.floor(m / 1440)}d`;
};

export const when = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kuala_Lumpur" });

const DOTS = ["#ff5a36", "#3b6cf6", "#ffd84d", "#46a758", "#c084fc", "#f59e0b"];
export const eventDot = (id: string) => DOTS[[...id].reduce((n, c) => n + c.charCodeAt(0), 0) % DOTS.length];

export const isLive = (a: ApprovalItem) => a.canDecide || a.canFaculty;

export const approverTip = (a: Pick<ApprovalRequest, "approver_role" | "approver_department">) =>
  `${ROLE_LABEL[a.approver_role]}${a.approver_department ? `, ${a.approver_department}` : ""}`;

export function EventChip({ id, title, link, className }: { id: string | null; title: string | null; link?: boolean; className?: string }) {
  if (!id || !title) return null;
  const body = (
    <>
      <span className="size-2 shrink-0 rounded-full border border-ink" style={{ background: eventDot(id) }} />
      <span className="truncate">{title}</span>
      {link && <ArrowUpRight className="size-3 shrink-0 -translate-x-0.5 opacity-0 transition-all group-hover/chip:translate-x-0 group-hover/chip:opacity-100" />}
    </>
  );
  const cls = cn("group/chip inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-full border-[1.5px] border-ink/15 bg-background px-2 py-0.5 text-[11px] font-medium", className);
  return link ? (
    <Link href={`/events/${id}`} onClick={(e) => e.stopPropagation()} className={cn(cls, "transition-colors hover:border-ink")}>
      {body}
    </Link>
  ) : (
    <span className={cls}>{body}</span>
  );
}

/** Approve / reject with the stamp + confetti moment. Shared by the row and the drawer. */
export function useDecision(a: ApprovalItem) {
  const [note, setNote] = useState("");
  const [stamped, setStamped] = useState<null | "approve" | "reject">(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const act = (d: "approve" | "reject", e: React.MouseEvent) => {
    e.stopPropagation();
    const { clientX, clientY } = e;
    start(async () => {
      const r = a.canFaculty ? await facultyDecide(a.id, "", d, note || undefined) : await decide(a.id, d, note || undefined);
      if (r.ok) {
        setStamped(d);
        if (d === "approve") fireConfetti(clientX, clientY);
        toast.success(r.message ?? "Done");
        setTimeout(() => router.refresh(), 900);
      } else toast.error(r.error);
    });
  };
  return { note, setNote, stamped, pending, act };
}

export function DecisionStamp({ d, className }: { d: "approve" | "reject" | null; className?: string }) {
  return (
    <AnimatePresence>
      {d && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={cn("pointer-events-none absolute z-10", className)}>
          <Stamp animate tone={d === "approve" ? "green" : "tomato"} className="text-lg">
            {d === "approve" ? "Approved" : "Rejected"}
          </Stamp>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ------------------------------------------------------------------ what will happen

const num = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" && v.trim() && !Number.isNaN(Number(v)) ? Number(v) : null);
const rm = (n: number) => `RM${n.toLocaleString("en-MY", { maximumFractionDigits: 2 })}`;

function Fact({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[72px_minmax(0,1fr)] items-baseline gap-3 py-1.5">
      <dt className="mono-label text-[10px] text-muted-foreground">{k}</dt>
      <dd className="min-w-0 break-words text-sm">{children}</dd>
    </div>
  );
}

function Big({ value, sub, tone = "bg-sun" }: { value: React.ReactNode; sub?: React.ReactNode; tone?: string }) {
  return (
    <div className="flex items-center gap-4">
      <motion.span
        initial={{ scale: 0.9, rotate: -3, opacity: 0 }}
        animate={{ scale: 1, rotate: -2, opacity: 1 }}
        transition={SPRING.bouncy}
        className={cn("rounded-xl border-[1.5px] border-ink px-3.5 py-2 font-display text-3xl font-bold tabular shadow-[2px_2px_0_0_#161514]", tone)}
      >
        {value}
      </motion.span>
      {sub && <span className="min-w-0 text-sm font-semibold">{sub}</span>}
    </div>
  );
}

function EmailPreview({ a }: { a: ApprovalItem }) {
  const [big, setBig] = useState(false);
  const p = a.payload;
  return (
    <div>
      <dl className="divide-y divide-ink/10">
        <Fact k="To">{String(p.to ?? "")}</Fact>
        <Fact k="Subject">{String(p.subject ?? "")}</Fact>
      </dl>
      {a.preview && (
        <div className="group/prev relative mt-3">
          <iframe title="Email preview" sandbox="" srcDoc={a.preview} className={cn("w-full rounded-xl border-[1.5px] border-ink bg-white transition-[height] duration-300", big ? "h-[62vh]" : "h-60")} />
          <button
            onClick={() => setBig((b) => !b)}
            title={big ? "Shrink" : "Expand"}
            className="absolute right-2 top-2 grid size-8 place-items-center rounded-lg border-[1.5px] border-ink bg-card opacity-0 shadow-[2px_2px_0_0_#161514] transition-opacity group-hover/prev:opacity-100 focus-visible:opacity-100"
          >
            {big ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
          </button>
        </div>
      )}
    </div>
  );
}

function WhatHappens({ a }: { a: ApprovalItem }) {
  const p = a.payload;
  const amount = num(p.amount);
  switch (a.action_type) {
    case "email.speaker":
    case "email.vendor":
    case "email.faculty":
      return <EmailPreview a={a} />;
    case "payment.deposit":
      return <Big value={amount != null ? rm(amount) : "Deposit"} sub={a.vendor_name?.split(" — ")[0] ?? "Vendor"} tone="bg-peach" />;
    case "budget.approve":
      return <Big value={amount != null ? rm(amount) : "Budget"} sub={a.event_title} tone="bg-sun" />;
    case "publish.luma":
    case "publish.meetup":
      return <Big value={a.action_type === "publish.luma" ? "Luma" : "Meetup"} sub={a.event_title} tone="bg-sky" />;
    case "publish.social": {
      const n = Array.isArray(p.creative_ids) ? p.creative_ids.length : 0;
      return (
        <div className="flex items-center justify-between gap-3">
          <Big value={n} sub="creatives" tone="bg-mint" />
          {a.event_id && (
            <Link href={`/events/${a.event_id}/promotion`} className="inline-flex items-center gap-1 text-xs font-semibold text-tomato-ink hover:underline">
              View <ArrowUpRight className="size-3" />
            </Link>
          )}
        </div>
      );
    }
    case "calendar.push":
      return <Big value={<Icon name="calendar-plus" size={26} />} sub="Team calendar" tone="bg-sky" />;
    case "speaker.confirm":
      return <Big value={<Icon name="user-check" size={26} />} sub={a.speaker_name ?? "Speaker"} tone="bg-mint" />;
    default:
      return null;
  }
}

// ------------------------------------------------------------------ timeline

type StepState = "done" | "now" | "todo" | "bad";
type Step = { key: string; label: string; state: StepState; who?: React.ReactNode; at?: string | null; extra?: React.ReactNode };

function ResultBits({ a }: { a: ApprovalItem }) {
  const r = (a.result ?? {}) as Record<string, unknown>;
  const bits: React.ReactNode[] = [];
  if (r.to) {
    const redirected = r.intended_to && r.intended_to !== r.to;
    bits.push(
      <span key="to" title={redirected ? `Meant for ${String(r.intended_to)}` : undefined}>
        to <b>{String(r.to)}</b>
        {r.provider ? <span className="text-muted-foreground"> via {String(r.provider)}</span> : null}
      </span>,
    );
  }
  if (r.url) bits.push(<a key="url" href={String(r.url)} target="_blank" className="inline-flex items-center gap-0.5 font-semibold text-tomato-ink hover:underline">Open page <ArrowUpRight className="size-3" /></a>);
  if (r.checkout_url) bits.push(<a key="co" href={String(r.checkout_url)} target="_blank" className="inline-flex items-center gap-0.5 font-semibold text-tomato-ink hover:underline">Checkout <ArrowUpRight className="size-3" /></a>);
  if (r.approved_budget) bits.push(<span key="b">Budget <b>{rm(Number(r.approved_budget))}</b></span>);
  if (r.approved_creatives) bits.push(<span key="c"><b>{String(r.approved_creatives)}</b> cleared</span>);
  return bits.length ? <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs">{bits}</div> : null;
}

function steps(a: ApprovalItem): Step[] {
  const r = (a.result ?? {}) as Record<string, unknown>;
  const facultyDecision = r.faculty_decision as string | undefined;
  const out: Step[] = [{ key: "req", label: "Requested", state: "done", who: a.requester ?? "Agent", at: a.created_at }];
  const rejectedAtDoor = a.status === "rejected" && !facultyDecision;
  if (a.status === "pending") {
    out.push({ key: "door", label: "At the door", state: "now", who: <Wristband role={a.approver_role} size="xs" label={a.approver_department ?? undefined} /> });
  } else {
    out.push({
      key: "door",
      label: rejectedAtDoor ? "Rejected" : "Approved",
      state: rejectedAtDoor ? "bad" : "done",
      who: a.decider,
      at: a.decided_at,
      extra: a.decision_note ? <p className="mt-1 rounded-lg bg-sand/60 px-2 py-1 text-xs italic">&ldquo;{a.decision_note}&rdquo;</p> : null,
    });
  }
  if (rejectedAtDoor) return out;
  const email = a.action_type.startsWith("email");
  if (a.status === "failed") out.push({ key: "run", label: "Failed", state: "bad", extra: <p className="mt-1 text-xs text-tomato-ink">{String(r.error ?? "Unknown error")}</p> });
  else if (a.status === "pending") out.push({ key: "run", label: email ? "Sent" : "Done", state: "todo" });
  else out.push({ key: "run", label: email ? "Sent" : "Done", state: "done", at: a.decided_at, extra: <ResultBits a={a} /> });
  if (a.action_type === "email.faculty" && a.status !== "failed") {
    if (facultyDecision) {
      out.push({
        key: "fac",
        label: facultyDecision === "approve" ? "Faculty approved" : "Faculty rejected",
        state: facultyDecision === "approve" ? "done" : "bad",
        who: <Wristband role="faculty_advisor" size="xs" />,
        at: (r.faculty_decided_at as string) ?? null,
        extra: r.faculty_note ? <p className="mt-1 rounded-lg bg-sand/60 px-2 py-1 text-xs italic">&ldquo;{String(r.faculty_note)}&rdquo;</p> : null,
      });
    } else out.push({ key: "fac", label: "Faculty", state: a.status === "awaiting_faculty" ? "now" : "todo", who: <Wristband role="faculty_advisor" size="xs" /> });
  }
  return out;
}

const DOT: Record<StepState, string> = {
  done: "bg-mint border-ink",
  now: "bg-sun border-ink",
  todo: "bg-card border-ink/30 border-dashed",
  bad: "bg-tomato border-ink",
};

function Timeline({ a }: { a: ApprovalItem }) {
  const list = steps(a);
  return (
    <ol className="relative">
      {list.map((s, i) => (
        <motion.li key={s.key} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.08 + i * 0.06 }} className="relative grid grid-cols-[20px_minmax(0,1fr)] gap-3 pb-4 last:pb-0">
          {i < list.length - 1 && <span aria-hidden className={cn("absolute left-[9px] top-5 bottom-0 w-[1.5px]", s.state === "done" ? "bg-ink" : "bg-ink/15")} />}
          <span className={cn("relative mt-0.5 grid size-5 place-items-center rounded-full border-[1.5px]", DOT[s.state])}>
            {s.state === "now" && <span className="absolute inset-0 animate-ping rounded-full bg-sun opacity-60" />}
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className={cn("text-sm font-semibold", s.state === "todo" && "text-muted-foreground")}>{s.label}</span>
              {s.who && <span className="text-xs text-ink/70">{s.who}</span>}
              {s.at && <span className="ml-auto font-mono text-[10.5px] text-muted-foreground">{when(s.at)}</span>}
            </div>
            {s.extra}
          </div>
        </motion.li>
      ))}
    </ol>
  );
}

// ------------------------------------------------------------------ drawer

function Section({ label, children, delay = 0 }: { label: string; children: React.ReactNode; delay?: number }) {
  return (
    <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay, duration: 0.3, ease: [0.16, 1, 0.3, 1] }} className="rounded-xl border-[1.5px] border-ink bg-card p-4">
      <h3 className="mono-label mb-3 text-[10px] text-muted-foreground">{label}</h3>
      {children}
    </motion.section>
  );
}

function Detail({ a }: { a: ApprovalItem }) {
  const { note, setNote, stamped, pending, act } = useDecision(a);
  const live = isLive(a);
  return (
    <>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-5 scrollbar-thin">
        <div className="relative">
          <DecisionStamp d={stamped} className="right-2 top-0" />
          <div className="flex items-center gap-2">
            <span className={cn("grid size-9 place-items-center rounded-xl border-[1.5px] border-ink", live ? "bg-sun" : "bg-card")}>
              <Icon name={ACTION_ICON[a.action_type] ?? "lock"} size={16} />
            </span>
            <span className="mono-label text-[10px] text-muted-foreground">{ACTION_LABEL[a.action_type]}</span>
            <Pill status={a.status} label={a.status === "awaiting_faculty" ? "with faculty" : undefined} />
          </div>
          <h2 className="mt-3 font-display text-2xl font-bold leading-tight tracking-tight">{a.title}</h2>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <EventChip id={a.event_id} title={a.event_title} link />
          </div>
        </div>

        <Section label="What happens" delay={0.04}>
          <WhatHappens a={a} />
        </Section>

        <Section label="Who" delay={0.08}>
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <span className="grid size-8 shrink-0 place-items-center rounded-full border-[1.5px] border-ink bg-sand font-display text-sm font-bold">{(a.requester ?? "A").slice(0, 1)}</span>
              <span className="truncate text-sm font-semibold">{a.requester ?? "Agent"}</span>
            </div>
            <motion.span aria-hidden animate={{ x: [0, 3, 0] }} transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }} className="font-mono text-muted-foreground">
              →
            </motion.span>
            <span className="flex justify-end" title={approverTip(a)}>
              <Wristband role={a.approver_role} size="sm" label={a.approver_department ?? undefined} />
            </span>
          </div>
          <p className="mt-3 flex items-start gap-2 border-t border-ink/10 pt-3 text-xs text-ink/75">
            <Lock className="mt-px size-3.5 shrink-0" />
            <span>{a.reason ?? `Needs ${approverTip(a)}`}</span>
          </p>
        </Section>

        <Section label="Timeline" delay={0.12}>
          <Timeline a={a} />
        </Section>
      </div>

      {live && (
        <div className="border-t-[1.5px] border-ink bg-card p-4">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note (optional)"
            className="h-9 w-full rounded-lg border-[1.5px] border-ink/15 bg-background px-3 text-sm outline-none transition-colors focus:border-ink"
          />
          <div className="mt-2.5 grid grid-cols-[1fr_2fr] gap-2">
            <motion.button whileTap={{ scale: 0.96 }} disabled={pending} onClick={(e) => act("reject", e)} className="h-11 rounded-xl border-[1.5px] border-ink bg-card text-sm font-semibold transition-colors hover:bg-peach disabled:opacity-50">
              Reject
            </motion.button>
            <motion.button whileTap={{ scale: 0.96 }} whileHover={{ y: -1 }} disabled={pending} onClick={(e) => act("approve", e)} className="h-11 rounded-xl border-[1.5px] border-ink bg-tomato text-sm font-bold shadow-[2px_2px_0_0_#161514] transition-shadow hover:shadow-[3px_3px_0_0_#161514] disabled:opacity-50">
              {pending ? "Stamping…" : a.action_type.startsWith("email") ? "Approve & send" : "Approve"}
            </motion.button>
          </div>
        </div>
      )}
    </>
  );
}

export function ApprovalDrawer({ item, onClose, onPrev, onNext, pos }: { item: ApprovalItem | null; onClose: () => void; onPrev?: () => void; onNext?: () => void; pos?: string }) {
  return (
    <AnimatePresence>
      {item && (
        <>
          <motion.div key="scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="fixed inset-0 z-40 bg-ink/25 backdrop-blur-[1px]" />
          <motion.aside
            key="drawer"
            role="dialog"
            aria-label={item.title}
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={SPRING.soft}
            className="fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l-[1.5px] border-ink bg-background shadow-[-8px_0_0_0_rgba(22,21,20,.08)] sm:w-[480px]"
          >
            <div className="flex items-center gap-1 border-b-[1.5px] border-ink px-3 py-2">
              <button onClick={onPrev} disabled={!onPrev} title="Previous (↑)" className="grid size-8 place-items-center rounded-lg transition-colors hover:bg-sand disabled:opacity-30">
                <ChevronUp className="size-4" />
              </button>
              <button onClick={onNext} disabled={!onNext} title="Next (↓)" className="grid size-8 place-items-center rounded-lg transition-colors hover:bg-sand disabled:opacity-30">
                <ChevronDown className="size-4" />
              </button>
              {pos && <span className="ml-1 font-mono text-[11px] text-muted-foreground">{pos}</span>}
              <button onClick={onClose} title="Close (Esc)" className="ml-auto grid size-8 place-items-center rounded-lg transition-all hover:rotate-90 hover:bg-sand">
                <X className="size-4" />
              </button>
            </div>
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.div key={item.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }} className="flex min-h-0 flex-1 flex-col">
                <Detail a={item} />
              </motion.div>
            </AnimatePresence>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
