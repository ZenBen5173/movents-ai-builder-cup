"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, Check, ChevronLeft, ChevronRight, File, Forward, Inbox, Info, Loader2, Minus, Pencil, RotateCw, Reply, Search, Send, Star, Tag, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { composeEmail, decideDraftAction, setEventMailbox } from "@/app/actions-inbox";

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
export type InboxDraft = { id: string; kind: string; title: string; to: string; subject: string; text: string; created_at: string };

type Folder = "inbox" | "starred" | "sent" | "drafts" | Group;

const LABELS: { key: Group; label: string; color: string }[] = [
  { key: "speakers", label: "Speakers", color: "bg-peach" },
  { key: "suppliers", label: "Suppliers", color: "bg-mint" },
  { key: "sponsors", label: "Sponsors", color: "bg-[#e9d5ff]" },
  { key: "faculty", label: "Faculty", color: "bg-sky" },
  { key: "attendees", label: "Attendees", color: "bg-sun" },
  { key: "other", label: "Other", color: "bg-sand" },
];
const COLOR = Object.fromEntries(LABELS.map((l) => [l.key, l.color])) as Record<Group, string>;
const DRAFT_GROUP: Record<string, Group> = { "email.speaker": "speakers", "email.sponsor": "sponsors", "email.vendor": "suppliers", "email.faculty": "faculty" };

const TZ = "Asia/Kuala_Lumpur";
function when(iso: string, long = false) {
  const d = new Date(iso);
  if (long) return d.toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: TZ });
  const day = (x: Date) => x.toLocaleDateString("en-GB", { timeZone: TZ });
  return day(d) === day(new Date()) ? d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: TZ }) : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: TZ });
}
const initials = (s: string) =>
  s
    .replace(/^Dr\.?\s+/, "")
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
const text = (html: string) =>
  html
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
const AVATAR = ["bg-peach", "bg-mint", "bg-sky", "bg-sun", "bg-[#e9d5ff]"];
const avatarColor = (s: string) => AVATAR[[...s].reduce((n, c) => n + c.charCodeAt(0), 0) % AVATAR.length];

/** One list entry: a received or sent email, or a draft waiting for you. */
type Item = { id: string; draft?: InboxDraft; mail?: InboxMail; received: boolean; who: string; addr: string; subject: string; snippet: string; at: string; group: Group };

function toItems(mails: InboxMail[], drafts: InboxDraft[]): Item[] {
  return [
    ...drafts.map((d) => ({ id: d.id, draft: d, received: false, who: d.to || "No address yet", addr: d.to, subject: d.subject || d.title, snippet: d.text.replace(/\s+/g, " ").slice(0, 160), at: d.created_at, group: DRAFT_GROUP[d.kind] ?? "other" })),
    ...mails.map((m) => {
      const received = m.status === "received";
      const addr = m.intended_to ?? m.to_addr;
      return { id: m.id, mail: m, received, who: (m.who ?? addr).split(" — ")[0], addr, subject: m.subject, snippet: text(m.body).slice(0, 160), at: m.sent_at ?? m.created_at, group: m.group };
    }),
  ];
}

/**
 * The event's mailbox, laid out like Gmail: folders on the left, the list, and
 * the open email. Only mail for this event is here: what Movents sent for it,
 * replies to those, and drafts Gemini wrote for you to check and send.
 */
