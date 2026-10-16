"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { CreditCard, FileSignature, Mail, Plus, Star } from "lucide-react";
import { toast } from "sonner";
import { addSpeaker, emailVendor, payDeposit, vendorUpdate } from "@/app/actions";
import { ActionButton } from "./action-button";
import { cn } from "@/lib/utils";
import type { Vendor } from "@/lib/types";

const input = "h-8 rounded-lg border border-input bg-card px-2.5 text-sm outline-none transition-shadow focus:ring-2 focus:ring-ring";

export function AddSpeakerForm({ eventId }: { eventId: string }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: "", email: "", headline: "", source_url: "" });
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <div className="mt-3">
      <button onClick={() => setOpen((o) => !o)} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
        <Plus className={cn("size-3.5 transition-transform", open && "rotate-45")} /> Add a speaker manually
      </button>
      <AnimatePresence>
        {open && (
          <motion.form
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
            onSubmit={(e) => {
              e.preventDefault();
              start(async () => {
                const r = await addSpeaker(eventId, f);
                if (!r.ok) return void toast.error(r.error);
                toast.success("Speaker added");
                setF({ name: "", email: "", headline: "", source_url: "" });
                router.refresh();
              });
            }}
          >
            <div className="mt-2 grid gap-2 sm:grid-cols-4">
              <input required placeholder="Name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className={input} />
              <input type="email" placeholder="Email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} className={input} />
              <input placeholder="Headline" value={f.headline} onChange={(e) => setF({ ...f, headline: e.target.value })} className={input} />
              <div className="flex gap-2">
                <input placeholder="Profile URL" value={f.source_url} onChange={(e) => setF({ ...f, source_url: e.target.value })} className={cn(input, "min-w-0 flex-1")} />
                <button disabled={pending} className="h-8 rounded-lg bg-primary px-3 text-sm text-primary-foreground">Add</button>
              </div>
            </div>
          </motion.form>
        )}
      </AnimatePresence>
    </div>
  );
}

export function Stars({ value, onChange }: { value: number | null; onChange: (n: number) => void }) {
  const [hover, setHover] = useState<number | null>(null);
  const shown = hover ?? value ?? 0;
  return (
    <div className="inline-flex" onMouseLeave={() => setHover(null)}>
      {[1, 2, 3, 4, 5].map((n) => (
        <motion.button key={n} whileHover={{ scale: 1.25 }} whileTap={{ scale: 0.9 }} onMouseEnter={() => setHover(n)} onClick={() => onChange(n)} aria-label={`${n} stars`}>
          <Star className={cn("size-4 transition-colors", n <= Math.round(shown) ? "fill-[var(--amber-9)] text-[var(--amber-9)]" : "text-muted-foreground/40")} />
        </motion.button>
      ))}
    </div>
  );
}

export function VendorRowActions({ vendor, eventId, checkoutUrl }: { vendor: Vendor; eventId: string | null; checkoutUrl: string | null }) {
  const router = useRouter();
  const [mail, setMail] = useState(false);
  const [subject, setSubject] = useState(`Quotation request — ${vendor.name.split(" — ")[0]}`);
  const [body, setBody] = useState("Hello,\n\nCould you send a written quotation with availability, deposit terms and delivery details?\n\nThank you.");
  const [pending, start] = useTransition();
  const deposit = vendor.quote ? Math.max(50, Math.round(vendor.quote * 0.3)) : 0;
  return (
    <div className="relative inline-flex flex-wrap justify-end gap-1">
      <Stars
        value={vendor.rating}
        onChange={async (n) => {
          await vendorUpdate(vendor.id, { rating: n });
          toast.success(`Rated ${n}/5`);
          router.refresh();
        }}
      />
      <button onClick={() => setMail((m) => !m)} className="inline-flex h-7 items-center gap-1 rounded-lg border border-border px-2 text-xs hover:bg-accent"><Mail className="size-3.5" />Email</button>
      {vendor.contract_status !== "signed" && (
        <ActionButton action={vendorUpdate.bind(null, vendor.id, { contract_status: "signed" })} size="xs" icon={<FileSignature className="size-3.5" />}>Signed</ActionButton>
      )}
      {vendor.deposit_status === "none" && deposit > 0 && (
        <ActionButton
          action={payDeposit.bind(null, vendor.id, eventId, deposit)}
          size="xs"
          variant="primary"
          icon={<CreditCard className="size-3.5" />}
          onDone={(r) => {
            if (r.ok && r.data && typeof r.data === "object" && "url" in r.data) window.open(String((r.data as { url: string }).url), "_blank");
          }}
        >
          Deposit RM{deposit}
        </ActionButton>
      )}
      {vendor.deposit_status === "pending" && checkoutUrl && (
        <a href={checkoutUrl} target="_blank" rel="noreferrer" className="inline-flex h-7 items-center gap-1 rounded-lg bg-primary px-2 text-xs text-primary-foreground"><CreditCard className="size-3.5" />Pay now</a>
      )}
      <AnimatePresence>
        {mail && (
          <motion.form
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            onSubmit={(e) => {
              e.preventDefault();
              start(async () => {
                const r = await emailVendor(vendor.id, eventId ?? "", subject, body);
                if (r.ok) toast.success(r.message ?? "Sent");
                else toast.error(r.error);
                setMail(false);
                router.refresh();
              });
            }}
            className="absolute right-0 top-full z-20 mt-1 w-80 space-y-2 rounded-xl border border-border bg-popover p-3 text-left shadow-xl"
          >
            <input value={subject} onChange={(e) => setSubject(e.target.value)} className={cn(input, "w-full")} />
            <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={5} className="w-full rounded-lg border border-input bg-card p-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
            <p className="text-[11px] text-muted-foreground">Role-gated: committee emails go to the Logistics Director for approval.</p>
            <button disabled={pending} className="h-8 w-full rounded-lg bg-primary text-sm text-primary-foreground">{pending ? "Sending…" : "Send"}</button>
          </motion.form>
        )}
      </AnimatePresence>
    </div>
  );
}
