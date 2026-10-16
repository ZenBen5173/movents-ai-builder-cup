/**
 * Meetings: types, templates and pure helpers. No server imports, so the
 * client (copy minutes, forms) and the server (routes, MCP tools) share one copy.
 */

export type AgendaItem = { id?: string; item: string; owner?: string | null; minutes?: number | null; done?: boolean };
export type ActionItem = { id: string; text: string; owner_id: string | null; due_date: string | null; task_id?: string | null; done?: boolean };
export type MeetingStatus = "scheduled" | "done" | "cancelled";

export type Meeting = {
  id: string;
  event_id: string;
  title: string;
  starts_at: string;
  duration_min: number;
  location: string | null;
  meeting_url: string | null;
  agenda: AgendaItem[];
  attendees: string[];
  attended: string[];
  minutes: string | null;
  decisions: string[];
  action_items: ActionItem[];
  status: MeetingStatus;
  created_by: string | null;
  created_at: string;
};

export type MeetingTemplate = { key: string; title: string; duration: number; agenda: AgendaItem[] };

export const MEETING_TEMPLATES: MeetingTemplate[] = [
  {
    key: "kickoff",
    title: "Kick-off",
    duration: 60,
    agenda: [
      { item: "Goals and success measures", minutes: 10 },
      { item: "Roles and owners", minutes: 10 },
      { item: "Timeline and key dates", minutes: 15 },
      { item: "Budget at a glance", minutes: 10 },
      { item: "Risks and open questions", minutes: 10 },
      { item: "Next steps", minutes: 5 },
    ],
  },
  {
    key: "weekly",
    title: "Weekly sync",
    duration: 30,
    agenda: [
      { item: "Wins since last week", minutes: 5 },
      { item: "Overdue and due this week", minutes: 10 },
      { item: "Blockers", minutes: 10 },
      { item: "Plan for next week", minutes: 5 },
    ],
  },
  {
    key: "vendor",
    title: "Vendor check-in",
    duration: 30,
    agenda: [
      { item: "Order and quantities", minutes: 10 },
      { item: "Delivery time and venue access", minutes: 10 },
      { item: "Deposit, invoice and payment", minutes: 5 },
      { item: "Contacts on the day", minutes: 5 },
    ],
  },
  {
    key: "runthrough",
    title: "Day-before run-through",
    duration: 45,
    agenda: [
      { item: "Walk the run of show", minutes: 15 },
      { item: "Crew roles and shifts", minutes: 10 },
      { item: "Setup and load-in", minutes: 10 },
      { item: "Emergency plan", minutes: 5 },
      { item: "Last checks", minutes: 5 },
    ],
  },
  {
    key: "debrief",
    title: "Post-event debrief",
    duration: 45,
    agenda: [
      { item: "Turnout and spend", minutes: 10 },
      { item: "What went well", minutes: 10 },
      { item: "What to fix", minutes: 15 },
      { item: "Thank-yous and follow-ups", minutes: 5 },
      { item: "Lessons for the SOP", minutes: 5 },
    ],
  },
];

export const TZ = "Asia/Kuala_Lumpur";

/** "2026-10-13" + "20:00" → an ISO instant in Malaysia time. */
export const toStartsAt = (date: string, time: string) => new Date(`${date}T${time.length === 5 ? `${time}:00` : time}+08:00`).toISOString();

/** Date and time parts of an instant, in Malaysia time. */
export function klParts(iso: string) {
  const d = new Date(Date.parse(iso) + 8 * 3600_000).toISOString();
  return { date: d.slice(0, 10), time: d.slice(11, 16) };
}

export const endsAt = (m: Pick<Meeting, "starts_at" | "duration_min">) => Date.parse(m.starts_at) + m.duration_min * 60_000;

export function fmtWhen(iso: string, durationMin?: number) {
  const s = new Date(iso);
  const day = s.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: TZ });
  const t = klParts(iso).time;
  if (!durationMin) return `${day}, ${t}`;
  return `${day}, ${t} to ${klParts(new Date(Date.parse(iso) + durationMin * 60_000).toISOString()).time}`;
}

