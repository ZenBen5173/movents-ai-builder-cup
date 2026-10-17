"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { Camera, CameraOff, Search, UserRound } from "lucide-react";
import { toast } from "sonner";
import { checkIn, checkInByTicket } from "@/app/actions";
import { fireConfetti } from "@/components/ep/kit";
import { Pill } from "@/components/app/ui";
import { cn } from "@/lib/utils";
import { SPRING } from "@/lib/motion";
import type { Rsvp } from "@/lib/types";
import { ScanGuest } from "@/components/app/scan-guest";

type TabId = "all" | "in" | "out" | "waitlist" | "absent";
const TABS: { id: TabId; label: string; test: (r: Rsvp) => boolean }[] = [
  { id: "all", label: "All", test: () => true },
  { id: "in", label: "Checked in", test: (r) => r.checked_in },
  { id: "out", label: "Not yet", test: (r) => r.status === "going" && !r.checked_in },
  { id: "waitlist", label: "Waitlist", test: (r) => r.status === "waitlist" && !r.checked_in },
  { id: "absent", label: "Not coming", test: (r) => r.status === "cancelled" && !r.checked_in },
];
const rank = (r: Rsvp) => (r.checked_in ? 1 : r.status === "going" ? 0 : r.status === "waitlist" ? 2 : 3);
const hhmm = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kuala_Lumpur" }) : "");
/** Name, status, time in, action: same widths on every row so the columns line up. */
const COLS = "grid grid-cols-[minmax(0,1fr)_112px] items-center gap-3 sm:grid-cols-[minmax(0,1fr)_96px_56px_112px]";

type Welcome = { name: string; ticket?: string; note?: string | null; at: string; again?: boolean };

/** The unmistakable "you're in": a stamped ticket with the guest's name and the time. */
function WelcomeCard({ w }: { w: Welcome }) {
  return (
    <motion.div
      key={w.name + w.at}
      initial={{ opacity: 0, y: -10, scale: 0.9, rotate: -2 }}
      animate={{ opacity: 1, y: 0, scale: 1, rotate: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ type: "spring", stiffness: 420, damping: 24 }}
      role="status"
      className="relative mt-3 flex items-center gap-4 overflow-hidden rounded-2xl border-[1.5px] border-ink bg-mint px-5 py-4 shadow-[3px_3px_0_0_#161514]"
    >
      <motion.span initial={{ scale: 0, rotate: -40 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 500, damping: 14, delay: 0.08 }} className="grid size-12 shrink-0 place-items-center rounded-full border-[1.5px] border-ink bg-[#46a758] text-white">
        <svg viewBox="0 0 24 24" className="size-7" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <motion.path d="M5 12.5l4.5 4.5L19 7.5" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.35, delay: 0.2 }} />
        </svg>
      </motion.span>
      <div className="min-w-0 flex-1">
        <p className="mono-label text-[10px] text-ink/60">{w.again ? "Already checked in" : "Checked in"} · {w.at}</p>
        <p className="truncate font-display text-2xl font-bold leading-tight">{w.name}</p>
        {(w.ticket || w.note) && <p className="truncate text-xs text-ink/70">{[w.ticket, w.note].filter(Boolean).join(" · ")}</p>}
      </div>
      <motion.span initial={{ opacity: 0, scale: 1.8, rotate: -18 }} animate={{ opacity: 1, scale: 1, rotate: -12 }} transition={{ delay: 0.25, type: "spring", stiffness: 300, damping: 12 }} className="hidden shrink-0 rounded-lg border-[3px] border-[#2f7a3c] px-2 py-0.5 font-display text-lg font-black uppercase tracking-wider text-[#2f7a3c] sm:block">
        Welcome
      </motion.span>
    </motion.div>
  );
}

