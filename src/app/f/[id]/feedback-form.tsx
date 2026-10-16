"use client";

import { useState, useTransition } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Heart } from "lucide-react";
import { toast } from "sonner";
import { submitFeedback } from "@/app/actions";
import { Stars } from "@/components/app/people-forms";
import { cn } from "@/lib/utils";

export function FeedbackForm({ eventId }: { eventId: string }) {
  const [nps, setNps] = useState<number | null>(null);
  const [rating, setRating] = useState<number | null>(null);
  const [f, setF] = useState({ name: "", liked: "", improve: "" });
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();
  return (
    <AnimatePresence mode="wait">
      {done ? (
        <motion.div key="done" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="mt-10 text-center">
          <motion.div initial={{ scale: 0 }} animate={{ scale: [0, 1.3, 1] }} transition={{ duration: 0.5 }}><Heart className="mx-auto size-10 fill-[var(--red-9)] text-[var(--red-9)]" /></motion.div>
          <p className="mt-3 font-semibold">Thank you!</p>
        </motion.div>
      ) : (
        <motion.form
          key="form"
          exit={{ opacity: 0 }}
          onSubmit={(e) => {
            e.preventDefault();
            if (nps == null || rating == null) return void toast.error("Please answer both scores");
            start(async () => {
              const r = await submitFeedback(eventId, { ...f, nps, rating });
              if (!r.ok) return void toast.error(r.error);
              setDone(true);
            });
          }}
          className="mt-8 space-y-6"
        >
          <div>
            <p className="text-sm font-medium">How likely are you to recommend our events to a friend? (0 to 10)</p>
            <div className="mt-2 grid grid-cols-11 gap-1">
              {Array.from({ length: 11 }, (_, i) => (
                <motion.button
                  type="button"
                  key={i}
                  whileHover={{ y: -2 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={() => setNps(i)}
                  className={cn("h-10 rounded-lg border text-sm font-medium tabular transition-colors", nps === i ? (i >= 9 ? "border-[var(--grass-9)] bg-[var(--grass-9)] text-white" : i >= 7 ? "border-[var(--amber-9)] bg-[var(--amber-9)] text-[var(--amber-12)]" : "border-[var(--red-9)] bg-[var(--red-9)] text-white") : "border-border hover:bg-accent")}
                >
                  {i}
                </motion.button>
              ))}
            </div>
            <div className="mt-1 flex justify-between text-[11px] text-muted-foreground"><span>Not likely</span><span>Very likely</span></div>
          </div>
          <div>
            <p className="text-sm font-medium">Overall rating</p>
            <div className="mt-2 [&_svg]:size-7"><Stars value={rating} onChange={setRating} /></div>
          </div>
          <textarea placeholder="What did you like?" value={f.liked} onChange={(e) => setF({ ...f, liked: e.target.value })} rows={3} className="w-full rounded-lg border border-input bg-card p-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
          <textarea placeholder="What should we improve?" value={f.improve} onChange={(e) => setF({ ...f, improve: e.target.value })} rows={3} className="w-full rounded-lg border border-input bg-card p-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
          <input placeholder="Name (optional)" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className="h-10 w-full rounded-lg border border-input bg-card px-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
          <motion.button whileTap={{ scale: 0.97 }} disabled={pending} className="h-11 w-full rounded-xl bg-primary font-medium text-primary-foreground">{pending ? "Sending…" : "Submit feedback"}</motion.button>
        </motion.form>
      )}
    </AnimatePresence>
  );
}
