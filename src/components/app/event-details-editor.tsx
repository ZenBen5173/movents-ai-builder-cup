"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { Loader2, PencilLine } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { updateEventBasics } from "@/app/actions";

type Basics = { title: string; topic: string | null; date: string; start_time: string; end_time: string; pax: number; budget_cap: number };

/** Edit an event's basics by hand. Movi (the helper in the corner) can make the same changes from a sentence. */
export function EventDetailsEditor({ eventId, ev }: { eventId: string; ev: Basics }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ ...ev, topic: ev.topic ?? "", pax: String(ev.pax), budget_cap: String(ev.budget_cap) });
  const [pending, start] = useTransition();
  const router = useRouter();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((x) => ({ ...x, [k]: e.target.value }));

  function save() {
    start(async () => {
      const r = await updateEventBasics(eventId, { title: f.title, topic: f.topic, date: f.date, start_time: f.start_time, end_time: f.end_time, pax: Number(f.pax), budget_cap: Number(f.budget_cap) });
      if (!r.ok) return void toast.error(r.error);
      toast.success(r.message ?? "Saved");
      setOpen(false);
      router.refresh();
    });
  }

  const field = "h-9 w-full rounded-lg border-[1.5px] border-ink/20 bg-background px-2.5 text-sm outline-none transition-colors focus:border-ink";
  const label = "mono-label mb-1 block text-[10px] text-muted-foreground";
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setF({ ...ev, topic: ev.topic ?? "", pax: String(ev.pax), budget_cap: String(ev.budget_cap) });
      }}
    >
      <DialogTrigger asChild>
        <motion.button whileTap={{ scale: 0.94 }} className="group flex h-11 items-center gap-2 rounded-xl border-[1.5px] border-ink/25 px-3 text-sm font-medium text-ink/70 transition-colors hover:border-ink hover:text-ink">
          <PencilLine className="size-4 transition-transform group-hover:-rotate-12" /> Edit details
        </motion.button>
      </DialogTrigger>
      <DialogContent className="rounded-2xl border-[1.5px] border-ink sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">Edit event details</DialogTitle>
          <DialogDescription>Change anything here. To change the plan around it (budget, timeline), re-run that tab or ask Movi.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="sm:col-span-2">
            <span className={label}>Title</span>
            <input value={f.title} onChange={set("title")} className={field} />
          </label>
          <label className="sm:col-span-2">
            <span className={label}>Topic</span>
            <input value={f.topic} onChange={set("topic")} className={field} />
          </label>
          <label>
            <span className={label}>Date</span>
            <input type="date" value={f.date} onChange={set("date")} className={field} />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label>
              <span className={label}>Start</span>
              <input type="time" value={f.start_time} onChange={set("start_time")} className={field} />
            </label>
            <label>
              <span className={label}>End</span>
              <input type="time" value={f.end_time} onChange={set("end_time")} className={field} />
            </label>
          </div>
          <label>
            <span className={label}>Expected people</span>
            <input inputMode="numeric" value={f.pax} onChange={set("pax")} className={field} />
          </label>
          <label>
            <span className={label}>Budget cap (RM)</span>
            <input inputMode="numeric" value={f.budget_cap} onChange={set("budget_cap")} className={field} />
          </label>
        </div>
        <div className="mt-2 flex justify-end gap-2">
          <button type="button" onClick={() => setOpen(false)} className="h-9 rounded-lg px-3 text-sm text-muted-foreground hover:text-ink">Cancel</button>
          <motion.button whileTap={{ scale: 0.95 }} disabled={pending} onClick={save} className="flex h-9 items-center gap-1.5 rounded-lg border-[1.5px] border-ink bg-tomato px-4 text-sm font-semibold shadow-[2px_2px_0_0_#161514] disabled:opacity-50">
            {pending && <Loader2 className="size-4 animate-spin" />} Save
          </motion.button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
