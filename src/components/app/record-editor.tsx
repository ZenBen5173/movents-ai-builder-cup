"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { Loader2, PencilLine, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type Res = { ok: true; message?: string } | { ok: false; error: string };
export type Field = { key: string; label: string; value: string | number | null | undefined; type?: "text" | "email" | "url" | "number" | "textarea" | "date"; placeholder?: string; wide?: boolean };

/**
 * One edit dialog for any record on an event (speaker, sponsor, supplier...):
 * the fields, Save, and optionally Remove. Only changed fields are sent.
 */
export function RecordEditor({ title, description, fields, save, remove, removeLabel = "Remove", trigger = "Edit", icon, className }: {
  title: string;
  description?: string;
  fields: Field[];
  save: (patch: Record<string, string>) => Promise<Res>;
  remove?: () => Promise<Res>;
  removeLabel?: string;
  trigger?: string;
  icon?: React.ReactNode;
  className?: string;
}) {
  const initial = () => Object.fromEntries(fields.map((f) => [f.key, f.value == null ? "" : String(f.value)]));
  const [open, setOpen] = useState(false);
  const [v, setV] = useState<Record<string, string>>(initial);
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState(false);
  const router = useRouter();

  function run(fn: () => Promise<Res>) {
    start(async () => {
      const r = await fn();
      if (!r.ok) return void toast.error(r.error);
      toast.success(r.message ?? "Saved");
      setOpen(false);
      router.refresh();
    });
  }
  const changed = () => {
    const before = initial();
    return Object.fromEntries(Object.entries(v).filter(([k, x]) => x !== before[k]));
  };
  const field = "w-full rounded-lg border-[1.5px] border-ink/20 bg-background px-2.5 text-sm outline-none transition-colors focus:border-ink";

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        setConfirm(false);
        if (o) setV(initial());
      }}
    >
      <DialogTrigger asChild>
        <button type="button" aria-label={trigger || title} title={trigger ? undefined : title} className={cn("group/edit inline-flex h-7 items-center gap-1 rounded-lg border border-ink/20 px-2 text-xs transition-colors hover:border-ink", className)}>
          {icon ?? <PencilLine className="size-3.5 transition-transform group-hover/edit:-rotate-12" />}
          {trigger}
        </button>
      </DialogTrigger>
      <DialogContent className="rounded-2xl border-[1.5px] border-ink sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          {fields.map((f) => (
            <label key={f.key} className={f.wide || f.type === "textarea" ? "sm:col-span-2" : undefined}>
              <span className="mono-label mb-1 block text-[10px] text-muted-foreground">{f.label}</span>
              {f.type === "textarea" ? (
                <textarea rows={4} value={v[f.key]} placeholder={f.placeholder} onChange={(e) => setV((x) => ({ ...x, [f.key]: e.target.value }))} className={cn(field, "resize-y py-2")} />
              ) : (
                <input type={f.type === "number" ? "text" : f.type ?? "text"} inputMode={f.type === "number" ? "decimal" : undefined} value={v[f.key]} placeholder={f.placeholder} onChange={(e) => setV((x) => ({ ...x, [f.key]: e.target.value }))} className={cn(field, "h-9")} />
              )}
            </label>
          ))}
        </div>
        <div className="mt-2 flex items-center justify-between gap-2">
          {remove ? (
            confirm ? (
              <button type="button" disabled={pending} onClick={() => run(remove)} className="flex h-9 items-center gap-1.5 rounded-lg bg-tomato-ink px-3 text-sm font-semibold text-white disabled:opacity-50">
                <Trash2 className="size-4" /> Yes, {removeLabel.toLowerCase()}
              </button>
            ) : (
              <button type="button" onClick={() => setConfirm(true)} className="flex h-9 items-center gap-1.5 rounded-lg px-2 text-sm text-muted-foreground transition-colors hover:text-tomato-ink">
                <Trash2 className="size-4" /> {removeLabel}
              </button>
            )
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button type="button" onClick={() => setOpen(false)} className="h-9 rounded-lg px-3 text-sm text-muted-foreground hover:text-ink">Cancel</button>
            <motion.button whileTap={{ scale: 0.95 }} disabled={pending} onClick={() => run(() => save(changed()))} className="flex h-9 items-center gap-1.5 rounded-lg border-[1.5px] border-ink bg-tomato px-4 text-sm font-semibold shadow-[2px_2px_0_0_#161514] disabled:opacity-50">
              {pending && <Loader2 className="size-4 animate-spin" />} Save
            </motion.button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
