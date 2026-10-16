"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { ArrowLeftRight, Check, Phone, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { addCrew, removeCrew, setCoLead, updateCrew } from "@/app/actions-day";
import { InlineText } from "@/components/app/runsheet-editor";
import { cn } from "@/lib/utils";

export type Crew = { id: string; name: string; role: string; phone: string | null; shift: string | null; emergency: boolean };

const isOpen = (name: string) => /\(to assign\)$/i.test(name);
const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("");
const enter = "animate-in fade-in slide-in-from-bottom-1 fill-mode-backwards duration-300";

// ------------------------------------------------------------------ crew

function CrewTile({ v, index, onRemove }: { v: Crew; index: number; onRemove: () => void }) {
  const open = isOpen(v.name);
  return (
    <li
      style={{ animationDelay: `${index * 30}ms` }}
      className={cn(enter, "group relative flex items-start gap-3 rounded-lg border-[1.5px] p-2.5 transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.5", open ? "border-dashed border-ink/35 hover:border-ink" : "border-transparent hover:border-ink hover:shadow-[2px_2px_0_0_#161514]")}
    >
      <span
        className={cn(
          "grid size-10 shrink-0 place-items-center rounded-full border-[1.5px] font-display text-sm font-bold transition-transform duration-200 group-hover:-rotate-6",
          open ? "border-dashed border-ink/40 font-mono text-xs text-muted-foreground" : v.emergency ? "border-ink bg-tomato" : "border-ink bg-sand",
        )}
      >
        {open ? "?" : initials(v.name)}
      </span>
      <div className="min-w-0 flex-1">
        <InlineText label="name" value={open ? "" : v.name} placeholder="Assign" className={cn("block text-sm font-semibold", open && "font-medium")} onSave={(name) => updateCrew(v.id, { name })} />
        <InlineText label="role" value={v.role} placeholder="Role" className="block text-xs text-muted-foreground" onSave={(role) => updateCrew(v.id, { role })} />
        <div className="grid grid-rows-[0fr] transition-[grid-template-rows] duration-200 group-focus-within:grid-rows-[1fr] group-hover:grid-rows-[1fr]">
          <div className="overflow-hidden">
            <div className="flex items-center gap-1.5 pt-1 font-mono text-[11px] text-muted-foreground">
              <Phone className="size-3 shrink-0" />
              <InlineText label="phone" value={v.phone ?? ""} placeholder="Phone" allowEmpty onSave={(phone) => updateCrew(v.id, { phone })} />
              {v.shift && <span className="ml-auto shrink-0 tabular">{v.shift}</span>}
            </div>
          </div>
        </div>
      </div>
      <button
        type="button"
        aria-label={`Remove ${open ? v.role : v.name}`}
        onClick={onRemove}
        className="absolute -right-2 -top-2 grid size-6 scale-75 place-items-center rounded-full border-[1.5px] border-ink bg-card opacity-0 transition-[opacity,transform,background-color] duration-150 hover:bg-tomato focus-visible:scale-100 focus-visible:opacity-100 group-hover:scale-100 group-hover:opacity-100"
      >
        <X className="size-3" />
      </button>
    </li>
  );
}

function AddTile({ eventId, index }: { eventId: string; index: number }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const nameRef = useRef<HTMLInputElement>(null);
  const roleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) nameRef.current?.focus();
  }, [open]);

  const save = () => {
    const name = nameRef.current?.value ?? "";
    const role = roleRef.current?.value ?? "";
    if (!role.trim()) return roleRef.current?.focus();
    start(async () => {
      const r = await addCrew(eventId, { name, role });
      if (!r.ok) return void toast.error(r.error);
      if (nameRef.current) nameRef.current.value = "";
      if (roleRef.current) roleRef.current.value = "";
      nameRef.current?.focus();
    });
  };

  if (!open) {
    return (
      <li style={{ animationDelay: `${index * 30}ms` }} className={enter}>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="group flex h-full min-h-[62px] w-full items-center gap-3 rounded-lg border-[1.5px] border-dashed border-ink/35 p-2.5 text-sm text-muted-foreground transition-colors hover:border-ink hover:bg-sun/40 hover:text-ink"
        >
          <span className="grid size-10 place-items-center rounded-full border-[1.5px] border-dashed border-current transition-transform duration-200 group-hover:rotate-90">
            <Plus className="size-4" />
          </span>
          Add
        </button>
      </li>
    );
  }

  const field = "h-7 w-full rounded-md border-[1.5px] border-ink/25 bg-card px-2 text-sm outline-none transition-colors focus:border-ink";
  return (
    <li className="animate-in fade-in zoom-in-95 duration-150 rounded-lg border-[1.5px] border-ink p-2.5 shadow-[2px_2px_0_0_#161514]">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
        onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
        className={cn("flex items-center gap-2", pending && "opacity-60")}
      >
        <div className="min-w-0 flex-1 space-y-1.5">
          <input ref={nameRef} aria-label="Name" placeholder="Name" className={field} />
          <input ref={roleRef} aria-label="Role" placeholder="Role" className={cn(field, "text-xs")} />
        </div>
        <div className="flex flex-col gap-1.5">
          <button type="submit" aria-label="Add crew" disabled={pending} className="grid size-7 place-items-center rounded-md border-[1.5px] border-ink bg-mint transition-transform hover:-translate-y-px active:translate-y-0">
            <Check className="size-3.5" />
          </button>
          <button type="button" aria-label="Close" onClick={() => setOpen(false)} className="grid size-7 place-items-center rounded-md border-[1.5px] border-ink/25 transition-colors hover:border-ink">
            <X className="size-3.5" />
          </button>
        </div>
      </form>
    </li>
  );
}