export function EventInbox({ eventId, eventTitle, mailbox, suggestion, mails, drafts }: { eventId: string; eventTitle: string; mailbox: { address: string; label: string | null } | null; suggestion: string; mails: InboxMail[]; drafts: InboxDraft[] }) {
  const router = useRouter();
  const [gone, setGone] = useState<string[]>([]);
  const items = useMemo(() => toItems(mails, drafts).filter((i) => !gone.includes(i.id)), [mails, drafts, gone]);
  const [folder, setFolder] = useState<Folder>(() => (items.some((i) => i.received) ? "inbox" : drafts.length ? "drafts" : "sent"));
  const [open, setOpen] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [read, setRead] = useState<Set<string>>(new Set());
  const [stars, setStars] = useState<Set<string>>(new Set());
  const [compose, setCompose] = useState<{ to: string; subject: string; body: string } | null>(null);
  const [spin, setSpin] = useState(0);
  const label = mailbox?.label ?? `Movents/${eventTitle}`;
  const starKey = `movents-stars-${eventId}`;

  useEffect(() => {
    try {
      setStars(new Set(JSON.parse(localStorage.getItem(starKey) ?? "[]")));
    } catch {}
    const fromHash = () => {
      const h = decodeURIComponent(window.location.hash.slice(1));
      if (h === "drafts") setFolder("drafts");
      else if (h && items.some((i) => i.id === h)) setOpen(h);
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleStar = (id: string) =>
    setStars((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      try {
        localStorage.setItem(starKey, JSON.stringify([...n]));
      } catch {}
      return n;
    });

  const inFolder = (i: Item, f: Folder) =>
    f === "inbox" ? i.received : f === "sent" ? Boolean(i.mail) && !i.received : f === "drafts" ? Boolean(i.draft) : f === "starred" ? stars.has(i.id) : i.group === f && !i.draft;
  const unread = (i: Item) => i.received && !read.has(i.id) && Date.now() - Date.parse(i.at) < 10 * 86_400_000;
  const count = (f: Folder) => items.filter((i) => inFolder(i, f) && (f !== "inbox" || unread(i))).length;
  const needle = q.trim().toLowerCase();
  const list = items
    .filter((i) => (needle ? `${i.who} ${i.addr} ${i.subject} ${i.snippet}`.toLowerCase().includes(needle) : inFolder(i, folder)))
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  const cur = items.find((i) => i.id === open) ?? null;

  const go = (f: Folder) => {
    setFolder(f);
    setOpen(null);
    setQ("");
  };
  const openItem = (i: Item) => {
    setOpen(i.id);
    setRead((r) => new Set(r).add(i.id));
    history.replaceState(null, "", `#${i.id}`);
  };

  const FOLDERS: { key: Folder; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { key: "inbox", label: "Inbox", icon: Inbox },
    { key: "starred", label: "Starred", icon: Star },
    { key: "sent", label: "Sent", icon: Send },
    { key: "drafts", label: "Drafts", icon: File },
  ];

  return (
    <div className="relative overflow-hidden rounded-2xl border-[1.5px] border-ink bg-card shadow-[3px_3px_0_0_#161514]">
      {/* Top bar: search and the account this inbox reads from. */}
      <div className="flex flex-wrap items-center gap-3 border-b-[1.5px] border-ink bg-sand/30 px-4 py-2.5">
        <label className="group flex h-10 min-w-0 flex-1 items-center gap-2 rounded-full border-[1.5px] border-transparent bg-white px-4 transition-colors focus-within:border-ink focus-within:shadow-[2px_2px_0_0_#161514]">
          <Search className="size-4 text-muted-foreground transition-transform group-focus-within:scale-110" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search mail" className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
          {q && (
            <button onClick={() => setQ("")} aria-label="Clear search" className="text-muted-foreground hover:text-ink">
              <X className="size-4" />
            </button>
          )}
        </label>
        <AccountChip eventId={eventId} mailbox={mailbox} suggestion={suggestion} label={label} />
      </div>

      <div className="grid min-h-[68vh] grid-cols-1 md:grid-cols-[208px_1fr]">
        {/* Folders and labels. */}
        <nav className="border-b-[1.5px] border-ink p-3 md:border-b-0 md:border-r-[1.5px]">
          <motion.button
            whileHover={{ y: -2, boxShadow: "3px 3px 0 0 #161514" }}
            whileTap={{ scale: 0.96 }}
            onClick={() => setCompose({ to: "", subject: "", body: "" })}
            className="mb-4 flex h-12 items-center gap-3 rounded-2xl border-[1.5px] border-ink bg-tomato pl-4 pr-6 text-sm font-semibold shadow-[2px_2px_0_0_#161514]"
          >
            <Pencil className="size-4" /> Compose
          </motion.button>
          <ul className="flex gap-1 overflow-x-auto md:block md:space-y-0.5">
            {FOLDERS.map((f) => (
              <FolderRow key={f.key} on={!needle && folder === f.key} onClick={() => go(f.key)} icon={<f.icon className={cn("size-4", f.key === "starred" && "group-hover:fill-sun")} />} label={f.label} n={count(f.key)} bold={f.key === "inbox" || f.key === "drafts"} />
            ))}
          </ul>
          <p className="mono-label mb-1 mt-5 hidden px-3 text-[10px] text-muted-foreground md:block">Labels</p>
          <ul className="mt-1 flex gap-1 overflow-x-auto md:block md:space-y-0.5">
            {LABELS.filter((l) => l.key !== "other" || items.some((i) => i.group === "other")).map((l) => (
              <FolderRow key={l.key} on={!needle && folder === l.key} onClick={() => go(l.key)} icon={<span className={cn("block size-3 rounded-sm border border-ink transition-transform group-hover:rotate-45", l.color)} />} label={l.label} n={items.filter((i) => i.group === l.key && !i.draft).length} />
            ))}
          </ul>
          <p className="mt-6 hidden items-start gap-1.5 px-3 text-[11px] leading-snug text-muted-foreground md:flex">
            <Tag className="mt-0.5 size-3 shrink-0" /> Only mail labelled {label} shows here.
          </p>
        </nav>

        {/* The list, or the open email. */}
        <div className="min-w-0">
          <AnimatePresence mode="wait" initial={false}>
            {cur ? (
              <motion.div key={cur.id} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 16 }} transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}>
                {cur.draft ? (
                  <DraftView
                    d={cur.draft}
                    onBack={() => setOpen(null)}
                    onDone={() => {
                      setGone((g) => [...g, cur.id]);
                      setOpen(null);
                      router.refresh();
                    }}
                  />
                ) : (
                  <Reader
                    i={cur}
                    me={mailbox?.address ?? null}
                    label={label}
                    starred={stars.has(cur.id)}
                    onStar={() => toggleStar(cur.id)}
                    onBack={() => setOpen(null)}
                    onReply={() => setCompose({ to: cur.addr, subject: cur.subject.startsWith("Re:") ? cur.subject : `Re: ${cur.subject}`, body: "" })}
                    onForward={() => setCompose({ to: "", subject: `Fwd: ${cur.subject}`, body: `\n\n---------- Forwarded message ----------\n${cur.snippet}` })}
                  />
                )}
              </motion.div>
            ) : (
              <motion.div key={`list-${folder}-${needle}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
                <div className="flex items-center gap-1 border-b border-border px-3 py-1.5 text-muted-foreground">
                  <motion.button
                    whileTap={{ scale: 0.9 }}
                    onClick={() => {
                      setSpin((s) => s + 1);
                      router.refresh();
                    }}
                    aria-label="Refresh"
                    className="grid size-8 place-items-center rounded-full hover:bg-sand/60 hover:text-ink"
                  >
                    <motion.span animate={{ rotate: spin * 360 }} transition={{ duration: 0.6 }}>
                      <RotateCw className="size-4" />
                    </motion.span>
                  </motion.button>
                  <span className="ml-auto font-mono text-[11px]">{list.length ? `1–${list.length} of ${list.length}` : "0"}</span>
                  <ChevronLeft className="size-4 opacity-30" />
                  <ChevronRight className="size-4 opacity-30" />
                </div>
                <ul>
                  {list.map((i, n) => (
                    <motion.li key={i.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0, transition: { delay: Math.min(n, 12) * 0.02 } }}>
                      <Row i={i} unread={unread(i)} starred={stars.has(i.id)} onStar={() => toggleStar(i.id)} onOpen={() => openItem(i)} showLabel={folder === "inbox" || folder === "sent" || folder === "starred" || Boolean(needle)} />
                    </motion.li>
                  ))}
                </ul>
                {!list.length && (
                  <div className="grid place-items-center px-6 py-20 text-center">
                    <Inbox className="mb-3 size-8 text-muted-foreground/50" />
                    <p className="text-sm text-muted-foreground">{needle ? "No mail matches your search." : folder === "drafts" ? "No drafts. Gemini puts the emails it writes for you here." : folder === "starred" ? "Star an email to keep it here." : "Nothing here yet."}</p>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <AnimatePresence>{compose && <Compose eventId={eventId} init={compose} onClose={() => setCompose(null)} />}</AnimatePresence>
    </div>
  );
}

function FolderRow({ on, onClick, icon, label, n, bold }: { on: boolean; onClick: () => void; icon: React.ReactNode; label: string; n: number; bold?: boolean }) {
  return (
    <li className="shrink-0">
      <button onClick={onClick} className={cn("group relative flex h-8 w-full items-center gap-3 rounded-full px-3 text-sm transition-colors md:rounded-l-none md:rounded-r-full", on ? "font-semibold" : "hover:bg-sand/60")}>
        {on && <motion.span layoutId="mail-folder" className="absolute inset-0 rounded-full bg-sun md:rounded-l-none md:rounded-r-full" transition={{ type: "spring", stiffness: 420, damping: 34 }} />}
        <span className="relative">{icon}</span>
        <span className="relative flex-1 text-left">{label}</span>
        {n > 0 && <span className={cn("relative font-mono text-[11px]", bold ? "font-bold text-ink" : "text-muted-foreground")}>{n}</span>}
      </button>
    </li>
  );
}

function Row({ i, unread, starred, onStar, onOpen, showLabel }: { i: Item; unread: boolean; starred: boolean; onStar: () => void; onOpen: () => void; showLabel: boolean }) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => e.key === "Enter" && onOpen()}
      className={cn(
        "group relative grid cursor-pointer grid-cols-[28px_minmax(0,150px)_1fr_auto] items-center gap-2 border-b border-border px-3 py-2 text-sm transition-all hover:z-10 hover:shadow-[0_2px_6px_rgba(22,21,20,.18)]",
        unread ? "bg-white" : "bg-sand/20",
      )}
    >
      <button
        onClick={(e) => {
          e.stopPropagation();
          onStar();
        }}
        aria-label={starred ? "Unstar" : "Star"}
        className="grid size-7 place-items-center rounded-full hover:bg-sand"
      >
        <motion.span key={String(starred)} initial={{ scale: 0.6 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 500, damping: 15 }}>
          <Star className={cn("size-4", starred ? "fill-sun text-ink" : "text-muted-foreground/60 group-hover:text-muted-foreground")} />
        </motion.span>
      </button>
      <span className={cn("truncate", unread && "font-bold")}>
        {i.draft ? <span className="text-tomato-ink">Draft</span> : i.received ? i.who : <span className="text-muted-foreground">To: <span className="text-ink">{i.who}</span></span>}
      </span>
      <span className="flex min-w-0 items-center gap-1.5">
        {showLabel && <span className={cn("mono-label shrink-0 rounded-[4px] border border-ink/60 px-1 py-px text-[9px] font-bold", COLOR[i.group])}>{LABELS.find((l) => l.key === i.group)?.label}</span>}
        <span className="min-w-0 truncate">
          <span className={cn(unread && "font-bold")}>{i.subject}</span>
          <span className="text-muted-foreground"> - {i.snippet}</span>
        </span>
      </span>
      <span className={cn("w-14 text-right font-mono text-[11px] transition-opacity group-hover:opacity-0", unread ? "font-bold text-ink" : "text-muted-foreground")}>{when(i.at)}</span>
      <span className="pointer-events-none absolute right-3 flex items-center gap-1 opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100 translate-x-1">
        {i.received ? <Reply className="size-4 text-muted-foreground" /> : <Send className="size-3.5 text-muted-foreground" />}
      </span>
    </div>
  );
}

function Reader({ i, me, label, starred, onStar, onBack, onReply, onForward }: { i: Item; me: string | null; label: string; starred: boolean; onStar: () => void; onBack: () => void; onReply: () => void; onForward: () => void }) {
  const m = i.mail!;
  const doc = `<!doctype html><html><head><meta charset="utf-8"><base target="_blank"><style>body{margin:0;padding:4px 0 20px;font-family:system-ui,sans-serif;color:#161514;line-height:1.55;font-size:14px}img{max-width:100%}</style></head><body>${m.body}</body></html>`;
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1 border-b border-border px-3 py-1.5">
        <button onClick={onBack} aria-label="Back to the list" className="group grid size-8 place-items-center rounded-full hover:bg-sand/60">
          <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-0.5" />
        </button>
        <span className="ml-auto flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
          {m.status !== "received" && (
            <span title={m.error ?? undefined} className={cn("rounded-full px-2 py-0.5", m.status === "sent" ? "bg-mint/60" : m.status === "failed" ? "bg-tomato/30" : "bg-sand")}>
              {m.status === "sent" ? "Delivered" : m.status === "outbox" ? "Stored, not sent" : m.status === "failed" ? "Failed" : "Sending"}
            </span>
          )}
          {m.provider && <span>via {m.provider}</span>}
        </span>
      </div>
      <div className="px-6 pt-5">
        <div className="flex items-start gap-3">
          <h2 className="min-w-0 flex-1 text-[22px] leading-snug">{m.subject}</h2>
          <button onClick={onStar} aria-label={starred ? "Unstar" : "Star"} className="grid size-8 place-items-center rounded-full hover:bg-sand/60">
            <Star className={cn("size-4", starred ? "fill-sun" : "text-muted-foreground")} />
          </button>
        </div>
        <div className="mt-1 flex flex-wrap gap-1.5">
          <span className="rounded-[4px] bg-sand px-1.5 py-0.5 text-[11px]">{label}</span>
          <span className={cn("rounded-[4px] border border-ink/50 px-1.5 py-0.5 text-[11px]", COLOR[i.group])}>{LABELS.find((l) => l.key === i.group)?.label}</span>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <span className={cn("grid size-10 shrink-0 place-items-center rounded-full border-[1.5px] border-ink font-display text-xs font-bold", i.received ? avatarColor(i.who) : "bg-tomato")}>{i.received ? initials(i.who) : initials(m.sender ?? "Me")}</span>
          <div className="min-w-0 flex-1 text-sm">
            <p className="truncate">
              <span className="font-semibold">{i.received ? i.who : (m.sender ?? "You")}</span>{" "}
              <span className="text-xs text-muted-foreground">&lt;{i.received ? i.addr : (me ?? "you")}&gt;</span>
            </p>
            <p className="truncate text-xs text-muted-foreground">to {i.received ? "me" : `${i.who} <${i.addr}>`}</p>
          </div>
          <span className="shrink-0 text-xs text-muted-foreground">{when(i.at, true)}</span>
        </div>
      </div>
      <iframe title={m.subject} sandbox="allow-popups allow-popups-to-escape-sandbox" srcDoc={doc} className="mx-6 mt-3 min-h-[38vh] flex-1 border-0 bg-white" />
      <div className="flex gap-2 px-6 pb-6 pt-2">
        <motion.button whileHover={{ y: -1 }} whileTap={{ scale: 0.95 }} onClick={onReply} className="flex h-9 items-center gap-2 rounded-full border-[1.5px] border-ink/40 px-4 text-sm font-medium transition-colors hover:border-ink hover:bg-sand/40">
          <Reply className="size-4" /> Reply
        </motion.button>
        <motion.button whileHover={{ y: -1 }} whileTap={{ scale: 0.95 }} onClick={onForward} className="flex h-9 items-center gap-2 rounded-full border-[1.5px] border-ink/40 px-4 text-sm font-medium transition-colors hover:border-ink hover:bg-sand/40">
          <Forward className="size-4" /> Forward
        </motion.button>
      </div>
    </div>
  );
}

/** A draft Gemini wrote: fix the address, subject or message, then send or bin it. Nothing went out yet. */
function DraftView({ d, onBack, onDone }: { d: InboxDraft; onBack: () => void; onDone: () => void }) {
  const [to, setTo] = useState(d.to);
  const [subject, setSubject] = useState(d.subject);
  const [body, setBody] = useState(d.text);
  const [pending, start] = useTransition();
  const [which, setWhich] = useState<"send" | "discard" | null>(null);
  const act = (decision: "send" | "discard") => {
    setWhich(decision);
    start(async () => {
      const r = await decideDraftAction(d.id, decision, { to, ...(subject !== d.subject ? { subject } : {}), ...(body !== d.text ? { body } : {}) });
      setWhich(null);
      if (!r.ok) return void toast.error(r.error);
      toast.success(r.message ?? "Done");
      onDone();
    });
  };
  const line = "flex items-center gap-3 border-b border-border px-6 py-2 text-sm";
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border px-3 py-1.5">
        <button onClick={onBack} aria-label="Back to the list" className="group grid size-8 place-items-center rounded-full hover:bg-sand/60">
          <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-0.5" />
        </button>
        <span className="text-sm font-semibold">{d.title}</span>
        <span className="ml-auto rounded-full bg-tomato/15 px-2 py-0.5 font-mono text-[10.5px] text-tomato-ink">Draft by Gemini · not sent</span>
      </div>
      <label className={line}>
        <span className="w-14 text-muted-foreground">To</span>
        <input value={to} onChange={(e) => setTo(e.target.value)} type="email" placeholder="No public email found. Add one." className={cn("min-w-0 flex-1 bg-transparent outline-none", !to.trim() && "placeholder:text-tomato-ink")} />
      </label>
      <label className={line}>
        <span className="w-14 text-muted-foreground">Subject</span>
        <input value={subject} onChange={(e) => setSubject(e.target.value)} className="min-w-0 flex-1 bg-transparent font-medium outline-none" />
      </label>
      <textarea value={body} onChange={(e) => setBody(e.target.value)} aria-label="Message" className="min-h-[40vh] flex-1 resize-none bg-white px-6 py-4 text-[14px] leading-relaxed outline-none" />
      <div className="flex items-center gap-2 border-t border-border px-6 py-3">
        <motion.button whileHover={{ y: -1 }} whileTap={{ scale: 0.95 }} disabled={pending || !to.trim()} onClick={() => act("send")} title={to.trim() ? "Send it" : "Add the email address first"} className="group flex h-10 items-center gap-2 rounded-full border-[1.5px] border-ink bg-tomato px-5 text-sm font-semibold shadow-[2px_2px_0_0_#161514] disabled:opacity-40">
          {pending && which === "send" ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4 transition-transform group-hover:-translate-y-px group-hover:translate-x-px" />} Send
        </motion.button>
        <span className="text-[11px] text-muted-foreground">{subject !== d.subject || body !== d.text ? "Your edits go out with it." : "Check it, then send."}</span>
        <button disabled={pending} onClick={() => act("discard")} aria-label="Discard draft" title="Discard draft" className="ml-auto grid size-9 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-sand/60 hover:text-ink">
          {pending && which === "discard" ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
        </button>
      </div>
    </div>
  );
}

function Compose({ eventId, init, onClose }: { eventId: string; init: { to: string; subject: string; body: string }; onClose: () => void }) {
  const [v, setV] = useState(init);
  const [min, setMin] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  const send = () =>
    start(async () => {
      const r = await composeEmail(eventId, v);
      if (!r.ok) return void toast.error(r.error);
      toast.success(r.message ?? "Sent");
      onClose();
      router.refresh();
    });
  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 40 }}
      transition={{ type: "spring", stiffness: 380, damping: 32 }}
      className="absolute bottom-0 right-4 z-30 w-[min(480px,calc(100%-2rem))] overflow-hidden rounded-t-xl border-[1.5px] border-b-0 border-ink bg-card shadow-[0_-4px_24px_rgba(22,21,20,.2)]"
    >
      <div className="flex items-center gap-2 bg-ink px-4 py-2 text-sm font-semibold text-white">
        <span className="flex-1 truncate">{v.subject || "New message"}</span>
        <button onClick={() => setMin((m) => !m)} aria-label={min ? "Expand" : "Minimise"} className="rounded p-0.5 hover:bg-white/15">
          <Minus className="size-4" />
        </button>
        <button onClick={onClose} aria-label="Close" className="rounded p-0.5 hover:bg-white/15">
          <X className="size-4" />
        </button>
      </div>
      {!min && (
        <>
          <input autoFocus={!init.to} value={v.to} onChange={(e) => setV({ ...v, to: e.target.value })} placeholder="To" type="email" className="w-full border-b border-border bg-transparent px-4 py-2 text-sm outline-none" />
          <input value={v.subject} onChange={(e) => setV({ ...v, subject: e.target.value })} placeholder="Subject" className="w-full border-b border-border bg-transparent px-4 py-2 text-sm outline-none" />
          <textarea autoFocus={Boolean(init.to)} value={v.body} onChange={(e) => setV({ ...v, body: e.target.value })} rows={9} className="w-full resize-none bg-white px-4 py-3 text-sm outline-none" />
          <div className="flex items-center gap-2 border-t border-border px-4 py-2.5">
            <motion.button whileTap={{ scale: 0.95 }} disabled={pending || !v.to.trim() || !v.subject.trim() || !v.body.trim()} onClick={send} className="flex h-9 items-center gap-2 rounded-full border-[1.5px] border-ink bg-tomato px-5 text-sm font-semibold disabled:opacity-40">
              {pending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} Send
            </motion.button>
            <span className="text-[11px] text-muted-foreground">Sent from this event&apos;s mailbox and filed under its label.</span>
          </div>
        </>
      )}
    </motion.div>
  );
}

function AccountChip({ eventId, mailbox, suggestion, label }: { eventId: string; mailbox: { address: string; label: string | null } | null; suggestion: string; label: string }) {
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
      const r = await setEventMailbox(eventId, value, label);
      if (!r.ok) return void toast.error(r.error);
      toast.success(r.message ?? "Saved");
      setEditing(false);
      router.refresh();
    });
  return (
    <div className="group/acc relative flex items-center gap-2">
      {editing ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
          className="flex items-center gap-1.5"
        >
          <input ref={input} type="email" value={value} placeholder={suggestion} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => e.key === "Escape" && setEditing(false)} className="h-9 w-64 rounded-full border-[1.5px] border-ink bg-white px-3 font-mono text-xs outline-none" />
          <button type="submit" disabled={pending || !value.trim()} aria-label="Save" className="grid size-9 place-items-center rounded-full border-[1.5px] border-ink bg-mint disabled:opacity-50">
            {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
          </button>
        </form>
      ) : (
        <button
          onClick={() => {
            setValue(mailbox?.address ?? "");
            setEditing(true);
          }}
          className="flex h-10 items-center gap-2 rounded-full border-[1.5px] border-ink/20 bg-white pl-1.5 pr-3 transition-colors hover:border-ink"
        >
          <span className="grid size-7 place-items-center rounded-full border-[1.5px] border-ink bg-tomato font-display text-[10px] font-bold">{initials(mailbox?.address ?? "M")}</span>
          <span className="max-w-52 truncate font-mono text-xs">{mailbox?.address ?? "Link an email account"}</span>
          <Info className="size-3.5 text-muted-foreground" />
        </button>
      )}
      <div className="pointer-events-none absolute right-0 top-full z-30 mt-2 w-72 translate-y-1 rounded-lg border-[1.5px] border-ink bg-card p-3 text-xs leading-snug opacity-0 shadow-[2px_2px_0_0_#161514] transition-all group-hover/acc:translate-y-0 group-hover/acc:opacity-100">
        Link the society&apos;s Gmail once. Each event&apos;s inbox only shows the mail labelled for it, here <b>{label}</b>, so this event&apos;s speakers, suppliers and sponsors never mix with the others.
      </div>
    </div>
  );
}
