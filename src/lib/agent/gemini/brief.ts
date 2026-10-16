import type { ParsedPrompt } from "../../planning";

/** What the planner agent reads out of a free-text brief. Empty values mean "not stated". */
export type GeminiBrief = {
  title?: string;
  topic?: string;
  format?: string;
  date?: string;
  start_time?: string;
  end_time?: string;
  pax?: number;
  budget_rm?: number;
  team?: string[];
  suppliers?: string[];
  audience?: string;
  goals?: string[];
  assumptions?: string[];
};

export const BRIEF_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string", description: "Short event title, e.g. 'AI in Healthcare Talk'" },
    topic: { type: "string", description: "Topic in a few words, e.g. 'AI in healthcare'" },
    format: { type: "string", description: "talk | workshop | hackathon | panel | networking | competition | other" },
    date: { type: "string", description: "YYYY-MM-DD, or empty if not stated" },
    start_time: { type: "string", description: "HH:MM 24h, or empty" },
    end_time: { type: "string", description: "HH:MM 24h, or empty" },
    pax: { type: "integer", description: "Expected attendees, 0 if not stated" },
    budget_rm: { type: "number", description: "Budget cap in RM, 0 if not stated" },
    team: { type: "array", items: { type: "string" }, description: "Names from the member list who will help run it" },
    suppliers: { type: "array", items: { type: "string" }, description: "Suppliers the organiser asked for by name" },
    audience: { type: "string", description: "Who it is for" },
    goals: { type: "array", items: { type: "string" }, description: "What the organiser wants to achieve" },
    assumptions: { type: "array", items: { type: "string" }, description: "Anything you had to assume, in plain words" },
  },
  required: ["title", "topic", "date", "pax", "budget_rm", "assumptions"],
} as const;

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Combine the rule-based parse with what Gemini understood. Gemini wins
 * where its value is valid (it reads "next Friday evening" or "about two
 * hundred students" better); the rule parse fills anything it left out.
 */
export function mergeBrief(p: ParsedPrompt, g: GeminiBrief, todayIso: string): ParsedPrompt & { assumptions: string[] } {
  const out = { ...p, team: [...p.team], suppliers: [...p.suppliers], missing: [...p.missing] };
  const assumptions = [...(g.assumptions ?? [])].filter(Boolean).slice(0, 6);
  const take = (field: string) => (out.missing = out.missing.filter((m) => m !== field));
  if (g.title?.trim()) out.title = g.title.trim().slice(0, 120);
  if (g.topic?.trim()) out.topic = g.topic.trim().slice(0, 120);
  if (g.format?.trim()) out.format = g.format.trim().toLowerCase().slice(0, 40);
  if (g.date && /^\d{4}-\d{2}-\d{2}$/.test(g.date) && !Number.isNaN(Date.parse(g.date)) && g.date >= todayIso) {
    out.date = g.date;
    take("date");
  }
  if (g.start_time && TIME.test(g.start_time)) out.startTime = g.start_time;
  if (g.end_time && TIME.test(g.end_time) && g.end_time > out.startTime) out.endTime = g.end_time;
  if (out.endTime <= out.startTime) out.endTime = `${String(Math.min(23, Number(out.startTime.slice(0, 2)) + 3)).padStart(2, "0")}:${out.startTime.slice(3)}`;
  if (g.pax && Number.isFinite(g.pax) && g.pax >= 5 && g.pax <= 5000) {
    out.pax = Math.round(g.pax);
    take("pax");
  }
  if (g.budget_rm && Number.isFinite(g.budget_rm) && g.budget_rm > 0 && g.budget_rm <= 1_000_000) {
    out.budget = Math.round(g.budget_rm);
    take("budget");
  }
  // Gemini names people in full ("Daniel Lim"); drop the rule parse's first names it already covers.
  const full = (g.team ?? []).map((t) => t.trim().slice(0, 80)).filter(Boolean);
  const first = (n: string) => n.toLowerCase().replace(/^dr\.?\s+/, "").split(/\s+/)[0];
  out.team = [...out.team.filter((t) => !full.some((f) => f.toLowerCase() === t.toLowerCase() || first(f) === t.toLowerCase())), ...full];
  out.team = out.team.filter((t, i) => out.team.findIndex((x) => x.toLowerCase() === t.toLowerCase()) === i);
  for (const s of g.suppliers ?? []) if (s && !out.suppliers.some((x) => x.toLowerCase() === s.toLowerCase())) out.suppliers.push(s.slice(0, 80));
  for (const m of out.missing) {
    const said = m === "date" ? `Date not given, planned for ${out.date}` : m === "pax" ? `Headcount not given, planned for ${out.pax}` : m === "budget" ? `Budget not given, planned with RM${out.budget}` : `${m} not given`;
    if (!assumptions.some((a) => a.toLowerCase().includes(m))) assumptions.push(said);
  }
  return { ...out, assumptions };
}

/**
 * Hours a volunteer committee typically spends on each piece of work when
 * done by hand. These are our working estimates from running society events;
 * they are shown as estimates, not measurements.
 */
export const MANUAL_HOURS: Record<string, { label: string; hours: number }> = {
  brief: { label: "Turn the idea into a plan and set up the event", hours: 1 },
  sop: { label: "Read the university SOP and check deadlines", hours: 1.5 },
  timeline: { label: "Build the task timeline", hours: 2 },
  venue: { label: "Find and check a venue", hours: 1 },
  speakers: { label: "Research speakers", hours: 3 },
  suppliers: { label: "Collect supplier prices", hours: 3 },
  budget: { label: "Build and check the budget", hours: 3 },
  sponsors: { label: "List likely sponsors", hours: 2 },
  risk: { label: "Write the risk register", hours: 2 },
  ops: { label: "Run sheet, roster and reminders", hours: 2 },
  promotion: { label: "Write the marketing kit", hours: 2.5 },
  proposal: { label: "Write the SOP proposal", hours: 5 },
  review: { label: "Proofread and check against the SOP", hours: 1.5 },
  approvals: { label: "Draft approval and outreach emails", hours: 1.5 },
};

export function timeSaved(done: string[]) {
  const items = [...new Set(done)].filter((k) => MANUAL_HOURS[k]).map((k) => MANUAL_HOURS[k]);
  return { hours: Math.round(items.reduce((n, i) => n + i.hours, 0) * 10) / 10, items };
}
