"use client";

import { useEffect, useState, useTransition } from "react";
import { motion } from "motion/react";
import { CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { completeMockPayment } from "@/app/actions";

export function PayButton({ id, paid, provider, returned }: { id: string; paid: boolean; provider: string; returned: boolean }) {
  const [isPaid, setPaid] = useState(paid);
  const [pending, start] = useTransition();
  const confirm = () =>
    start(async () => {
      const r = await completeMockPayment(id);
      if (!r.ok) return void toast.error(r.error);
      setPaid(true);
    });
  useEffect(() => {
    // Returning from Stripe: confirm the session server-side (the webhook does the same).
    if (returned && provider === "stripe" && !paid) confirm();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (isPaid)
    return (
      <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="mt-6 flex items-center gap-2 rounded-xl bg-[var(--grass-3)] px-3 py-3 text-sm font-medium text-[var(--grass-11)]">
        <CheckCircle2 className="size-5" /> Deposit paid, recorded in the audit log.
      </motion.div>
    );
  if (provider === "stripe") return <p className="mt-6 text-sm text-muted-foreground">{pending ? "Confirming with Stripe…" : "Waiting for Stripe confirmation."}</p>;
  return (
    <motion.button whileTap={{ scale: 0.97 }} disabled={pending} onClick={confirm} className="mt-6 h-11 w-full rounded-xl bg-primary font-medium text-primary-foreground">
      {pending ? "Processing…" : "Pay deposit (simulated)"}
    </motion.button>
  );
}