export const isPast = (m: Pick<Meeting, "status" | "starts_at" | "duration_min">, now: number) => m.status !== "scheduled" || endsAt(m) <= now;

export const hasMinutes = (m: Pick<Meeting, "minutes" | "decisions">) => Boolean(m.minutes?.trim()) || m.decisions.length > 0;

export const shortId = () => Math.random().toString(36).slice(2, 10);

/** Agenda may be stored as plain strings or objects; always hand back objects. */
export function normAgenda(raw: unknown): AgendaItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((a) => (typeof a === "string" ? { item: a } : a && typeof a === "object" ? (a as AgendaItem) : null))
    .filter((a): a is AgendaItem => Boolean(a && String(a.item ?? "").trim()))
    .map((a) => ({ id: a.id || shortId(), item: String(a.item).trim(), owner: a.owner ?? null, minutes: a.minutes == null ? null : Number(a.minutes) || null, done: Boolean(a.done) }));
}

export function normActions(raw: unknown): ActionItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((a) => a && typeof a === "object" && String((a as ActionItem).text ?? "").trim())
    .map((a) => {
      const x = a as ActionItem;
      return { id: x.id || shortId(), text: String(x.text).trim(), owner_id: x.owner_id ?? null, due_date: x.due_date ?? null, task_id: x.task_id ?? null, done: Boolean(x.done) };
    });
}

/** Task phase from how far the due date sits before the event (SOP phase bands). */
export function phaseFor(due: string, eventDate: string) {
  const days = Math.round((Date.parse(`${eventDate.slice(0, 10)}T00:00:00Z`) - Date.parse(`${due.slice(0, 10)}T00:00:00Z`)) / 86_400_000);
  if (days < 0) return "post";
  const w = days / 7;
  if (w <= 2) return "execution";
  if (w <= 7) return "promotion";
  if (w <= 12) return "planning";
  return "concept";
}

const fmtDay = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

/** Clean minutes for copy, .md download and the agent. */
export function minutesMarkdown(m: Meeting, ctx: { eventTitle?: string; names: Record<string, string> }) {
  const name = (idOrName: string | null | undefined) => (idOrName ? ctx.names[idOrName] ?? idOrName : "");
  const out: string[] = [`# ${m.title}`, [ctx.eventTitle, fmtWhen(m.starts_at, m.duration_min), m.location || m.meeting_url].filter(Boolean).join(" · "), ""];
  if (m.attendees.length) {
    const came = m.attended.length ? m.attendees.filter((a) => m.attended.includes(a)) : m.attendees;
    const away = m.attended.length ? m.attendees.filter((a) => !m.attended.includes(a)) : [];
    out.push("## Attendees", came.map(name).join(", ") + (away.length ? ` (absent: ${away.map(name).join(", ")})` : ""), "");
  }
  if (m.agenda.length) {
    out.push("## Agenda");
    for (const a of m.agenda) {
      const meta = [name(a.owner), a.minutes ? `${a.minutes} min` : ""].filter(Boolean).join(", ");
      out.push(`- [${a.done ? "x" : " "}] ${a.item}${meta ? ` (${meta})` : ""}`);
    }
    out.push("");
  }
  if (m.minutes?.trim()) out.push("## Minutes", m.minutes.trim(), "");
  if (m.decisions.length) out.push("## Decisions", ...m.decisions.map((d) => `- ${d}`), "");
  if (m.action_items.length) {
    out.push("## Action items");
    for (const a of m.action_items) {
      const meta = [name(a.owner_id), a.due_date ? `due ${fmtDay(a.due_date)}` : ""].filter(Boolean).join(", ");
      out.push(`- [${a.done ? "x" : " "}] ${a.text}${meta ? ` (${meta})` : ""}`);
    }
    out.push("");
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}
