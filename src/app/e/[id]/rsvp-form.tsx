"use client";

import { useEffect, useState, useTransition } from "react";
import { AnimatePresence, motion } from "motion/react";
import { PartyPopper } from "lucide-react";
import { toast } from "sonner";
import { registerRsvp } from "@/app/actions";
import type { Rsvp } from "@/lib/types";

const input = "h-10 w-full rounded-lg border border-input bg-card px-3 text-sm outline-none transition-shadow focus:ring-2 focus:ring-ring";

export function RsvpForm({ eventId, full }: { eventId: string; full: boolean }) {
  const [f, setF] = useState({ name: "", email: "", dietary: "", accessibility: "" });
  const [ticket, setTicket] = useState<Rsvp | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  useEffect(() => {
    if (!ticket) return;
    let alive = true;
    // qrcode is only needed once a ticket exists, so it is loaded on demand.
    import("qrcode")
      .then((QRCode) => QRCode.toDataURL(ticket.ticket, { margin: 1, width: 240 }))
      .then((url) => alive && setQr(url))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [ticket]);
  return (
    <div className="relative rounded-2xl border-[1.5px] border-ink bg-card p-5 shadow-[4px_4px_0_0_#161514]">
      <AnimatePresence mode="wait">
        {ticket ? (
          <motion.div key="ticket" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="text-center">
            <PartyPopper className="mx-auto size-8 text-primary" />
            <p className="mt-2 font-semibold">{ticket.status === "waitlist" ? "You're on the waitlist" : "You're in!"}</p>
            <p className="text-xs text-muted-foreground">Show this QR at the door.</p>
            { }
            {qr && <img src={qr} alt={`Ticket ${ticket.ticket}`} className="mx-auto mt-3 size-48 rounded-lg bg-white p-2" />}
            <p className="mt-2 font-mono text-sm">{ticket.ticket}</p>
          </motion.div>
        ) : (
          <motion.form
            key="form"
            exit={{ opacity: 0, scale: 0.97 }}
            onSubmit={(e) => {
              e.preventDefault();
              start(async () => {
                const r = await registerRsvp(eventId, f);
                if (!r.ok) return void toast.error(r.error);
                toast.success(r.message);
                setTicket(r.data as Rsvp);
              });
            }}
            className="space-y-2.5"
          >
            <p className="font-semibold">{full ? "Join the waitlist" : "Register"}</p>
            <input required placeholder="Full name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className={input} />
            <input required type="email" placeholder="Student email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} className={input} />
            <select value={f.dietary} onChange={(e) => setF({ ...f, dietary: e.target.value })} className={input}>
              <option value="">Dietary needs, none</option>
              <option>Vegetarian</option>
              <option>Vegan</option>
              <option>No beef</option>
              <option>Nut allergy</option>
              <option>Gluten-free</option>
            </select>
            <input placeholder="Accessibility needs (optional)" value={f.accessibility} onChange={(e) => setF({ ...f, accessibility: e.target.value })} className={input} />
            <motion.button whileTap={{ scale: 0.97 }} disabled={pending} className="h-10 w-full rounded-lg bg-primary text-sm font-medium text-primary-foreground shadow-sm shadow-primary/30">
              {pending ? "Registering…" : full ? "Join waitlist" : "Get my ticket"}
            </motion.button>
            <p className="text-[11px] leading-snug text-muted-foreground">
              The organisers see your details to run this event. See the <a href="/privacy" className="underline underline-offset-2">Privacy Policy</a>.
            </p>
          </motion.form>
        )}
      </AnimatePresence>
    </div>
  );
}