export function CrewEditor({ eventId, crew }: { eventId: string; crew: Crew[] }) {
  const [gone, setGone] = useState<Set<string>>(new Set());
  const [, start] = useTransition();
  const shown = crew.filter((v) => !gone.has(v.id));

  const remove = (v: Crew) => {
    setGone((s) => new Set(s).add(v.id));
    start(async () => {
      const r = await removeCrew(v.id);
      if (!r.ok) {
        toast.error(r.error);
        setGone((s) => {
          const n = new Set(s);
          n.delete(v.id);
          return n;
        });
      }
    });
  };

  return (
    <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
      {shown.map((v, i) => (
        <CrewTile key={v.id} v={v} index={i} onRemove={() => remove(v)} />
      ))}
      <AddTile eventId={eventId} index={shown.length} />
    </ul>
  );
}

// ------------------------------------------------------------------ emergency: co-lead

type Person = { user_id: string; name: string; phone: string | null };

export function ContactChip({ tag, person, tone, children }: { tag: string; person: Person | null; tone: string; children?: React.ReactNode }) {
  const body = (
    <>
      <span className={cn("rounded-md border-[1.5px] border-ink px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider", tone)}>{tag}</span>
      <b className="font-semibold">{person?.name ?? "Not set"}</b>
      {person?.phone && (
        <span className="inline-flex items-center gap-1 font-mono text-xs text-muted-foreground transition-colors group-hover/chip:text-ink">
          <Phone className="size-3" />
          {person.phone}
        </span>
      )}
    </>
  );
  const cls = "group/chip flex h-11 items-center gap-2 rounded-xl border-[1.5px] border-ink bg-card px-3 text-sm transition-[transform,box-shadow] duration-150";
  return (
    <li className="relative flex items-center">
      {person?.phone ? (
        <a href={`tel:${person.phone.replace(/\s+/g, "")}`} className={cn(cls, "hover:-translate-y-0.5 hover:shadow-[2px_2px_0_0_#161514]")}>
          {body}
        </a>
      ) : (
        <span className={cn(cls, !person && "border-dashed text-muted-foreground")}>{body}</span>
      )}
      {children}
    </li>
  );
}

export function CoLeadChip({ eventId, colead, team }: { eventId: string; colead: Person | null; team: Person[] }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [picked, setPicked] = useState<Person | null>(colead);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => setPicked(colead), [colead]);
  useEffect(() => {
    if (!open) return;
    const off = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", off);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", off);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const choose = (p: Person | null) => {
    setOpen(false);
    const prev = picked;
    setPicked(p);
    start(async () => {
      const r = await setCoLead(eventId, p?.user_id ?? null);
      if (!r.ok) {
        setPicked(prev);
        toast.error(r.error);
      }
    });
  };

  return (
    <ContactChip tag="Co-lead" person={picked} tone="bg-sky">
      <div ref={box} className="relative">
        <button
          type="button"
          aria-label={picked ? "Change co-lead" : "Pick co-lead"}
          onClick={() => setOpen((o) => !o)}
          className={cn("ml-1 grid size-8 place-items-center rounded-lg border-[1.5px] border-ink/25 transition-[border-color,background-color,transform] hover:border-ink hover:bg-sun/50 active:scale-95", pending && "animate-pulse", open && "border-ink bg-sun/50")}
        >
          {picked ? <ArrowLeftRight className="size-3.5" /> : <Plus className="size-3.5" />}
        </button>
        {open && (
          <ul role="listbox" className="absolute left-0 top-full z-30 mt-1.5 max-h-64 w-56 origin-top-left animate-in fade-in zoom-in-95 slide-in-from-top-1 overflow-auto rounded-xl border-[1.5px] border-ink bg-card p-1 shadow-[2px_2px_0_0_#161514] duration-150">
            {team.length === 0 && <li className="px-2 py-1.5 text-xs text-muted-foreground">No one else on the team</li>}
            {team.map((p) => (
              <li key={p.user_id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={picked?.user_id === p.user_id}
                  onClick={() => choose(p)}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors hover:bg-sand"
                >
                  <span className="grid size-6 shrink-0 place-items-center rounded-full border-[1.5px] border-ink bg-sand font-display text-[10px] font-bold">{initials(p.name)}</span>
                  <span className="min-w-0 flex-1 truncate">{p.name}</span>
                  {picked?.user_id === p.user_id && <Check className="size-3.5 text-tomato-ink" />}
                </button>
              </li>
            ))}
            {picked && (
              <li className="mt-1 border-t border-ink/10 pt-1">
                <button type="button" onClick={() => choose(null)} className="w-full rounded-lg px-2 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-sand hover:text-ink">
                  Clear
                </button>
              </li>
            )}
          </ul>
        )}
      </div>
    </ContactChip>
  );
}
