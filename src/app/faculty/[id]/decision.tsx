"use client";

import { useState, useTransition } from "react";
import { motion } from "motion/react";
import { Check, X } from "lucide-react";
import { toast } from "sonner";
import { facultyDecide } from "@/app/actions";
import { cn } from "@/lib/utils";

export function FacultyDecision({ id, token, preselect }: { id: string; token: string; preselect: "approve" | "reject" | null }) {
  const [choice, setChoice] = useState<"approve" | "reject" | null>(preselect);
  const [note, setNote] = useState("");
  const [done, setDone] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (done) return <motion.p initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="mt-8 rounded-xl border border-[var(--grass-6)] bg-[var(--grass-2)] p-4 text-sm font-medium text-[var(--grass-11)]">{done}. The society has been notified and the decision is in their audit log.</motion.p>;
  return (
    <div className="mt-8 space-y-3">
      <div className="grid grid-cols-2 gap-2">
        {(["approve", "reject"] as const).map((c) => (
          <motion.button key={c} whileTap={{ scale: 0.97 }} onClick={() => setChoice(c)} className={cn("flex h-12 items-center justify-center gap-2 rounded-xl border text-sm font-medium transition-colors", choice === c ? (c === "approve" ? "border-[var(--grass-9)] bg-[var(--grass-9)] text-white" : "border-[var(--red-9)] bg-[var(--red-9)] text-white") : "border-border hover:bg-accent")}>
            {c === "approve" ? <Check className="size-4" /> : <X className="size-4" />}
            {c === "approve" ? "Approve" : "Reject"}
          </motion.button>
        ))}
      </div>
      <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="Comments for the society (optional)" className="w-full rounded-xl border border-input bg-card p-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
      <button
        disabled={!choice || pending}
        onClick={() =>
          start(async () => {
            const r = await facultyDecide(id, token, choice!, note);
            if (!r.ok) return void toast.error(r.error);
            setDone(r.message ?? "Recorded");
          })
        }
        className="h-11 w-full rounded-xl bg-primary font-medium text-primary-foreground disabled:opacity-50"
      >
        {pending ? "Submitting…" : "Submit decision"}
      </button>
    </div>
  );
}
