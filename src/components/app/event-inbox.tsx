"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { Check, ExternalLink, Info, Mail, Pencil, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { setEventMailbox } from "@/app/actions-inbox";
import { StageEmpty } from "@/components/ep/kit";

type Group = "speakers" | "suppliers" | "sponsors" | "faculty" | "attendees" | "other";

export type InboxMail = {
  id: string;
  kind: string;
  group: Group;
  to_addr: string;
  intended_to: string | null;
  subject: string;
  body: string;
  status: string;
  provider: string | null;
  error: string | null;
  sent_at: string | null;
  created_at: string;
  who: string | null;
  sender: string | null;
};

const GROUPS: { key: Group | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "speakers", label: "Speakers" },
  { key: "suppliers", label: "Suppliers" },
  { key: "sponsors", label: "Sponsors" },
  { key: "faculty", label: "Faculty" },
  { key: "attendees", label: "Attendees" },
  { key: "other", label: "Other" },
];

const CHIP: Record<Group, string> = {
  speakers: "bg-peach",
  suppliers: "bg-mint",
  sponsors: "bg-[#e9d5ff]",
  faculty: "bg-sky",
  attendees: "bg-sun",
  other: "bg-sand",
};

const KIND: Record<string, string> = {
  speaker_outreach: "Invite",
  speaker_followup: "Follow up",
  vendor: "Supplier",
  sponsor_outreach: "Sponsor",
  vendor_quote: "Quote",
  vendor_reminder: "Reminder",
  faculty_submission: "Proposal",
  attendee_reminder: "Reminder",
  feedback_survey: "Survey",
  approval_ping: "Approval",
};
const kindLabel = (k: string) => KIND[k] ?? k.replace(/_/g, " ");

const DOT: Record<string, string> = {
  sent: "bg-[#46a758]",
  outbox: "bg-ticket-blue",
  queued: "bg-sun",
  failed: "bg-tomato",
};
const STATUS: Record<string, string> = { sent: "Delivered", outbox: "Stored, not sent", queued: "Sending", failed: "Failed" };

const TZ = "Asia/Kuala_Lumpur";
function when(iso: string, long = false) {
  const d = new Date(iso);
  if (long) return d.toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: TZ });
  const day = (x: Date) => x.toLocaleDateString("en-GB", { timeZone: TZ });
  return day(d) === day(new Date())
    ? d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: TZ })
    : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: TZ });
}

const initials = (s: string) =>
  s
    .replace(/^Dr\.?\s+/, "")
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");

