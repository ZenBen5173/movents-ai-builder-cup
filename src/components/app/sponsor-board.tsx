"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { ArrowUpRight, Check, FileText, HandCoins, Hourglass, Loader2, Mail, Plus, Reply, Search, Send, ThumbsDown } from "lucide-react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { ActionButton } from "@/components/app/action-button";
import { StageEmpty, fireConfetti } from "@/components/ep/kit";
import { SPRING } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { acceptSponsor, addSponsor, declineSponsor, findSponsorsAction, markSponsorReplied, sendSponsorEmail } from "@/app/actions-sponsors";
import type { SponsorStatus } from "@/lib/types";

export type SponsorRow = {
  id: string;
  company: string;
  industry: string | null;
  website: string | null;
  logo_url: string | null;
  contact_name: string | null;
  contact_email: string | null;
  ask: string | null;
  status: SponsorStatus;
  offer_type: "cash" | "in_kind" | null;
  offer_amount: number | null;
  offer: string | null;
  offer_note: string | null;
  notes: string | null;
  fit_reason: string | null;
  contacted_at: string | null;
  opened_at: string | null;
  replied_at: string | null;
  decided_at: string | null;
  pending: boolean;
  draft: { to: string; subject: string; body: string };
};

const rm = (n: number) => `RM${Math.round(n).toLocaleString("en-MY")}`;
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Asia/Kuala_Lumpur" }) : "");
const initials = (n: string) =>
  n
    .replace(/\b(sdn|bhd|berhad|co|malaysia)\b\.?/gi, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
const BUBBLE = ["bg-sun", "bg-sky", "bg-mint", "bg-peach", "bg-sand", "bg-tomato-soft"];
const bubbleOf = (n: string) => BUBBLE[[...n].reduce((s, c) => s + c.charCodeAt(0), 0) % BUBBLE.length];

function Logo({ s, size = "md" }: { s: Pick<SponsorRow, "company" | "logo_url">; size?: "sm" | "md" }) {
  const box = size === "sm" ? "size-8 text-[11px]" : "size-10 text-xs";
  if (s.logo_url) return <img src={s.logo_url} alt="" className={cn(box, "shrink-0 rounded-full border-[1.5px] border-ink bg-card object-cover")} />;
  return <span className={cn(box, bubbleOf(s.company), "grid shrink-0 place-items-center rounded-full border-[1.5px] border-ink font-mono font-bold transition-transform duration-300 group-hover:-rotate-12 group-hover:scale-105")}>{initials(s.company)}</span>;
}

// ------------------------------------------------------------------ overview

const FUNNEL: { key: SponsorStatus; label: string; color: string }[] = [
  { key: "found", label: "Not contacted", color: "#ece7dc" },
  { key: "contacted", label: "Contacted", color: "#cfe3ff" },
  { key: "opened", label: "Opened", color: "#3d6cf5" },
  { key: "replied", label: "Replied", color: "#ffd84d" },
  { key: "accepted", label: "Accepted", color: "#46a758" },
  { key: "declined", label: "Declined", color: "#ff5a36" },
];

function Donut({ counts, cash, inKind }: { counts: Record<SponsorStatus, number>; cash: number; inKind: number }) {
  const [hover, setHover] = useState<SponsorStatus | null>(null);
  const R = 70;
  const C = 2 * Math.PI * R;
  const total = FUNNEL.reduce((n, f) => n + counts[f.key], 0);
  let acc = 0;
  const active = FUNNEL.find((f) => f.key === hover);
  return (
    <div className="flex flex-wrap items-center gap-6">
      <div className="relative size-[190px] shrink-0">
        <svg viewBox="0 0 180 180" className="size-full -rotate-90">
          <circle cx="90" cy="90" r={R} fill="none" stroke="#161514" strokeOpacity=".07" strokeWidth="26" />
          {FUNNEL.map((f, i) => {
            const len = total ? (counts[f.key] / total) * C : 0;
            const off = acc;
            acc += len;
            if (!len) return null;
            return (
              <motion.circle
                key={f.key}
                cx="90"
                cy="90"
                r={R}
                fill="none"
                stroke={f.color}
                strokeWidth={hover === f.key ? 33 : 26}
                strokeDasharray={`${len} ${C - len}`}
                initial={{ strokeDashoffset: C }}
                animate={{ strokeDashoffset: -off }}
                transition={{ duration: 0.9, delay: i * 0.08, ease: [0.16, 1, 0.3, 1] }}
                onMouseEnter={() => setHover(f.key)}
                onMouseLeave={() => setHover(null)}
                className="cursor-pointer transition-[stroke-width] duration-200"
              />
            );
          })}
        </svg>
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          <AnimatePresence mode="wait">
            <motion.div key={active?.key ?? "c"} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.15 }}>
              {active ? (
                <>
                  <p className="font-display text-4xl font-bold leading-none">{counts[active.key]}</p>
                  <p className="mono-label mt-1 text-[9.5px] text-muted-foreground">{active.label}</p>
                </>
              ) : (
                <>
                  <p className="font-display text-2xl font-bold leading-none">{rm(cash)}</p>
                  <p className="mono-label mt-1 text-[9.5px] text-muted-foreground">{inKind ? `+ ${inKind} in-kind` : "confirmed"}</p>
                </>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
      <ul className="min-w-0 space-y-1.5">
        {FUNNEL.map((f, i) => (
          <motion.li
            key={f.key}
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 + i * 0.05 }}
            onMouseEnter={() => setHover(f.key)}
            onMouseLeave={() => setHover(null)}
            className={cn("flex cursor-default items-center gap-2 text-xs transition-all", hover && hover !== f.key && "opacity-40", hover === f.key && "translate-x-0.5")}
          >
            <span className="size-3 shrink-0 rounded-sm border border-ink" style={{ background: f.color }} />
            <span className="w-24 whitespace-nowrap">{f.label}</span>
            <span className="font-mono font-bold tabular">{counts[f.key]}</span>
          </motion.li>
        ))}
      </ul>
    </div>
  );
}

