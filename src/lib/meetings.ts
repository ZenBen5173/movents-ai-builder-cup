import "server-only";
import { id, insert, one, query, update } from "./db";
import { addDays, today } from "./appurl";
import { audit } from "./audit";
import type { User } from "./types";
import {
  MEETING_TEMPLATES,
  klParts,
  normActions,
  normAgenda,
  phaseFor,
  shortId,
  toStartsAt,
  type ActionItem,
  type AgendaItem,
  type Meeting,
  type MeetingStatus,
} from "./meetings-shared";

export * from "./meetings-shared";

/** Attendance (who actually came) lives beside the invite list. Added here so schema.ts stays untouched. */
let cols: Promise<unknown> | null = null;
export function meetingsReady() {
  if (!cols) cols = query("ALTER TABLE meetings ADD COLUMN IF NOT EXISTS attended jsonb NOT NULL DEFAULT '[]'::jsonb").catch((e) => {
    cols = null;
    throw e;
  });
  return cols;
}

const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : new Date(String(v)).toISOString());
const arr = (v: unknown) => (Array.isArray(v) ? v.map(String) : []);

export function toMeeting(r: Record<string, unknown>): Meeting {
  return {
    id: String(r.id),
    event_id: String(r.event_id),
    title: String(r.title),
    starts_at: iso(r.starts_at),
    duration_min: Number(r.duration_min) || 60,
    location: (r.location as string) || null,
    meeting_url: (r.meeting_url as string) || null,
    agenda: normAgenda(r.agenda),
    attendees: arr(r.attendees),
    attended: arr(r.attended),
    minutes: (r.minutes as string) ?? null,
    decisions: arr(r.decisions).filter((d) => d.trim()),
    action_items: normActions(r.action_items),
    status: (["scheduled", "done", "cancelled"].includes(String(r.status)) ? r.status : "scheduled") as MeetingStatus,
    created_by: (r.created_by as string) ?? null,
    created_at: iso(r.created_at ?? new Date()),
  };
}

export async function listMeetings(eventId: string) {
  await meetingsReady();
  return (await query("SELECT * FROM meetings WHERE event_id = $1 ORDER BY starts_at", [eventId])).map(toMeeting);
}

export async function getMeeting(meetingId: string) {
  await meetingsReady();
  const r = await one("SELECT * FROM meetings WHERE id = $1", [meetingId]);
  return r ? toMeeting(r) : null;
}

/** "Now" for countdowns and upcoming/past, on the Malaysia clock. */
export function nowKL() {
  const clock = klParts(new Date().toISOString()).time;
  return Date.parse(toStartsAt(today(), clock));
}

export async function teamNames(eventId: string) {
  const rows = await query<{ id: string; name: string }>("SELECT u.id, u.name FROM event_members m JOIN users u ON u.id = m.user_id WHERE m.event_id = $1", [eventId]);
  return Object.fromEntries(rows.map((r) => [r.id, r.name])) as Record<string, string>;
}

const clean = (s: unknown, max = 200) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, max);

export type MeetingInput = {
  title: string;
  date: string;
  time: string;
  duration_min?: number;
  location?: string | null;
  meeting_url?: string | null;
  attendees?: string[];
  agenda?: (string | AgendaItem)[];
};

export async function createMeetingRecord(user: Pick<User, "id" | "name">, eventId: string, data: MeetingInput) {
  await meetingsReady();
  const title = clean(data.title, 120);
  if (!title) throw new Error("Give the meeting a title");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data.date)) throw new Error("Pick a date");
  if (!/^\d{2}:\d{2}$/.test(data.time)) throw new Error("Pick a time");
  let url = clean(data.meeting_url, 400) || null;
  let location = clean(data.location, 160) || null;
  if (!url && location && /^https?:\/\//i.test(location)) [url, location] = [location, null];
  const m = await insert("meetings", {
    id: id("mtg"),
    event_id: eventId,
    title,
    starts_at: toStartsAt(data.date, data.time),
    duration_min: Math.min(480, Math.max(5, Math.round(Number(data.duration_min) || 60))),
    location,
    meeting_url: url,
    agenda: normAgenda(data.agenda ?? []),
    attendees: [...new Set(data.attendees ?? [])],
    attended: [],
    minutes: null,
    decisions: [],
    action_items: [],
    status: "scheduled",
    created_by: user.id,
  });
  await audit(user, "meeting.scheduled", { meeting: title, when: `${data.date} ${data.time}` }, { eventId });
  return toMeeting(m);
}

export type MeetingPatch = Partial<{
  title: string;
  date: string;
  time: string;
  duration_min: number;
  location: string | null;
  meeting_url: string | null;
  agenda: AgendaItem[];
  attendees: string[];
  attended: string[];
  minutes: string;
  decisions: string[];
  action_items: ActionItem[];
  status: MeetingStatus;
}>;

