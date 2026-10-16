"use client";

import { useOptimistic, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { updateTask } from "@/app/actions";
import { Icon, fireConfetti } from "@/components/ep/kit";
import { cn } from "@/lib/utils";

type Item = { id: string; title: string; due: string; overdue: boolean; blockedBy: string[]; done: boolean };

const short = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

/** Checkbox, title, date. Blocked shows as a lock; hover it to see why. */
export function UpNext({ items }: { items: Item[] }) {
  const [, start] = useTransition();
  const router = useRouter();
  const [list, set] = useOptimistic(items, (s, id: string) => s.map((i) => (i.id === id ? { ...i, done: !i.done } : i)));
  return (
    <ul>
      {list.map((x) => (
        <li key={x.id} className="flex items-center gap-3 border-b border-border py-2.5">
          <button
            aria-label="Done"
            disabled={x.blockedBy.length > 0}
            onClick={() =>
              start(async () => {
                set(x.id);
                const r = await updateTask(x.id, { status: x.done ? "todo" : "done" });
                if (!r.ok) toast.error(r.error);
                else if (!x.done) fireConfetti();
                router.refresh();
              })
            }
            className={cn("grid size-[18px] shrink-0 place-items-center rounded-[5px] border-[1.5px] border-ink", x.done ? "bg-ink text-white" : "hover:bg-sand", x.blockedBy.length > 0 && "cursor-not-allowed border-dashed opacity-60")}
          >
            {x.done && <Check className="size-3" />}
          </button>
          <span className={cn("min-w-0 flex-1 truncate text-[14.5px]", x.done && "text-muted-foreground line-through")}>{x.title}</span>
          {x.blockedBy.length > 0 && (
            <span className="group relative text-muted-foreground">
              <Icon name="lock" size={14} />
              <span className="pointer-events-none absolute bottom-full right-0 z-20 mb-2 w-max max-w-64 rounded-lg border-[1.5px] border-ink bg-card px-2 py-1 text-xs opacity-0 shadow-[2px_2px_0_0_#161514] transition-opacity group-hover:opacity-100">Waiting on {x.blockedBy.join(", ")}</span>
            </span>
          )}
          <span className={cn("w-14 text-right font-mono text-[11px]", x.overdue ? "font-bold text-tomato-ink" : "text-muted-foreground")}>{short(x.due)}</span>
        </li>
      ))}
    </ul>
  );
}