export function EventInbox({ eventId, mailbox, suggestion, mails }: { eventId: string; mailbox: { address: string; label: string | null } | null; suggestion: string; mails: InboxMail[] }) {
  const [filter, setFilter] = useState<Group | "all">("all");
  const [sel, setSel] = useState<string | undefined>(mails[0]?.id);

  useEffect(() => {
    const read = () => {
      const h = decodeURIComponent(window.location.hash.slice(1));
      if (h && mails.some((m) => m.id === h)) {
        setSel(h);
        setFilter("all");
      }
    };
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, [mails]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: mails.length };
    for (const m of mails) c[m.group] = (c[m.group] ?? 0) + 1;
    return c;
  }, [mails]);
  const shown = useMemo(() => (filter === "all" ? mails : mails.filter((m) => m.group === filter)), [mails, filter]);
  const cur = shown.find((m) => m.id === sel) ?? shown[0];

  const pick = (id: string) => {
    setSel(id);
    history.replaceState(null, "", `#${id}`);
  };

  return (
    <div className="space-y-4">
      <MailboxBar eventId={eventId} mailbox={mailbox} suggestion={suggestion} total={mails.length} />

      <div className="flex flex-wrap gap-1.5">
        {GROUPS.filter((g) => g.key === "all" || g.key !== "other" || counts.other).map((g) => {
          const on = filter === g.key;
          return (
            <motion.button
              key={g.key}
              whileTap={{ scale: 0.95 }}
              whileHover={{ y: -1 }}
              onClick={() => setFilter(g.key)}
              className={cn("relative inline-flex h-8 items-center gap-1.5 rounded-full border-[1.5px] border-ink px-3 text-sm font-medium transition-colors", on ? "text-white" : "bg-card hover:bg-sand/60")}
            >
              {on && <motion.span layoutId="inbox-chip" className="absolute inset-0 rounded-full bg-ink" transition={{ type: "spring", stiffness: 420, damping: 32 }} />}
              {g.key !== "all" && <span className={cn("relative size-2 rounded-full border border-ink", CHIP[g.key])} />}
              <span className="relative">{g.label}</span>
              <span className={cn("relative font-mono text-[11px]", on ? "text-white/70" : "text-muted-foreground")}>{counts[g.key] ?? 0}</span>
            </motion.button>
          );
        })}
      </div>

      {mails.length === 0 ? (
        <StageEmpty title="No mail yet" />
      ) : (
        <div className="grid overflow-hidden rounded-xl border-[1.5px] border-ink bg-card shadow-[2px_2px_0_0_#161514] lg:h-[72vh] lg:grid-cols-[360px_1fr]">
          <ul className="max-h-[45vh] overflow-y-auto border-b-[1.5px] border-ink scrollbar-thin lg:max-h-none lg:border-b-0 lg:border-r-[1.5px]">
            <AnimatePresence initial={false} mode="popLayout">
              {shown.map((m, i) => (
                <motion.li
                  key={m.id}
                  layout
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0, transition: { delay: Math.min(i, 14) * 0.025 } }}
                  exit={{ opacity: 0, x: -8 }}
                  className="border-b border-border last:border-b-0"
                >
                  <Row m={m} active={cur?.id === m.id} onClick={() => pick(m.id)} />
                </motion.li>
              ))}
            </AnimatePresence>
            {shown.length === 0 && <li className="p-6 text-center text-sm text-muted-foreground">Nothing here</li>}
          </ul>
          <div className="min-h-[60vh] min-w-0 lg:min-h-0">
            <AnimatePresence mode="wait">
              {cur && <Reader key={cur.id} m={cur} from={mailbox?.address ?? null} />}
            </AnimatePresence>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ m, active, onClick }: { m: InboxMail; active: boolean; onClick: () => void }) {
  const who = m.who ?? m.intended_to ?? m.to_addr;
  return (
    <button onClick={onClick} className={cn("group relative block w-full px-4 py-3 text-left transition-colors", !active && "hover:bg-sand/40")}>
      {active && <motion.span layoutId="inbox-sel" className="absolute inset-0 bg-sand/70" transition={{ type: "spring", stiffness: 420, damping: 34 }} />}
      {active && <motion.span layoutId="inbox-bar" className="absolute inset-y-0 left-0 w-1 bg-tomato" />}
      <span className="relative block transition-transform duration-200 group-hover:translate-x-0.5">
        <span className="flex items-center gap-2">
          <span title={STATUS[m.status] ?? m.status} className={cn("size-2 shrink-0 rounded-full", DOT[m.status] ?? "bg-sand", m.status === "queued" && "animate-pulse")} />
          <span className="min-w-0 flex-1 truncate text-sm font-semibold">{who}</span>
          <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{when(m.sent_at ?? m.created_at)}</span>
        </span>
        <span className="mt-0.5 block truncate pl-4 text-[13px] text-ink/80">{m.subject}</span>
        <span className="mt-1.5 flex pl-4">
          <span className={cn("mono-label rounded-[5px] border border-ink/70 px-1.5 py-[2px] text-[9.5px] font-bold leading-none", CHIP[m.group])}>{kindLabel(m.kind)}</span>
        </span>
      </span>
    </button>
  );
}

function Reader({ m, from }: { m: InboxMail; from: string | null }) {
  const who = m.who ?? m.intended_to ?? m.to_addr;
  const redirected = m.intended_to && m.intended_to !== m.to_addr;
  const doc = `<!doctype html><html><head><meta charset="utf-8"><base target="_blank"><style>body{margin:0;padding:20px;font-family:system-ui,sans-serif;color:#161514;line-height:1.5}img{max-width:100%}</style></head><body>${m.body}</body></html>`;
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }} className="flex h-full flex-col">
      <div className="border-b-[1.5px] border-ink px-5 py-4">
        <div className="flex items-start gap-3">
          <h2 className="min-w-0 flex-1 font-display text-xl font-bold leading-tight">{m.subject}</h2>
          <span className={cn("mono-label shrink-0 rounded-[5px] border border-ink/70 px-1.5 py-[3px] text-[9.5px] font-bold leading-none", CHIP[m.group])}>{kindLabel(m.kind)}</span>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-full border-[1.5px] border-ink bg-peach font-display text-xs font-bold">{initials(who)}</span>
          <div className="min-w-0 flex-1 text-sm">
            <p className="truncate">
              <span className="font-semibold">{who}</span> <span className="font-mono text-xs text-muted-foreground">&lt;{m.intended_to ?? m.to_addr}&gt;</span>
            </p>
            <p className="truncate font-mono text-[11px] text-muted-foreground">from {from ?? "Movents"}{m.sender ? ` · ${m.sender}` : ""}</p>
          </div>
          <div className="group/info relative flex shrink-0 items-center gap-2">
            <span className="font-mono text-[11px] text-muted-foreground">{when(m.sent_at ?? m.created_at, true)}</span>
            <span className={cn("size-2.5 rounded-full border border-ink", DOT[m.status] ?? "bg-sand")} />
            <Info className="size-3.5 text-muted-foreground transition-colors group-hover/info:text-ink" />
            <div className="pointer-events-none absolute right-0 top-full z-20 mt-2 w-64 translate-y-1 rounded-lg border-[1.5px] border-ink bg-card p-3 text-xs opacity-0 shadow-[2px_2px_0_0_#161514] transition-all duration-150 group-hover/info:translate-y-0 group-hover/info:opacity-100">
              <dl className="grid grid-cols-[72px_1fr] gap-y-1">
                <dt className="text-muted-foreground">Status</dt>
                <dd>{STATUS[m.status] ?? m.status}</dd>
                {m.error && (
                  <>
                    <dt className="text-muted-foreground">Error</dt>
                    <dd className="text-tomato-ink">{m.error}</dd>
                  </>
                )}
                <dt className="text-muted-foreground">Via</dt>
                <dd>{m.provider ?? "n/a"}</dd>
                {redirected && (
                  <>
                    <dt className="text-muted-foreground">Test inbox</dt>
                    <dd className="break-all">{m.to_addr}</dd>
                  </>
                )}
              </dl>
            </div>
          </div>
        </div>
      </div>
      <div className="relative min-h-0 flex-1 bg-white">
        <iframe title={m.subject} sandbox="allow-popups allow-popups-to-escape-sandbox" srcDoc={doc} className="h-full min-h-[50vh] w-full lg:min-h-0" />
        <a
          href={`mailto:${m.intended_to ?? m.to_addr}?subject=${encodeURIComponent(`Re: ${m.subject}`)}`}
          className="group/re absolute bottom-4 right-4 inline-flex h-9 items-center gap-1.5 rounded-xl border-[1.5px] border-ink bg-card px-3 text-sm font-medium shadow-[2px_2px_0_0_#161514] transition-all hover:-translate-y-0.5 hover:shadow-[3px_3px_0_0_#161514]"
        >
          <Mail className="size-3.5" />
          Reply
          <ExternalLink className="size-3 opacity-0 transition-opacity group-hover/re:opacity-60" />
        </a>
      </div>
    </motion.div>
  );
}