export function SponsorOverview({ rows }: { rows: SponsorRow[] }) {
  const counts = useMemo(() => {
    const c = { found: 0, contacted: 0, opened: 0, replied: 0, accepted: 0, declined: 0 } as Record<SponsorStatus, number>;
    for (const r of rows) c[r.status] += 1;
    return c;
  }, [rows]);
  const offers = rows.filter((r) => r.status === "accepted");
  const cash = offers.filter((r) => r.offer_type !== "in_kind").reduce((n, r) => n + (r.offer_amount ?? 0), 0);
  const inKind = offers.filter((r) => r.offer_type === "in_kind").length;
  return (
    <div className="grid gap-8 rounded-xl border-[1.5px] border-ink bg-card p-5 shadow-[3px_3px_0_0_rgba(22,21,20,.08)] lg:grid-cols-[auto_1fr]">
      <Donut counts={counts} cash={cash} inKind={inKind} />
      <div className="min-w-0 lg:border-l lg:border-border lg:pl-8">
        <p className="mono-label mb-3 flex items-center gap-2 text-[10px] text-muted-foreground">
          <HandCoins className="size-3.5" /> Offers <span className="font-mono text-ink">{offers.length}</span>
        </p>
        {offers.length === 0 ? (
          <div className="grid h-28 place-items-center rounded-lg border-[1.5px] border-dashed border-ink/25 text-sm text-muted-foreground">None yet</div>
        ) : (
          <ul className="space-y-2">
            {offers.map((s, i) => (
              <motion.li
                key={s.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 + i * 0.06, duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                whileHover={{ y: -2 }}
                className="group relative flex items-center gap-3 rounded-lg border-[1.5px] border-transparent px-2 py-1.5 transition-colors hover:border-ink hover:bg-sand/40 hover:shadow-[2px_2px_0_0_#161514]"
              >
                <Logo s={s} size="sm" />
                <span className="min-w-0 flex-1 truncate font-semibold">{s.company}</span>
                <span className={cn("shrink-0 rounded-full border-[1.5px] border-ink px-2.5 py-0.5 text-xs font-semibold", s.offer_type === "in_kind" ? "bg-peach" : "bg-mint")}>{s.offer}</span>
                {(s.notes || (s.offer_type !== "in_kind" && s.offer_note)) && (
                  <span className="pointer-events-none absolute right-2 top-full z-30 mt-1 w-max max-w-72 translate-y-1 rounded-lg border-[1.5px] border-ink bg-card px-2.5 py-1.5 text-xs opacity-0 shadow-[2px_2px_0_0_#161514] transition-all group-hover:translate-y-0 group-hover:opacity-100">
                    {[s.offer_type !== "in_kind" ? s.offer_note : null, s.notes].filter(Boolean).join(". ")}
                  </span>
                )}
              </motion.li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ pipeline

const FILTERS = [
  { key: "all", label: "All", match: () => true },
  { key: "found", label: "Not contacted", match: (s: SponsorStatus) => s === "found" },
  { key: "waiting", label: "Waiting", match: (s: SponsorStatus) => s === "contacted" || s === "opened" || s === "replied" },
  { key: "accepted", label: "Accepted", match: (s: SponsorStatus) => s === "accepted" },
  { key: "declined", label: "Declined", match: (s: SponsorStatus) => s === "declined" },
] as const;

const RANK: Record<SponsorStatus, number> = { replied: 0, opened: 1, contacted: 2, found: 3, accepted: 4, declined: 5 };

const input = "h-8 min-w-0 rounded-lg border-[1.5px] border-ink/20 bg-card px-2.5 text-sm outline-none transition-colors focus:border-ink";
const iconBtn = "grid size-8 place-items-center rounded-lg border-[1.5px] border-ink/20 text-muted-foreground transition-all hover:-translate-y-0.5 hover:border-ink hover:text-ink hover:shadow-[2px_2px_0_0_#161514] active:translate-y-0 disabled:opacity-40";

export function SponsorPipeline({ eventId, rows, gated }: { eventId: string; rows: SponsorRow[]; gated: boolean }) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("all");
  const [adding, setAdding] = useState(false);
  const [compose, setCompose] = useState<SponsorRow | null>(null);
  const [accepting, setAccepting] = useState<string | null>(null);
  const counts = Object.fromEntries(FILTERS.map((f) => [f.key, rows.filter((r) => f.match(r.status)).length]));
  const shown = rows.filter((r) => FILTERS.find((f) => f.key === filter)!.match(r.status)).sort((a, b) => RANK[a.status] - RANK[b.status] || a.company.localeCompare(b.company));

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-4">
          {FILTERS.map((f) => (
            <button key={f.key} onClick={() => setFilter(f.key)} className={cn("relative pb-1 text-sm transition-colors", filter === f.key ? "font-semibold" : "text-muted-foreground hover:text-ink")}>
              {f.label} <span className="font-mono text-xs">{counts[f.key]}</span>
              {filter === f.key && <motion.span layoutId="sponsor-filter" className="absolute inset-x-0 -bottom-0.5 h-[3px] rounded-t bg-tomato" transition={SPRING.default} />}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <ActionButton action={findSponsorsAction.bind(null, eventId)} size="xs" icon={<Search className="size-3.5" />} className="border-[1.5px] border-ink bg-sun px-2.5 font-semibold text-ink shadow-[2px_2px_0_0_#161514] transition-transform hover:-translate-y-0.5 hover:bg-sun">
            Find sponsors
          </ActionButton>
          <button onClick={() => setAdding((o) => !o)} className={cn("inline-flex h-7 items-center gap-1 rounded-lg border-[1.5px] border-ink px-2.5 text-xs font-semibold transition-all hover:-translate-y-0.5", adding ? "bg-ink text-white" : "bg-card shadow-[2px_2px_0_0_#161514]")}>
            <Plus className={cn("size-3.5 transition-transform", adding && "rotate-45")} /> Sponsor
          </button>
        </div>
      </div>

      <AnimatePresence initial={false}>{adding && <AddSponsor eventId={eventId} onDone={() => setAdding(false)} />}</AnimatePresence>

      <div className="rounded-xl border-[1.5px] border-ink bg-card shadow-[3px_3px_0_0_rgba(22,21,20,.08)]">
        {rows.length === 0 ? (
          <div className="p-6">
            <StageEmpty title="No sponsors yet" action={<ActionButton action={findSponsorsAction.bind(null, eventId)} size="sm" icon={<Search className="size-3.5" />}>Find sponsors</ActionButton>} />
          </div>
        ) : shown.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">Nothing here</p>
        ) : (
          <ul>
            <AnimatePresence initial={false}>
              {shown.map((s, i) => (
                <motion.li
                  key={s.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0, transition: { delay: Math.min(i, 10) * 0.035, duration: 0.3, ease: [0.16, 1, 0.3, 1] } }}
                  exit={{ opacity: 0, transition: { duration: 0.12 } }}
                  className="border-b border-border last:border-b-0"
                >
                  <Row s={s} onEmail={() => setCompose(s)} accepting={accepting === s.id} onAccept={() => setAccepting(accepting === s.id ? null : s.id)} />
                  <AnimatePresence initial={false}>{accepting === s.id && <AcceptForm s={s} onDone={() => setAccepting(null)} />}</AnimatePresence>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}
      </div>

      <Composer eventId={eventId} s={compose} gated={gated} onClose={() => setCompose(null)} />
    </div>
  );
}

const STEPS = [
  { key: "C", label: "Contacted", at: (s: SponsorRow) => s.contacted_at, on: (s: SponsorRow) => !!s.contacted_at || s.status !== "found" },
  { key: "O", label: "Opened", at: (s: SponsorRow) => s.opened_at, on: (s: SponsorRow) => !!s.opened_at || ["opened", "replied", "accepted"].includes(s.status) },
  { key: "R", label: "Replied", at: (s: SponsorRow) => s.replied_at, on: (s: SponsorRow) => !!s.replied_at || ["replied", "accepted"].includes(s.status) },
] as const;

function Track({ s }: { s: SponsorRow }) {
  const decided = s.status === "accepted" || s.status === "declined";
  return (
    <ol className="flex items-center">
      {STEPS.map((st, i) => {
        const on = st.on(s);
        return (
          <li key={st.key} className="flex items-center">
            {i > 0 && <span className={cn("h-[2px] w-4", on ? "bg-ink" : "bg-ink/15")} />}
            <span title={on ? `${st.label}${st.at(s) ? ` ${day(st.at(s))}` : ""}` : `Not ${st.label.toLowerCase()} yet`} className={cn("grid size-7 place-items-center rounded-full border-[1.5px] font-mono text-[10px] font-bold transition-transform hover:scale-110", on ? "border-ink bg-sky" : "border-dashed border-ink/30 text-muted-foreground")}>
              {st.key}
            </span>
          </li>
        );
      })}
      <li className="flex items-center">
        <span className={cn("h-[2px] w-4", decided ? "bg-ink" : "bg-ink/15")} />
        <span
          title={decided ? `${s.status === "accepted" ? "Accepted" : "Declined"} ${day(s.decided_at)}` : "No decision yet"}
          className={cn("grid size-7 place-items-center rounded-full border-[1.5px] font-mono text-[10px] font-bold transition-transform hover:scale-110", s.status === "accepted" ? "border-ink bg-mint" : s.status === "declined" ? "border-ink bg-peach" : "border-dashed border-ink/30 text-muted-foreground")}
        >
          {s.status === "accepted" ? <Check className="size-3.5" /> : s.status === "declined" ? <ThumbsDown className="size-3" /> : "D"}
        </span>
      </li>
    </ol>
  );
}

function Row({ s, onEmail, accepting, onAccept }: { s: SponsorRow; onEmail: () => void; accepting: boolean; onAccept: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [, start] = useTransition();
  const router = useRouter();
  const run = (key: string, fn: () => Promise<{ ok: true; message?: string } | { ok: false; error: string }>) => {
    setBusy(key);
    start(async () => {
      const r = await fn();
      if (r.ok) toast.success(r.message ?? "Saved");
      else toast.error(r.error);
      setBusy(null);
      router.refresh();
    });
  };
  const contact = [s.contact_name, s.contact_email].filter(Boolean).join(" · ");
  return (
    <div className={cn("group flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 transition-colors hover:bg-sand/30", s.status === "declined" && "opacity-60 hover:opacity-100")}>
      <Logo s={s} />
      <div className="relative min-w-[180px] flex-1">
        <span className="flex items-center gap-2">
          <a href={s.website ?? undefined} target="_blank" rel="noreferrer" className="group/name inline-flex min-w-0 items-center gap-1 font-semibold transition-colors hover:text-tomato-ink">
            <span className="truncate">{s.company}</span>
            {s.website && <ArrowUpRight className="size-3.5 shrink-0 opacity-0 transition-opacity group-hover/name:opacity-100" />}
          </a>
          {s.industry && <span className="mono-label shrink-0 rounded-full border border-ink/25 bg-sand/60 px-2 py-0.5 text-[9.5px]">{s.industry}</span>}
        </span>
        {(contact || s.fit_reason) && (
          <span className="pointer-events-none absolute left-0 top-full z-30 mt-1 w-max max-w-80 translate-y-1 rounded-lg border-[1.5px] border-ink bg-card px-2.5 py-1.5 text-xs opacity-0 shadow-[2px_2px_0_0_#161514] transition-all delay-150 group-hover:translate-y-0 group-hover:opacity-100">
            {contact && <span className="block font-medium">{contact}</span>}
            {s.fit_reason && <span className="block text-muted-foreground">{s.fit_reason}</span>}
          </span>
        )}
      </div>
      <span title="Our ask" className="w-36 truncate text-right font-mono text-xs font-bold">{s.ask ?? ""}</span>
      <Track s={s} />
      <div className="flex w-[152px] items-center justify-end gap-1.5">
        {s.status === "accepted" ? (
          <span title={[s.offer_note, s.notes].filter(Boolean).join(". ") || undefined} className={cn("max-w-full truncate rounded-full border-[1.5px] border-ink px-2.5 py-0.5 text-xs font-semibold", s.offer_type === "in_kind" ? "bg-peach" : "bg-mint")}>
            {s.offer}
          </span>
        ) : s.status === "declined" ? (
          <span title={s.notes ?? undefined} className="mono-label text-[10px] text-muted-foreground">Declined</span>
        ) : (
          <>
            {s.pending ? (
              <span title="Waiting for the Programmes Director" className="grid size-8 place-items-center rounded-lg border-[1.5px] border-dashed border-ink/40 text-muted-foreground">
                <Hourglass className="size-3.5 animate-[spin_3s_linear_infinite]" />
              </span>
            ) : (
              <button onClick={onEmail} title={s.status === "found" ? "Email with proposal" : "Email again"} aria-label="Email" className={cn(iconBtn, s.status === "found" && "border-ink bg-sun text-ink")}>
                <Mail className="size-3.5" />
              </button>
            )}
            {(s.status === "contacted" || s.status === "opened") && (
              <button onClick={() => run("reply", () => markSponsorReplied(s.id))} disabled={busy !== null} title="Mark replied" aria-label="Mark replied" className={iconBtn}>
                {busy === "reply" ? <Loader2 className="size-3.5 animate-spin" /> : <Reply className="size-3.5" />}
              </button>
            )}
            <button onClick={onAccept} title="Accepted" aria-label="Accepted" className={cn(iconBtn, "hover:bg-mint", accepting && "border-ink bg-mint text-ink")}>
              <HandCoins className="size-3.5" />
            </button>
            <button onClick={() => run("decline", () => declineSponsor(s.id))} disabled={busy !== null} title="Declined" aria-label="Declined" className={cn(iconBtn, "hover:bg-peach")}>
              {busy === "decline" ? <Loader2 className="size-3.5 animate-spin" /> : <ThumbsDown className="size-3.5" />}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function AcceptForm({ s, onDone }: { s: SponsorRow; onDone: () => void }) {
  const [type, setType] = useState<"cash" | "in_kind">(/coffee|food|meal|drink|voucher|book|prize|credit/i.test(s.ask ?? "") ? "in_kind" : "cash");
  const [amount, setAmount] = useState(() => (s.ask?.match(/RM\s?([\d,]+)/)?.[1] ?? "").replace(/,/g, ""));
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <motion.form
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: "auto", opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      className="overflow-hidden"
      onSubmit={(e) => {
        e.preventDefault();
        const rect = (e.currentTarget as HTMLFormElement).getBoundingClientRect();
        start(async () => {
          const r = await acceptSponsor(s.id, { offer_type: type, offer_amount: amount ? Number(amount) : null, offer_note: note });
          if (!r.ok) return void toast.error(r.error);
          toast.success(r.message ?? "Saved");
          fireConfetti(rect.left + rect.width / 2, rect.top);
          onDone();
          router.refresh();
        });
      }}
    >
      <div className="flex flex-wrap items-center gap-2 border-t border-dashed border-ink/20 bg-mint/30 px-4 py-3 sm:pl-[4.5rem]">
        <div className="flex rounded-lg border-[1.5px] border-ink bg-card p-0.5">
          {(["cash", "in_kind"] as const).map((t) => (
            <button key={t} type="button" onClick={() => setType(t)} className={cn("relative rounded-md px-2.5 py-1 text-xs font-semibold", type === t ? "text-white" : "text-ink/70 hover:text-ink")}>
              {type === t && <motion.span layoutId={`offer-type-${s.id}`} className="absolute inset-0 rounded-md bg-ink" transition={SPRING.default} />}
              <span className="relative">{t === "cash" ? "Cash" : "In-kind"}</span>
            </button>
          ))}
        </div>
        <label className="flex items-center gap-1 font-mono text-xs font-bold">
          RM
          <input inputMode="decimal" placeholder={type === "cash" ? "Amount" : "Value"} value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} className={cn(input, "w-24 font-mono")} required={type === "cash"} />
        </label>
        <input placeholder={type === "cash" ? "Note" : "What they give, e.g. Food for 150 pax"} value={note} onChange={(e) => setNote(e.target.value)} required={type === "in_kind"} className={cn(input, "min-w-[200px] flex-1")} />
        <button disabled={pending} className="inline-flex h-8 items-center gap-1.5 rounded-lg border-[1.5px] border-ink bg-mint px-3 text-sm font-semibold shadow-[2px_2px_0_0_#161514] transition-transform hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50">
          {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />} Save
        </button>
      </div>
    </motion.form>
  );
}

function AddSponsor({ eventId, onDone }: { eventId: string; onDone: () => void }) {
  const empty = { company: "", website: "", contact_name: "", contact_email: "", industry: "" };
  const [f, setF] = useState(empty);
  const [pending, start] = useTransition();
  const router = useRouter();
  const field = (k: keyof typeof empty, placeholder: string, type = "text") => (
    <input type={type} placeholder={placeholder} value={f[k]} required={k === "company"} onChange={(e) => setF({ ...f, [k]: e.target.value })} className={input} />
  );
  return (
    <motion.form
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: "auto", opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      className="overflow-hidden"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await addSponsor(eventId, f);
          if (!r.ok) return void toast.error(r.error);
          toast.success(r.message ?? "Added");
          setF(empty);
          onDone();
          router.refresh();
        });
      }}
    >
      <div className="mb-3 grid gap-2 rounded-xl border-[1.5px] border-dashed border-ink/30 bg-sand/40 p-3 sm:grid-cols-[1.2fr_1fr_1fr_1.2fr_1fr_auto]">
        {field("company", "Company")}
        {field("website", "Website")}
        {field("contact_name", "Contact")}
        {field("contact_email", "Email", "email")}
        {field("industry", "Industry")}
        <button disabled={pending} className="inline-flex h-8 items-center justify-center gap-1 rounded-lg border-[1.5px] border-ink bg-tomato px-3 text-sm font-semibold text-white shadow-[2px_2px_0_0_#161514] transition-transform hover:-translate-y-0.5 disabled:opacity-50">
          {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />} Add
        </button>
      </div>
    </motion.form>
  );
}

function Composer({ eventId, s, gated, onClose }: { eventId: string; s: SponsorRow | null; gated: boolean; onClose: () => void }) {
  return (
    <Sheet open={!!s} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" aria-describedby={undefined} className="w-full gap-0 border-l-[1.5px] border-ink bg-card p-0 sm:max-w-xl">
        {s && <ComposerBody key={s.id} eventId={eventId} s={s} gated={gated} onClose={onClose} />}
      </SheetContent>
    </Sheet>
  );
}

function ComposerBody({ eventId, s, gated, onClose }: { eventId: string; s: SponsorRow; gated: boolean; onClose: () => void }) {
  const [d, setD] = useState(s.draft);
  const [pending, start] = useTransition();
  const router = useRouter();
  const pdf = `/api/outputs/${eventId}/proposal.pdf`;
  return (
    <form
      className="flex h-full flex-col"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await sendSponsorEmail(s.id, d);
          if (!r.ok) return void toast.error(r.error);
          toast.success(r.message ?? "Sent");
          onClose();
          router.refresh();
        });
      }}
    >
      <div className="flex items-center gap-3 border-b-[1.5px] border-ink bg-sand/50 px-5 py-4 pr-12">
        <Logo s={s} size="sm" />
        <SheetTitle className="font-display text-xl font-bold">{s.company}</SheetTitle>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
        <label className="flex items-center gap-3 border-b border-border pb-2">
          <span className="mono-label w-14 text-[10px] text-muted-foreground">To</span>
          <input type="email" value={d.to} placeholder="partnerships@company.com" onChange={(e) => setD({ ...d, to: e.target.value })} className="h-8 flex-1 bg-transparent text-sm outline-none" />
        </label>
        <label className="flex items-center gap-3 border-b border-border pb-2">
          <span className="mono-label w-14 text-[10px] text-muted-foreground">Subject</span>
          <input value={d.subject} onChange={(e) => setD({ ...d, subject: e.target.value })} className="h-8 flex-1 bg-transparent text-sm font-semibold outline-none" />
        </label>
        <textarea value={d.body} onChange={(e) => setD({ ...d, body: e.target.value })} rows={16} className="w-full resize-none rounded-lg border-[1.5px] border-ink/15 bg-card p-3 text-sm leading-relaxed outline-none transition-colors focus:border-ink" />
        <motion.a
          href={pdf}
          target="_blank"
          rel="noreferrer"
          whileHover={{ y: -2, rotate: -1 }}
          className="flex items-center gap-3 rounded-lg border-[1.5px] border-ink bg-sky/50 px-3 py-2 shadow-[2px_2px_0_0_#161514]"
        >
          <span className="grid size-9 place-items-center rounded-md border-[1.5px] border-ink bg-card">
            <FileText className="size-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="mono-label block text-[9.5px] text-muted-foreground">Attached</span>
            <span className="block text-sm font-semibold">Event proposal (PDF)</span>
          </span>
          <ArrowUpRight className="size-4" />
        </motion.a>
      </div>
      <div className="flex items-center justify-end gap-2 border-t-[1.5px] border-ink px-5 py-3">
        <button type="button" onClick={onClose} className="h-9 rounded-lg px-3 text-sm text-muted-foreground hover:text-ink">
          Cancel
        </button>
        <button disabled={pending} title={gated ? "Goes to the Programmes Director first" : undefined} className="inline-flex h-9 items-center gap-1.5 rounded-lg border-[1.5px] border-ink bg-tomato px-4 text-sm font-semibold text-white shadow-[2px_2px_0_0_#161514] transition-transform hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50">
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          {gated ? "Send for approval" : "Send"}
        </button>
      </div>
    </form>
  );
}
