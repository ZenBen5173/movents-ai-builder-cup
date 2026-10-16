"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Mic, Square } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/**
 * Quick picks for the event brief: tap a format, date, time, headcount and
 * budget instead of typing them. Each pick becomes a plain phrase in the
 * brief ("on 14 Nov", "80 pax", "budget RM1,500") that both Gemini and the
 * rule-based parser read.
 */

export type Picks = { format?: string; when?: string; time?: string; pax?: string; budget?: string };

const FORMATS = ["talk", "workshop", "hackathon", "panel", "networking night", "competition"];
const TIMES: { label: string; phrase: string }[] = [
  { label: "Morning", phrase: "9am to 12pm" },
  { label: "Afternoon", phrase: "2pm to 5pm" },
  { label: "Evening", phrase: "7pm to 10pm" },
  { label: "Full day", phrase: "9am to 6pm" },
];
const PAX = ["50", "80", "100", "150", "200", "300"];
const BUDGETS = ["500", "1,000", "2,000", "3,000", "5,000"];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function addDays(iso: string, n: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d;
}
/** The first Saturday on or after a date: society events mostly run on weekends. */
function saturdayFrom(d: Date) {
  const out = new Date(d);
  out.setUTCDate(out.getUTCDate() + ((6 - out.getUTCDay() + 7) % 7));
  return out;
}
const phraseDate = (d: Date) => `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
const labelDate = (d: Date) => `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;

function dateOptions(today: string) {
  return [
    { label: "In 2 weeks", date: saturdayFrom(addDays(today, 14)) },
    { label: "In a month", date: saturdayFrom(addDays(today, 30)) },
    { label: "In 6 weeks", date: saturdayFrom(addDays(today, 42)) },
    { label: "In 2 months", date: saturdayFrom(addDays(today, 60)) },
  ].map((o) => ({ ...o, phrase: phraseDate(o.date), sub: labelDate(o.date) }));
}

/** The brief as sent: what was typed, then the picks as plain phrases. */
export function composeBrief(typed: string, picks: Picks, today: string) {
  const t = typed.trim().replace(/[.\s]+$/, "");
  const parts: string[] = [];
  const when = picks.when ? dateOptions(today).find((o) => o.label === picks.when)?.phrase ?? picks.when : null;
  if (picks.pax) parts.push(`${picks.pax} pax`);
  if (when) parts.push(`on ${when}`);
  if (picks.time) parts.push(TIMES.find((x) => x.label === picks.time)?.phrase ?? picks.time);
  if (picks.budget) parts.push(`budget RM${picks.budget}`);
  const lead = t || (picks.format ? `Plan a ${picks.format}` : "");
  const format = t && picks.format && !t.toLowerCase().includes(picks.format) ? ` (${picks.format})` : "";
  if (!lead) return parts.length ? `Plan an event, ${parts.join(", ")}.` : "";
  return parts.length ? `${lead}${format}, ${parts.join(", ")}.` : `${lead}${format}.`;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="mono-label w-[58px] shrink-0 text-[9.5px] text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

function Chip({ on, onClick, children, sub, delay = 0 }: { on: boolean; onClick: () => void; children: React.ReactNode; sub?: string; delay?: number }) {
  return (
    <motion.button
      type="button"
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      whileHover={{ y: -1 }}
      whileTap={{ scale: 0.94 }}
      onClick={onClick}
      aria-pressed={on}
      className={cn(
        "group relative flex items-baseline gap-1 rounded-full border-[1.5px] px-2.5 py-0.5 text-xs transition-colors",
        on ? "border-ink bg-ink text-white shadow-[2px_2px_0_0_#ff5a36]" : "border-ink/20 text-ink/65 hover:border-ink hover:text-ink",
      )}
    >
      {children}
      {sub && <span className={cn("text-[10px] tabular", on ? "text-white/70" : "text-ink/40 group-hover:text-ink/60")}>{sub}</span>}
    </motion.button>
  );
}

export function QuickPicks({ today, picks, onChange }: { today: string; picks: Picks; onChange: (p: Picks) => void }) {
  const toggle = (k: keyof Picks, v: string) => onChange({ ...picks, [k]: picks[k] === v ? undefined : v });
  return (
    <div className="space-y-1.5 px-6 pb-3">
      <Row label="What">
        {FORMATS.map((f, i) => (
          <Chip key={f} on={picks.format === f} onClick={() => toggle("format", f)} delay={i * 0.02}>
            {f[0].toUpperCase() + f.slice(1)}
          </Chip>
        ))}
      </Row>
      <Row label="When">
        {dateOptions(today).map((o, i) => (
          <Chip key={o.label} on={picks.when === o.label} onClick={() => toggle("when", o.label)} sub={o.sub} delay={0.04 + i * 0.02}>
            {o.label}
          </Chip>
        ))}
      </Row>
      <Row label="Time">
        {TIMES.map((o, i) => (
          <Chip key={o.label} on={picks.time === o.label} onClick={() => toggle("time", o.label)} sub={o.phrase.replace(" to ", "-")} delay={0.08 + i * 0.02}>
            {o.label}
          </Chip>
        ))}
      </Row>
      <Row label="People">
        {PAX.map((p, i) => (
          <Chip key={p} on={picks.pax === p} onClick={() => toggle("pax", p)} delay={0.12 + i * 0.02}>
            {p}
          </Chip>
        ))}
      </Row>
      <Row label="Budget">
        {BUDGETS.map((b, i) => (
          <Chip key={b} on={picks.budget === b} onClick={() => toggle("budget", b)} delay={0.16 + i * 0.02}>
            RM{b}
          </Chip>
        ))}
      </Row>
    </div>
  );
}

// ------------------------------------------------------------------ voice

type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
};