function MailboxBar({ eventId, mailbox, suggestion, total }: { eventId: string; mailbox: { address: string; label: string | null } | null; suggestion: string; total: number }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(mailbox?.address ?? "");
  const [pending, start] = useTransition();
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) input.current?.focus();
  }, [editing]);

  const save = () =>
    start(async () => {
      const r = await setEventMailbox(eventId, value);
      if (!r.ok) return void toast.error(r.error);
      toast.success(r.message ?? "Saved");
      setEditing(false);
      router.refresh();
    });

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border-[1.5px] border-ink bg-card px-4 py-3">
      <motion.span whileHover={{ rotate: -8, scale: 1.06 }} className="grid size-9 shrink-0 place-items-center rounded-lg border-[1.5px] border-ink bg-tomato">
        <Mail className="size-4" />
      </motion.span>
      <div className="min-w-0 flex-1">
        <p className="mono-label text-[10px] text-muted-foreground">Mailbox</p>
        <AnimatePresence mode="wait" initial={false}>
          {editing ? (
            <motion.form
              key="edit"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              onSubmit={(e) => {
                e.preventDefault();
                save();
              }}
              className="flex items-center gap-1.5"
            >
              <input
                ref={input}
                type="email"
                value={value}
                placeholder={suggestion}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => e.key === "Escape" && setEditing(false)}
                className="h-8 w-full max-w-sm rounded-lg border-[1.5px] border-ink bg-background px-2 font-mono text-sm outline-none focus:shadow-[2px_2px_0_0_#ff5a36]"
              />
              <motion.button whileTap={{ scale: 0.9 }} type="submit" disabled={pending || !value.trim()} aria-label="Save" className="grid size-8 place-items-center rounded-lg border-[1.5px] border-ink bg-mint disabled:opacity-50">
                <Check className="size-3.5" />
              </motion.button>
              <motion.button whileTap={{ scale: 0.9 }} type="button" onClick={() => setEditing(false)} aria-label="Cancel" className="grid size-8 place-items-center rounded-lg border-[1.5px] border-ink bg-card hover:bg-sand/60">
                <X className="size-3.5" />
              </motion.button>
            </motion.form>
          ) : (
            <motion.button
              key="view"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              onClick={() => {
                setValue(mailbox?.address ?? "");
                setEditing(true);
              }}
              className="group flex max-w-full items-center gap-2 text-left"
            >
              {mailbox ? (
                <span className="truncate font-mono text-sm font-semibold">{mailbox.address}</span>
              ) : (
                <span className="truncate font-mono text-sm text-muted-foreground underline decoration-dashed underline-offset-4">Tag an email account</span>
              )}
              <Pencil className="size-3.5 shrink-0 text-muted-foreground opacity-40 transition-all group-hover:-rotate-12 group-hover:opacity-100" />
            </motion.button>
          )}
        </AnimatePresence>
      </div>
      <span className="mono-label rounded-full border-[1.5px] border-ink bg-sun px-2.5 py-1 text-[10px] font-bold">{total} mail</span>
    </div>
  );
}