/** Door check-in: search a name and tap, or point the laptop webcam at a ticket QR. */
export function CheckinClient({ eventId, title, rows }: { eventId: string; title: string; rows: Rsvp[] }) {
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<TabId>("all");
  const [scan, setScan] = useState(false);
  const [flash, setFlash] = useState<Welcome | null>(null);
  // No camera (or practising): a drawn guest shows a real ticket from the list.
  const [guest, setGuest] = useState<Rsvp | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const going = rows.filter((r) => r.status === "going");
  const inn = rows.filter((r) => r.checked_in).length;
  const counts = useMemo(() => Object.fromEntries(TABS.map((t) => [t.id, rows.filter(t.test).length])) as Record<TabId, number>, [rows]);
  const tabs = TABS.filter((t) => t.id !== "waitlist" || counts.waitlist > 0);
  const list = useMemo(() => {
    const test = TABS.find((t) => t.id === tab)!.test;
    const needle = q.trim().toLowerCase();
    return rows
      .filter((r) => test(r) && (!needle || r.name.toLowerCase().includes(needle) || r.email.toLowerCase().includes(needle)))
      .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name))
      .slice(0, 120);
  }, [rows, q, tab]);

  const now = () => new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kuala_Lumpur" });
  const celebrate = (w: Omit<Welcome, "at">) => {
    setFlash({ ...w, at: now() });
    if (!w.again) fireConfetti();
    navigator.vibrate?.(60);
    setTimeout(() => setFlash((f) => (f?.name === w.name ? null : f)), 4500);
  };
  const nextGuest = () => rows.find((r) => r.status === "going" && !r.checked_in && r.id !== guest?.id) ?? null;

  const byName = (r: Rsvp) =>
    start(async () => {
      const res = await checkIn(r.id, !r.checked_in);
      if (!res.ok) return void toast.error(res.error);
      if (!r.checked_in) celebrate({ name: r.name, ticket: r.ticket, note: [r.dietary, r.accessibility].filter(Boolean).join(" · ") || null });
      router.refresh();
    });

  useEffect(() => {
    if (!scan) return;
    let stream: MediaStream | null = null;
    let raf = 0;
    let last = "";
    let busy = false;
    // jsQR is only needed while scanning, so it is loaded on demand.
    let jsQR: typeof import("jsqr").default | null = null;
    const tick = async () => {
      const v = video.current;
      const c = canvas.current;
      if (v && c && jsQR && v.readyState >= 2 && !busy) {
        const w = 480;
        const h = Math.round((v.videoHeight / v.videoWidth) * w) || 360;
        c.width = w;
        c.height = h;
        const ctx = c.getContext("2d", { willReadFrequently: true })!;
        ctx.drawImage(v, 0, 0, w, h);
        const code = jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: "dontInvert" });
        const ticket = code?.data.match(/T-[A-Z0-9-]+/i)?.[0];
        if (ticket && ticket !== last) {
          last = ticket;
          busy = true;
          const res = await checkInByTicket(eventId, ticket);
          if (res.ok) {
            const r = rows.find((x) => x.ticket.toUpperCase() === ticket.toUpperCase());
            celebrate({ name: r?.name ?? res.message?.replace(/ (was already )?checked in$/, "") ?? ticket, ticket, note: r ? [r.dietary, r.accessibility].filter(Boolean).join(" · ") || null : null, again: /already/.test(res.message ?? "") });
            router.refresh();
          } else toast.error(res.error);
          setTimeout(() => {
            busy = false;
            last = "";
          }, 2500);
        }
      }
      raf = requestAnimationFrame(tick);
    };
    (async () => {
      try {
        const [media, mod] = await Promise.all([navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false }), import("jsqr")]);
        stream = media;
        jsQR = mod.default;
        if (video.current) {
          video.current.srcObject = stream;
          await video.current.play();
        }
        raf = requestAnimationFrame(tick);
      } catch {
        // No camera here: show how a scan works with the next guest on the list.
        const g = nextGuest();
        if (g) setGuest(g);
        else {
          toast.error("Camera unavailable");
          setScan(false);
        }
      }
    })();
    return () => {
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scan]);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mono-label text-tomato">Door check-in</p>
          <h1 className="mt-1 font-display text-3xl font-bold tracking-tight">{title}</h1>
        </div>
        <div className="text-right">
          <motion.p key={inn} initial={{ scale: 1.15 }} animate={{ scale: 1 }} className="font-display text-5xl font-bold leading-none tabular">
            {inn}<span className="text-2xl text-muted-foreground">/{going.length}</span>
          </motion.p>
          <p className="mono-label text-[10px] text-muted-foreground">in</p>
        </div>
      </div>
      <div className="mt-4 h-2.5 overflow-hidden rounded-full border-[1.5px] border-ink bg-card">
        <motion.div className="h-full bg-[#46a758]" initial={{ width: 0 }} animate={{ width: `${going.length ? (inn / going.length) * 100 : 0}%` }} />
      </div>

      <div className="mt-6 flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-3.5 size-5 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name" autoFocus className="h-12 w-full rounded-xl border-[1.5px] border-ink bg-card pl-11 pr-3 text-base outline-none focus:shadow-[3px_3px_0_0_#ff5a36]" />
        </div>
        <motion.button whileTap={{ scale: 0.95 }} onClick={() => {
            setScan((s) => !s);
            setGuest(null);
          }} className={cn("flex h-12 items-center gap-2 rounded-xl border-[1.5px] border-ink px-4 text-sm font-semibold", scan ? "bg-ink text-white" : "bg-tomato shadow-[2px_2px_0_0_#161514]")}>
          {scan ? <CameraOff className="size-5" /> : <Camera className="size-5" />}
          {scan ? "Stop" : "Scan QR"}
        </motion.button>
      </div>

      <AnimatePresence mode="wait">{flash && <WelcomeCard w={flash} />}</AnimatePresence>
      <AnimatePresence>
        {scan && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="relative mt-3 overflow-hidden rounded-2xl border-[1.5px] border-ink bg-ink">
              {guest ? (
                <ScanGuest
                  key={guest.id}
                  name={guest.name}
                  ticket={guest.ticket}
                  onScanned={async () => {
                    const res = await checkInByTicket(eventId, guest.ticket);
                    if (!res.ok) {
                      toast.error(res.error);
                      return false;
                    }
                    celebrate({ name: guest.name, ticket: guest.ticket, note: [guest.dietary, guest.accessibility].filter(Boolean).join(" · ") || null });
                    router.refresh();
                    return true;
                  }}
                />
              ) : (
                <>
                  <video ref={video} playsInline muted className="aspect-video w-full -scale-x-100 object-cover" />
                  <div aria-hidden className="pointer-events-none absolute inset-0 grid place-items-center">
                    <div className="relative size-48 rounded-2xl border-[3px] border-white/90">
                      <motion.span className="absolute inset-x-2 h-0.5 bg-tomato" animate={{ top: ["8%", "92%", "8%"] }} transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }} />
                    </div>
                  </div>
                </>
              )}
              <canvas ref={canvas} className="hidden" />
              <motion.button
                whileHover={{ y: -1 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => {
                  const g = nextGuest();
                  if (g) setGuest(g);
                  else toast.message("Everyone on the list is in");
                }}
                className="absolute bottom-3 right-3 flex h-8 items-center gap-1.5 rounded-full border-[1.5px] border-white/70 bg-black/50 px-3 text-xs font-semibold text-white backdrop-blur transition-colors hover:bg-black/70"
              >
                <UserRound className="size-3.5" /> {guest ? "Next guest" : "Practice with a sample guest"}
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>


      <div className="mt-6 flex gap-5 overflow-x-auto border-b-[1.5px] border-ink scrollbar-thin">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className={cn("relative shrink-0 whitespace-nowrap pb-2.5 text-sm transition-colors", tab === t.id ? "font-semibold text-ink" : "text-muted-foreground hover:text-ink")}>
            {t.label}
            <span className={cn("ml-1.5 rounded-md px-1.5 py-0.5 font-mono text-[11px] tabular", tab === t.id ? (t.id === "in" ? "bg-mint" : t.id === "absent" ? "bg-peach" : "bg-sun") : "bg-sand/70")}>{counts[t.id]}</span>
            {tab === t.id && <motion.span layoutId="checkin-tab" className="absolute inset-x-0 -bottom-[1.5px] h-[3px] rounded-t bg-tomato" transition={SPRING.default} />}
          </button>
        ))}
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border-[1.5px] border-ink bg-card">
        <ul key={tab}>
          <AnimatePresence initial={false}>
            {list.map((r, i) => (
              <motion.li
                key={r.id}
                layout
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0, transition: { delay: Math.min(i, 14) * 0.025 } }}
                exit={{ opacity: 0, x: 40 }}
                className={cn(COLS, "border-b border-ink/10 px-4 py-2.5 transition-colors last:border-b-0 hover:bg-sand/40")}
              >
                <span className="min-w-0">
                  <span className={cn("block truncate text-[15px] font-medium", r.checked_in && "text-muted-foreground")}>{r.name}</span>
                  {(r.dietary || r.accessibility) && <span className="block truncate text-xs text-muted-foreground">{[r.dietary, r.accessibility].filter(Boolean).join(" · ")}</span>}
                </span>
                <span className="hidden sm:block">
                  {r.checked_in ? <Pill status="ok" label="in" /> : <Pill status={r.status === "going" ? "pending" : r.status} label={r.status === "going" ? "not yet" : r.status === "cancelled" ? "not coming" : undefined} />}
                </span>
                <span className="hidden font-mono text-xs tabular text-muted-foreground sm:block">{hhmm(r.checked_in_at)}</span>
                <motion.button
                  whileTap={{ scale: 0.92 }}
                  whileHover={{ y: -1 }}
                  disabled={pending}
                  onClick={() => byName(r)}
                  title={r.checked_in ? "Undo" : undefined}
                  className={cn("h-10 w-full rounded-xl border-[1.5px] border-ink px-3 text-sm font-semibold transition-colors", r.checked_in ? "bg-mint hover:bg-peach" : "bg-card hover:bg-tomato")}
                >
                  {r.checked_in ? "✓ In" : "Check in"}
                </motion.button>
              </motion.li>
            ))}
          </AnimatePresence>
          {list.length === 0 && <li className="py-10 text-center text-sm text-muted-foreground">{q ? "No match" : "Nobody here"}</li>}
        </ul>
      </div>
    </div>
  );
}
