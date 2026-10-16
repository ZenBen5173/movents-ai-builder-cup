"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Plus } from "lucide-react";
import { toast } from "sonner";
import { motion } from "motion/react";
import { setEventMember } from "@/app/actions";
import { SharedTooltipAvatars } from "@/components/ui/shared-tooltip-avatars";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ROLE_BAND } from "@/components/ep/kit";
import { cn } from "@/lib/utils";
import type { Role } from "@/lib/types";

type Person = { id: string; name: string; role: Role; department: string | null };

/** Avatar stack of who is on the event, plus a picker to add or remove people. */
export function EventTeam({ eventId, team, leadId, people, canEdit }: { eventId: string; team: string[]; leadId: string | null; people: Person[]; canEdit: boolean }) {
  const router = useRouter();
  const [, start] = useTransition();
  const [q, setQ] = useState("");
  const [ids, toggle] = useOptimistic(team, (s, id: string) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const byId = new Map(people.map((p) => [p.id, p]));
  const members = ids.map((id) => byId.get(id)).filter(Boolean) as Person[];
  const shown = people.filter((p) => p.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="flex items-center gap-2">
      <SharedTooltipAvatars
        size={30}
        items={members.map((m) => ({ id: m.id, name: m.name, sub: m.id === leadId ? "lead" : (m.department ?? m.role), className: ROLE_BAND[m.role].bg }))}
      />
      {canEdit && (
        <Popover>
          <PopoverTrigger asChild>
            <button aria-label="Add people" className="grid size-[30px] place-items-center rounded-full border-[1.5px] border-dashed border-ink/50 text-muted-foreground transition-all hover:rotate-90 hover:border-solid hover:border-ink hover:bg-sun hover:text-ink">
              <Plus className="size-4" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-72 rounded-xl border-[1.5px] border-ink p-2 shadow-[3px_3px_0_0_#161514]">
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people" className="mb-1 h-9 w-full rounded-lg border-[1.5px] border-ink/20 bg-card px-2.5 text-sm outline-none focus:border-ink" />
            <ul className="max-h-72 overflow-y-auto">
              {shown.map((p, i) => {
                const on = ids.includes(p.id);
                const lead = p.id === leadId;
                return (
                  <motion.li key={p.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.025 }}>
                    <button
                      disabled={lead}
                      onClick={() =>
                        start(async () => {
                          toggle(p.id);
                          const r = await setEventMember(eventId, p.id, !on);
                          if (!r.ok) toast.error(r.error);
                          router.refresh();
                        })
                      }
                      className="group flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm transition-colors hover:bg-sand/60 disabled:cursor-default"
                    >
                      <span className={cn("grid size-7 shrink-0 place-items-center rounded-full font-display text-[11px] font-bold ring-[1.5px] ring-ink", ROLE_BAND[p.role].bg)}>
                        {p.name.split(/\s+/).slice(0, 2).map((w) => w[0]).join("")}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{p.name}</span>
                        <span className="block truncate font-mono text-[10px] uppercase text-muted-foreground">{lead ? "lead" : (p.department ?? p.role)}</span>
                      </span>
                      <span className={cn("grid size-5 place-items-center rounded-md border-[1.5px] border-ink transition-colors", on ? "bg-ink text-white" : "group-hover:bg-sun")}>{on && <Check className="size-3" />}</span>
                    </button>
                  </motion.li>
                );
              })}
            </ul>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
