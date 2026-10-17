"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A guest walks up and holds their ticket QR to the camera. Used when there is
 * no camera (or to train door staff): the ticket is a real one from the list
 * and the check-in is real, only the guest is drawn.
 */
export function ScanGuest({ name, ticket, onScanned }: { name: string; ticket: string; onScanned: () => Promise<boolean> }) {
  const [qr, setQr] = useState<string | null>(null);
  const [phase, setPhase] = useState<"walk" | "scan" | "lock" | "done">("walk");

  useEffect(() => {
    let alive = true;
    import("qrcode").then((Q) => Q.toDataURL(ticket, { margin: 1, width: 220, color: { dark: "#161514", light: "#ffffff" } }).then((u) => alive && setQr(u)));
    return () => {
      alive = false;
    };
  }, [ticket]);

  useEffect(() => {
    if (!qr) return;
    const t1 = setTimeout(() => setPhase("scan"), 1100);
    const t2 = setTimeout(async () => {
      setPhase("lock");
      const ok = await onScanned();
      setPhase(ok ? "done" : "scan");
    }, 2300);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qr]);

  const locked = phase === "lock" || phase === "done";
  return (
    <div className="relative aspect-video w-full overflow-hidden bg-[radial-gradient(ellipse_at_50%_20%,#4a3f35_0%,#231e1a_60%,#161514_100%)]">
      {/* The doorway behind: a soft queue of people waiting their turn. */}
      <div aria-hidden className="absolute inset-x-0 bottom-0 flex items-end justify-center gap-6 opacity-30 blur-[2px]">
        {[0.8, 1, 0.9, 0.75].map((s, i) => (
          <motion.span key={i} animate={{ y: [0, -3, 0] }} transition={{ duration: 2.4 + i * 0.3, repeat: Infinity, ease: "easeInOut" }} className="block rounded-t-full bg-[#8a7a6a]" style={{ width: 70 * s, height: 150 * s }} />
        ))}
      </div>
      <div aria-hidden className="absolute inset-x-0 top-0 h-10 bg-gradient-to-b from-black/40 to-transparent" />

      {/* The guest's hand and phone, walking into frame. */}
      <motion.div
        initial={{ x: 220, y: 260, rotate: 14 }}
        animate={phase === "done" ? { x: 240, y: 300, rotate: 18 } : { x: 0, y: 0, rotate: -3 }}
        transition={{ type: "spring", stiffness: 70, damping: 14, delay: phase === "done" ? 1.6 : 0 }}
        className="absolute left-1/2 top-1/2 -ml-[70px] -mt-[110px]"
      >
        <svg width="190" height="300" viewBox="0 0 190 300" className="absolute -left-6 top-32 drop-shadow-xl" aria-hidden>
          <path d="M40 40 C20 60 18 120 30 170 L60 300 L150 300 L150 150 C150 110 140 70 120 50 Z" fill="#c68a5e" />
          <path d="M120 50 C135 40 150 52 148 70 L140 120" fill="none" stroke="#a96f47" strokeWidth="4" strokeLinecap="round" />
        </svg>
        <div className="relative w-[140px] rounded-[22px] border-[3px] border-[#161514] bg-[#161514] p-1.5 shadow-2xl">
          <div className="rounded-[16px] bg-white px-2.5 pb-3 pt-2 text-center">
            <p className="mono-label text-[7px] text-tomato">Movents ticket</p>
            <p className="mt-0.5 truncate text-[9px] font-semibold text-ink">{name}</p>
            {qr ? <img src={qr} alt="" className="mx-auto mt-1.5 size-[104px]" /> : <div className="mx-auto mt-1.5 size-[104px] rounded bg-sand" />}
            <p className="mt-1 font-mono text-[8px] text-muted-foreground">{ticket}</p>
          </div>
        </div>
      </motion.div>

      {/* Scanner frame. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 grid place-items-center">
        <motion.div animate={{ scale: phase === "scan" ? 0.94 : 1 }} transition={{ type: "spring", stiffness: 200, damping: 18 }} className="relative size-52">
          {["left-0 top-0 border-l-[4px] border-t-[4px] rounded-tl-2xl", "right-0 top-0 border-r-[4px] border-t-[4px] rounded-tr-2xl", "bottom-0 left-0 border-b-[4px] border-l-[4px] rounded-bl-2xl", "bottom-0 right-0 border-b-[4px] border-r-[4px] rounded-br-2xl"].map((c) => (
            <span key={c} className={cn("absolute size-10 transition-colors duration-300", c, locked ? "border-[#46a758]" : "border-white/90")} />
          ))}
          {!locked && <motion.span className="absolute inset-x-3 h-0.5 bg-tomato shadow-[0_0_12px_#ff5a36]" animate={{ top: ["8%", "92%", "8%"] }} transition={{ duration: phase === "scan" ? 1.1 : 2.2, repeat: Infinity, ease: "easeInOut" }} />}
          {locked && <motion.span initial={{ opacity: 0.8, scale: 1 }} animate={{ opacity: 0, scale: 1.35 }} transition={{ duration: 0.6 }} className="absolute inset-0 rounded-2xl border-4 border-[#46a758]" />}
        </motion.div>
      </div>

      <span className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-black/50 px-2.5 py-1 font-mono text-[10px] text-white">
        <span className={cn("size-1.5 rounded-full", locked ? "bg-[#46a758]" : "animate-pulse bg-tomato")} />
        {phase === "walk" ? "Waiting for a ticket" : phase === "scan" ? "Reading QR…" : phase === "lock" ? "Ticket found" : "Checked in"}
      </span>
      {phase === "done" && (
        <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 500, damping: 16 }} className="absolute right-3 top-3 grid size-7 place-items-center rounded-full bg-[#46a758] text-white">
          <Check className="size-4" />
        </motion.span>
      )}
    </div>
  );
}
