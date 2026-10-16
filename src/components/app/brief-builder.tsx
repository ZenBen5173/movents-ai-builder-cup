"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, Minus, Plus } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { ROLE_BAND } from "@/components/ep/kit";
import { cn } from "@/lib/utils";
import type { Role } from "@/lib/types";

/**
 * The brief as a sentence with blanks, like a ticket you fill in:
 * "We're putting on a [workshop] about [AI in healthcare] for [80] people on
 * [Sat 21 Nov], [in the afternoon], with [RM2,000] to spend."
 * Tap a blank to pick or type a value. The finished sentence is the brief.
 */

export type Brief = { format?: string; topic?: string; pax?: number; date?: string; time?: string; budget?: number; team: string[]; extra?: string };
type Person = { id: string; name: string; role: Role; department: string | null };

const FORMATS = ["talk", "workshop", "hackathon", "panel", "networking night", "competition", "career fair"];
const TOPICS = ["AI in healthcare", "data science", "cybersecurity", "climate tech", "startups", "UX design"];
const TIMES: { key: string; label: string; phrase: string }[] = [
  { key: "morning", label: "in the morning", phrase: "9am to 12pm" },
  { key: "afternoon", label: "in the afternoon", phrase: "2pm to 5pm" },
  { key: "evening", label: "in the evening", phrase: "7pm to 10pm" },
  { key: "full", label: "all day", phrase: "9am to 6pm" },
];
const PAX = [30, 50, 80, 100, 150, 200, 300];
const BUDGETS = [500, 1000, 2000, 3000, 5000];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const toDate = (iso: string) => new Date(`${iso}T00:00:00`);
const toIso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const showDate = (iso: string) => {
  const d = toDate(iso);
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
};
const first = (n: string) => n.replace(/^(Dr\.?)\s+/, "").split(/\s+/)[0];
const article = (w: string) => (/^[aeiou]/i.test(w) ? "an" : "a");

/** A Saturday about `days` from today. */
function saturdayIn(today: string, days: number) {
  const d = toDate(today);
  d.setDate(d.getDate() + days);
  d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7));
  return toIso(d);
}

/** The sentence sent as the brief (and shown back to the user). */
export function briefSentence(b: Brief, people: Person[]) {
  if (!b.format && !b.topic && !b.pax && !b.date && !b.budget) return b.extra?.trim() ?? "";
  const fmt = b.format ?? "event";
  const parts = [`Plan ${article(fmt)} ${fmt}${b.topic ? ` about ${b.topic}` : ""}`];
  if (b.pax) parts.push(`for ${b.pax} pax`);
  if (b.date) {
    const d = toDate(b.date);
    parts.push(`on ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`);
  }
  if (b.time) parts.push(TIMES.find((t) => t.key === b.time)?.phrase ?? "");
  if (b.budget) parts.push(`budget RM${b.budget.toLocaleString("en-MY")}`);
  const names = b.team.map((id) => people.find((p) => p.id === id)?.name).filter(Boolean) as string[];
  let s = parts.filter(Boolean).join(", ");
  if (names.length) s += `, with ${names.map(first).join(", ")}`;
  s += ".";
  if (b.extra?.trim()) s += ` ${b.extra.trim().replace(/\.?$/, ".")}`;
  return s;
}

function Blank({ filled, placeholder, children, content, wide }: { filled: boolean; placeholder: string; children?: React.ReactNode; content: (close: () => void) => React.ReactNode; wide?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <motion.button
          type="button"
          whileHover={{ y: -1 }}
          whileTap={{ scale: 0.97 }}
          className={cn(
            "relative inline-flex items-baseline rounded-md px-1 align-baseline transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tomato",
            filled ? "text-ink" : "text-ink/30",
            open ? "bg-tomato/15" : "hover:bg-tomato/10",
          )}
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.span key={filled ? String(children) : placeholder} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }}>
              {filled ? children : placeholder}
            </motion.span>
          </AnimatePresence>
          <span aria-hidden className={cn("absolute inset-x-1 -bottom-0.5 h-[3px] rounded-full", filled ? "bg-tomato" : "border-b-[3px] border-dotted border-tomato/60 bg-transparent")} />
        </motion.button>
      </PopoverTrigger>
      <PopoverContent align="start" className={cn("rounded-2xl border-[1.5px] border-ink bg-card p-3 shadow-[4px_4px_0_0_#161514]", wide ? "w-auto" : "w-72")}>
        {content(() => setOpen(false))}
      </PopoverContent>
    </Popover>
  );
}

function Options<T extends string | number>({ items, value, label, onPick }: { items: T[]; value?: T; label?: (v: T) => string; onPick: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((v, i) => (
        <motion.button
          key={String(v)}
          type="button"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1, transition: { delay: i * 0.025 } }}
          whileTap={{ scale: 0.94 }}
          onClick={() => onPick(v)}
          className={cn("rounded-full border-[1.5px] px-3 py-1 text-sm transition-colors", value === v ? "border-ink bg-ink text-white" : "border-ink/20 hover:border-ink")}
        >
          {label ? label(v) : String(v)}
        </motion.button>
      ))}
    </div>
  );
}

