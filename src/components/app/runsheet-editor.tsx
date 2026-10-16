"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { updateRunsheetBlock } from "@/app/actions-day";
import { cn } from "@/lib/utils";

type Res = { ok: true } | { ok: false; error: string };

/**
 * Click to edit, Enter or blur to save, Escape to cancel. Shows the new value
 * straight away and rolls back if the save fails. Kept tiny on purpose: the
 * timetable around it is server rendered.
 */
export function InlineText({
  value,
  onSave,
  className,
  placeholder,
  label,
  allowEmpty = false,
}: {
  value: string;
  onSave: (v: string) => Promise<Res>;
  className?: string;
  placeholder?: string;
  label: string;
  allowEmpty?: boolean;
}) {
  const [shown, setShown] = useState(value);
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => setShown(value), [value]);
  useEffect(() => {
    if (editing) ref.current?.select();
  }, [editing]);

  const commit = (raw: string) => {
    setEditing(false);
    const v = raw.replace(/\s+/g, " ").trim();
    if (v === shown || (!v && !allowEmpty)) return;
    const prev = shown;
    setShown(v);
    start(async () => {
      const r = await onSave(v);
      if (!r.ok) {
        setShown(prev);
        toast.error(r.error);
      }
    });
  };

  if (editing) {
    return (
      <input
        ref={ref}
        aria-label={label}
        defaultValue={shown}
        placeholder={placeholder}
        onBlur={(e) => commit(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") setEditing(false);
        }}
        className={cn("field-sizing-content -mx-1 min-w-12 max-w-full rounded-md bg-card px-1 outline-none ring-[1.5px] ring-ink", className)}
      />
    );
  }

  return (
    <button
      type="button"
      aria-label={`Edit ${label}`}
      onClick={() => setEditing(true)}
      className={cn(
        "-mx-1 max-w-full cursor-text rounded-md px-1 text-left transition-[background-color,opacity] duration-150 hover:bg-sand/70 active:scale-[0.99]",
        pending && "animate-pulse",
        !shown && "text-muted-foreground/70",
        className,
      )}
    >
      {shown || placeholder}
    </button>
  );
}

/** One field of a merged run of show block. Saves to every row underneath it. */
export function BlockField({ ids, field, value, className, placeholder }: { ids: string[]; field: "activity" | "owner" | "notes" | "location"; value: string; className?: string; placeholder?: string }) {
  return (
    <InlineText
      value={value}
      label={field}
      placeholder={placeholder}
      allowEmpty={field !== "activity"}
      className={className}
      onSave={(v) => updateRunsheetBlock(ids, { [field]: v })}
    />
  );
}