/** Speak instead of type: the browser's own speech recognition (free, nothing leaves except to the browser's service). */
export function useDictation(onText: (finalText: string, interim: string) => void) {
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(false);
  const rec = useRef<Recognition | null>(null);
  const cb = useRef(onText);
  cb.current = onText;

  useEffect(() => {
    const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
    setSupported(Boolean(w.SpeechRecognition ?? w.webkitSpeechRecognition));
    return () => rec.current?.stop();
  }, []);

  const start = useCallback(() => {
    const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) return toast.error("Voice input is not supported in this browser. Try Chrome or Edge.");
    const r = new Ctor();
    r.lang = "en-MY";
    r.continuous = true;
    r.interimResults = true;
    r.onresult = (e) => {
      let finalText = "";
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) finalText += res[0].transcript;
        else interim += res[0].transcript;
      }
      cb.current(finalText, interim);
    };
    r.onerror = (e) => {
      if (e.error === "not-allowed") toast.error("Microphone access is blocked. Allow it in the browser to speak your brief.");
      else if (e.error !== "aborted" && e.error !== "no-speech") toast.error(`Voice input stopped (${e.error}).`);
    };
    r.onend = () => setListening(false);
    rec.current = r;
    r.start();
    setListening(true);
  }, []);

  const stop = useCallback(() => {
    rec.current?.stop();
    setListening(false);
  }, []);

  return { listening, supported, start, stop };
}

export function MicButton({ listening, supported, onStart, onStop, className }: { listening: boolean; supported: boolean; onStart: () => void; onStop: () => void; className?: string }) {
  if (!supported) return null;
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.9 }}
      onClick={listening ? onStop : onStart}
      title={listening ? "Stop listening" : "Speak your brief"}
      aria-label={listening ? "Stop listening" : "Speak your brief"}
      className={cn(
        "relative grid size-10 place-items-center rounded-full border-[1.5px] transition-colors",
        listening ? "border-ink bg-tomato text-ink" : "border-ink/25 text-ink/60 hover:border-ink hover:text-ink",
        className,
      )}
    >
      <AnimatePresence>
        {listening && (
          <motion.span
            key="pulse"
            initial={{ scale: 1, opacity: 0.5 }}
            animate={{ scale: 1.7, opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.2, repeat: Infinity, ease: "easeOut" }}
            className="absolute inset-0 rounded-full bg-tomato"
          />
        )}
      </AnimatePresence>
      <span className="relative">{listening ? <Square className="size-3.5 fill-current" /> : <Mic className="size-4" />}</span>
    </motion.button>
  );
}