function Own({ placeholder, onSave, type = "text", prefix }: { placeholder: string; onSave: (v: string) => void; type?: string; prefix?: string }) {
  const [v, setV] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (v.trim()) onSave(v.trim());
      }}
      className="mt-2.5 flex items-center gap-1.5 border-t border-dashed border-ink/20 pt-2.5"
    >
      {prefix && <span className="text-sm text-muted-foreground">{prefix}</span>}
      <input value={v} onChange={(e) => setV(e.target.value)} type={type} placeholder={placeholder} className="h-8 min-w-0 flex-1 rounded-lg border-[1.5px] border-ink/15 bg-background px-2 text-sm outline-none focus:border-ink" />
      <button type="submit" className="grid size-8 place-items-center rounded-lg border-[1.5px] border-ink bg-tomato" aria-label="Use this">
        <Check className="size-4" />
      </button>
    </form>
  );
}

export function BriefBuilder({ today, people, me, brief, onChange }: { today: string; people: Person[]; me: string; brief: Brief; onChange: (b: Brief) => void }) {
  const set = (patch: Partial<Brief>) => onChange({ ...brief, ...patch });
  const teamPeople = people.filter((p) => p.id !== me);
  const quickDates = [
    { label: "In 2 weeks", iso: saturdayIn(today, 14) },
    { label: "In a month", iso: saturdayIn(today, 30) },
    { label: "In 6 weeks", iso: saturdayIn(today, 42) },
  ];

  return (
    <div className="px-6 pb-4 pt-5">
      <p className="font-display text-[22px] font-semibold leading-[1.75] tracking-tight md:text-[28px]">
        We&apos;re putting on {brief.format ? article(brief.format) : "a"}{" "}
        <Blank filled={Boolean(brief.format)} placeholder="kind of event" content={(close) => (
          <>
            <p className="mono-label mb-2 text-[10px] text-muted-foreground">What kind of event?</p>
            <Options items={FORMATS} value={brief.format} onPick={(v) => { set({ format: v }); close(); }} />
            <Own placeholder="Something else, e.g. film night" onSave={(v) => { set({ format: v.toLowerCase() }); close(); }} />
          </>
        )}>{brief.format}</Blank>
        {" "}about{" "}
        <Blank filled={Boolean(brief.topic)} placeholder="what topic" content={(close) => (
          <>
            <p className="mono-label mb-2 text-[10px] text-muted-foreground">What is it about?</p>
            <Own placeholder="Type the topic" onSave={(v) => { set({ topic: v }); close(); }} />
            <p className="mono-label mb-1.5 mt-3 text-[10px] text-muted-foreground">Or pick one</p>
            <Options items={TOPICS} value={brief.topic} onPick={(v) => { set({ topic: v }); close(); }} />
          </>
        )}>{brief.topic}</Blank>
        {" "}for{" "}
        <Blank filled={Boolean(brief.pax)} placeholder="how many" content={(close) => (
          <>
            <p className="mono-label mb-2 text-[10px] text-muted-foreground">How many people?</p>
            <div className="mb-3 flex items-center justify-center gap-3">
              <button type="button" onClick={() => set({ pax: Math.max(5, (brief.pax ?? 80) - 10) })} className="grid size-9 place-items-center rounded-full border-[1.5px] border-ink/25 hover:border-ink" aria-label="Fewer"><Minus className="size-4" /></button>
              <motion.span key={brief.pax ?? 0} initial={{ y: 6, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="w-20 text-center font-display text-4xl font-bold tabular">{brief.pax ?? 80}</motion.span>
              <button type="button" onClick={() => set({ pax: Math.min(5000, (brief.pax ?? 80) + 10) })} className="grid size-9 place-items-center rounded-full border-[1.5px] border-ink/25 hover:border-ink" aria-label="More"><Plus className="size-4" /></button>
            </div>
            <Options items={PAX} value={brief.pax} onPick={(v) => { set({ pax: v }); close(); }} />
            <button type="button" onClick={() => { set({ pax: brief.pax ?? 80 }); close(); }} className="mt-3 h-8 w-full rounded-lg border-[1.5px] border-ink bg-tomato text-sm font-semibold">Use {brief.pax ?? 80}</button>
          </>
        )}>{brief.pax}</Blank>
        {" "}people on{" "}
        <Blank wide filled={Boolean(brief.date)} placeholder="which day" content={(close) => (
          <>
            <div className="mb-1 flex flex-wrap gap-1.5">
              {quickDates.map((q) => (
                <button key={q.label} type="button" onClick={() => { set({ date: q.iso }); close(); }} className={cn("rounded-full border-[1.5px] px-2.5 py-1 text-xs transition-colors", brief.date === q.iso ? "border-ink bg-ink text-white" : "border-ink/20 hover:border-ink")}>
                  {q.label} <span className="opacity-60">{showDate(q.iso)}</span>
                </button>
              ))}
            </div>
            <Calendar
              mode="single"
              selected={brief.date ? toDate(brief.date) : undefined}
              defaultMonth={brief.date ? toDate(brief.date) : toDate(saturdayIn(today, 30))}
              disabled={{ before: toDate(today) }}
              onSelect={(d) => { if (d) { set({ date: toIso(d) }); close(); } }}
            />
          </>
        )}>{brief.date ? showDate(brief.date) : ""}</Blank>
        ,{" "}
        <Blank filled={Boolean(brief.time)} placeholder="what time" content={(close) => (
          <>
            <p className="mono-label mb-2 text-[10px] text-muted-foreground">When in the day?</p>
            <div className="grid gap-1.5">
              {TIMES.map((t) => (
                <button key={t.key} type="button" onClick={() => { set({ time: t.key }); close(); }} className={cn("flex items-center justify-between rounded-xl border-[1.5px] px-3 py-2 text-sm transition-colors", brief.time === t.key ? "border-ink bg-ink text-white" : "border-ink/15 hover:border-ink")}>
                  <span className="first-letter:uppercase">{t.label}</span>
                  <span className="font-mono text-xs opacity-70">{t.phrase.replace(" to ", " to ")}</span>
                </button>
              ))}
            </div>
          </>
        )}>{TIMES.find((t) => t.key === brief.time)?.label}</Blank>
        , with{" "}
        <Blank filled={Boolean(brief.budget)} placeholder="a budget" content={(close) => (
          <>
            <p className="mono-label mb-2 text-[10px] text-muted-foreground">Budget cap</p>
            <Options items={BUDGETS} value={brief.budget} label={(v) => `RM${v.toLocaleString("en-MY")}`} onPick={(v) => { set({ budget: v }); close(); }} />
            <Own prefix="RM" type="number" placeholder="Another amount" onSave={(v) => { const n = Math.round(Number(v)); if (n > 0) { set({ budget: n }); close(); } }} />
          </>
        )}>{brief.budget ? `RM${brief.budget.toLocaleString("en-MY")}` : ""}</Blank>
        {" "}to spend.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Popover>
          <PopoverTrigger asChild>
            <motion.button type="button" whileTap={{ scale: 0.96 }} className="group flex items-center gap-2 rounded-full border-[1.5px] border-dashed border-ink/25 py-1 pl-1 pr-3 text-sm text-ink/70 transition-colors hover:border-ink hover:text-ink">
              <span className="flex -space-x-1.5">
                {brief.team.length ? (
                  brief.team.slice(0, 4).map((id) => {
                    const p = people.find((x) => x.id === id);
                    return p ? <span key={id} className={cn("grid size-6 place-items-center rounded-full border-[1.5px] border-card font-display text-[10px] font-bold text-ink", ROLE_BAND[p.role].bg)}>{p.name[0]}</span> : null;
                  })
                ) : (
                  <span className="grid size-6 place-items-center rounded-full bg-ink/5 transition-colors group-hover:bg-tomato/20"><Plus className="size-3.5" /></span>
                )}
              </span>
              {brief.team.length ? `With ${brief.team.map((id) => first(people.find((p) => p.id === id)?.name ?? "")).join(", ")}` : "Who's helping?"}
            </motion.button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-72 rounded-2xl border-[1.5px] border-ink bg-card p-2 shadow-[4px_4px_0_0_#161514]">
            <p className="mono-label px-2 pb-1.5 pt-1 text-[10px] text-muted-foreground">Add the committee running it</p>
            {teamPeople.map((p) => {
              const on = brief.team.includes(p.id);
              return (
                <button key={p.id} type="button" onClick={() => set({ team: on ? brief.team.filter((x) => x !== p.id) : [...brief.team, p.id] })} className="flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left text-sm transition-colors hover:bg-sand/50">
                  <span className={cn("grid size-7 place-items-center rounded-full font-display text-[11px] font-bold text-ink", ROLE_BAND[p.role].bg)}>{on ? <Check className="size-3.5" /> : p.name[0]}</span>
                  <span className="flex-1">
                    <span className="block font-medium leading-tight">{p.name}</span>
                    <span className="text-[11px] text-muted-foreground">{p.department ?? p.role}</span>
                  </span>
                  {on && <Check className="size-4 text-tomato-ink" />}
                </button>
              );
            })}
          </PopoverContent>
        </Popover>
        <input
          value={brief.extra ?? ""}
          onChange={(e) => set({ extra: e.target.value })}
          placeholder="Anything else? e.g. use Mix Mix Catering, invite Grab as sponsor"
          className="h-9 min-w-[220px] flex-1 rounded-full border-[1.5px] border-transparent bg-ink/[0.04] px-3 text-sm outline-none transition-colors placeholder:text-ink/35 focus:border-ink/30 focus:bg-transparent"
        />
      </div>
    </div>
  );
}