export async function patchMeeting(meetingId: string, p: MeetingPatch) {
  await meetingsReady();
  const cur = await getMeeting(meetingId);
  if (!cur) throw new Error("Meeting not found");
  const row: Record<string, unknown> = {};
  if (p.title !== undefined) {
    const t = clean(p.title, 120);
    if (!t) throw new Error("Title can't be empty");
    row.title = t;
  }
  if (p.date !== undefined || p.time !== undefined) {
    const k = klParts(cur.starts_at);
    row.starts_at = toStartsAt(p.date ?? k.date, p.time ?? k.time);
  }
  if (p.duration_min !== undefined) row.duration_min = Math.min(480, Math.max(5, Math.round(Number(p.duration_min) || 60)));
  if (p.location !== undefined) row.location = clean(p.location, 160) || null;
  if (p.meeting_url !== undefined) row.meeting_url = clean(p.meeting_url, 400) || null;
  if (p.agenda !== undefined) row.agenda = normAgenda(p.agenda).slice(0, 40);
  if (p.attendees !== undefined) row.attendees = [...new Set(p.attendees.map(String))];
  if (p.attended !== undefined) row.attended = [...new Set(p.attended.map(String))];
  if (p.minutes !== undefined) row.minutes = String(p.minutes).slice(0, 20000);
  if (p.decisions !== undefined) row.decisions = p.decisions.map((d) => clean(d, 400)).filter(Boolean).slice(0, 60);
  if (p.action_items !== undefined) {
    // task links are only set server side; keep the existing link for each item
    const links = new Map(cur.action_items.map((a) => [a.id, a.task_id ?? null]));
    row.action_items = normActions(p.action_items).slice(0, 60).map((a) => ({ ...a, text: clean(a.text, 300), task_id: links.get(a.id) ?? null }));
  }
  if (p.status !== undefined) {
    if (!["scheduled", "done", "cancelled"].includes(p.status)) throw new Error("Unknown status");
    row.status = p.status;
  }
  const r = await update("meetings", meetingId, row);
  return r ? toMeeting(r) : cur;
}

/** Turn one action item into a real task on the event (phase from the due date, priority medium) and link it back. */
export async function makeTaskForAction(user: Pick<User, "id" | "name">, meetingId: string, actionId: string) {
  const m = await getMeeting(meetingId);
  if (!m) throw new Error("Meeting not found");
  const a = m.action_items.find((x) => x.id === actionId);
  if (!a) throw new Error("Action item not found");
  if (a.task_id && (await one("SELECT 1 FROM tasks WHERE id = $1", [a.task_id]))) return { meeting: m, task_id: a.task_id, created: false };
  const ev = await one<{ date: string }>("SELECT date FROM events WHERE id = $1", [m.event_id]);
  const due = a.due_date || addDays(klParts(m.starts_at).date, 7);
  const tid = id("tsk");
  await insert("tasks", {
    id: tid,
    event_id: m.event_id,
    title: a.text,
    phase: ev ? phaseFor(due, ev.date) : "planning",
    due_date: due,
    start_date: due,
    owner_id: a.owner_id ?? user.id,
    priority: "medium",
    depends_on: [],
    status: a.done ? "done" : "todo",
    sort: 500,
    description: `From meeting: ${m.title}`,
  });
  const items = m.action_items.map((x) => (x.id === actionId ? { ...x, task_id: tid, due_date: due } : x));
  await update("meetings", meetingId, { action_items: items });
  await audit(user, "task.created", { task: a.text, from_meeting: m.title }, { eventId: m.event_id });
  return { meeting: { ...m, action_items: items }, task_id: tid, created: true };
}

/** Minutes, decisions and action items in one go (the agent's record_minutes, and "Mark done"). */
export async function recordMinutes(
  user: Pick<User, "id" | "name">,
  meetingId: string,
  data: { minutes?: string; decisions?: string[]; action_items?: { text: string; owner_id?: string | null; due_date?: string | null }[]; attended?: string[]; create_tasks?: boolean; mark_done?: boolean },
) {
  const m = await getMeeting(meetingId);
  if (!m) throw new Error("Meeting not found");
  const added: ActionItem[] = (data.action_items ?? []).filter((a) => a.text?.trim()).map((a) => ({ id: shortId(), text: a.text.trim(), owner_id: a.owner_id ?? null, due_date: a.due_date ?? null, task_id: null, done: false }));
  await patchMeeting(meetingId, {
    minutes: data.minutes !== undefined ? [m.minutes?.trim(), data.minutes.trim()].filter(Boolean).join("\n\n") : undefined,
    decisions: data.decisions ? [...m.decisions, ...data.decisions] : undefined,
    action_items: added.length ? [...m.action_items, ...added] : undefined,
    attended: data.attended,
    status: data.mark_done === false ? undefined : "done",
  });
  const tasks: string[] = [];
  if (data.create_tasks) for (const a of added) tasks.push((await makeTaskForAction(user, meetingId, a.id)).task_id);
  await audit(user, "meeting.minutes", { meeting: m.title, decisions: data.decisions?.length ?? 0, actions: added.length, tasks: tasks.length }, { eventId: m.event_id });
  return { meeting: await getMeeting(meetingId), task_ids: tasks };
}

export function templateFor(key: string | undefined) {
  if (!key) return undefined;
  const k = key.toLowerCase().replace(/[^a-z]/g, "");
  return MEETING_TEMPLATES.find((t) => t.key === k || t.title.toLowerCase().replace(/[^a-z]/g, "") === k);
}
