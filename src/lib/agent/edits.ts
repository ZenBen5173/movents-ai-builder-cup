import "server-only";
import { one, query } from "../db";

/**
 * Movi's hands for small edits: change, add or remove one item on an event
 * (a budget line, a speaker, a risk...). Each call goes through the same
 * server action the page's edit button uses, so the checks, audit trail and
 * side effects (a new supplier quote repricing its budget line) are identical.
 */

export const RECORD_KINDS = ["budget_line", "speaker", "sponsor", "supplier", "risk", "promo_item", "attendee", "task"] as const;
export type RecordKind = (typeof RECORD_KINDS)[number];

const TABLE: Record<RecordKind, string> = {
  budget_line: "budget_lines",
  speaker: "speakers",
  sponsor: "sponsors",
  supplier: "vendors",
  risk: "risks",
  promo_item: "promo_items",
  attendee: "rsvps",
  task: "tasks",
};

/** What Movi sees when it lists items: the id plus the fields it can change. */
const COLUMNS: Record<RecordKind, string> = {
  budget_line: "id, category, description, qty, unit_cost, estimated, actual, custom",
  speaker: "id, name, headline, email, phone, talk_title, status",
  sponsor: "id, company, industry, contact_name, contact_email, ask, status, offer_amount, notes",
  supplier: "id, category, name, quote, unit_price, unit, contact_email, url, selected",
  risk: "id, category, description, likelihood, impact, mitigation, contingency, status",
  promo_item: "id, channel, title, due_date, status, link",
  attendee: "id, name, email, status, dietary, accessibility, checked_in",
  task: "id, title, phase, status, priority, due_date",
};

/** Every field Movi may set, across kinds (the tool schema lists them so Gemini knows the names). */
const FIELD_NAMES = [
  "description", "category", "qty", "unit_cost", "funding",
  "name", "headline", "email", "phone", "talk_title", "bio", "photo_url", "source_url",
  "company", "industry", "website", "contact_name", "contact_email", "ask", "notes", "offer_note", "offer_amount",
  "quote", "unit_price", "unit", "url",
  "mitigation", "contingency", "likelihood", "impact", "status",
  "title", "channel", "due_date", "link", "dietary", "accessibility", "priority", "phase",
];
export const FIELDS_SCHEMA = {
  type: "object",
  description: "Only the fields that change, as text (numbers as plain digits)",
  properties: Object.fromEntries(FIELD_NAMES.map((k) => [k, { type: "string" }])),
};

type Res = { ok: true; message?: string } | { ok: false; error: string };
type Fields = Record<string, unknown>;

const kindOf = (k: unknown): RecordKind => {
  if (!RECORD_KINDS.includes(k as RecordKind)) throw new Error(`Unknown kind ${String(k)}. Use one of: ${RECORD_KINDS.join(", ")}`);
  return k as RecordKind;
};
/** Only the given fields, as text, the way the edit dialogs send them. */
const text = (f: Fields, keys: string[]) => Object.fromEntries(keys.filter((k) => f[k] != null).map((k) => [k, String(f[k])]));
const num = (v: unknown) => (v == null || v === "" ? undefined : Number(String(v).replace(/[^\d.-]/g, "")));
const done = (r: Res) => {
  if (!r.ok) throw new Error(r.error);
  return { done: r.message ?? "Saved" };
};

/** Movi works on one event: the item must belong to it. */
async function onEvent(eventId: string, kind: RecordKind, id: string) {
  const row = await one<{ event_id: string | null }>(`SELECT event_id FROM ${TABLE[kind]} WHERE id = $1`, [id]);
  if (!row || row.event_id !== eventId) throw new Error(`No ${kind.replace("_", " ")} ${id} on this event. Call list_records first.`);
}

export async function listRecords(eventId: string, kindArg: unknown) {
  const kind = kindOf(kindArg);
  const order = kind === "task" ? "due_date" : kind === "attendee" ? "created_at DESC" : kind === "promo_item" ? "due_date" : "id";
  const rows = await query(`SELECT ${COLUMNS[kind]} FROM ${TABLE[kind]} WHERE event_id = $1 ORDER BY ${order} LIMIT 80`, [eventId]);
  return { kind, count: rows.length, rows };
}

export async function editRecord(eventId: string, kindArg: unknown, id: string, f: Fields) {
  const kind = kindOf(kindArg);
  await onEvent(eventId, kind, id);
  const A = await import("@/app/actions");
  switch (kind) {
    case "budget_line":
      return done(await A.updateBudgetLine(id, { description: f.description as string | undefined, category: f.category as string | undefined, qty: num(f.qty), unit_cost: num(f.unit_cost) }));
    case "speaker":
      return done(await A.updateSpeaker(id, text(f, ["name", "headline", "email", "phone", "talk_title", "bio", "photo_url", "source_url"])));
    case "sponsor": {
      const S = await import("@/app/actions-sponsors");
      return done(await S.updateSponsor(id, text(f, ["company", "industry", "website", "contact_name", "contact_email", "ask", "notes", "offer_note", "offer_amount"])));
    }
    case "supplier":
      return done(await A.editVendor(id, text(f, ["name", "contact_email", "url", "unit", "quote", "unit_price"])));
    case "risk":
      return done(
        await A.updateRisk(id, {
          ...text(f, ["category", "description", "mitigation", "contingency", "status"]),
          ...(f.likelihood != null ? { likelihood: num(f.likelihood) } : {}),
          ...(f.impact != null ? { impact: num(f.impact) } : {}),
        }),
      );
    case "promo_item":
      return done(await A.updatePromoItem(id, text(f, ["title", "channel", "due_date", "link"])));
    case "attendee":
      return done(await A.updateAttendee(id, text(f, ["name", "email", "dietary", "accessibility"])));
    case "task":
      return done(await A.updateTask(id, text(f, ["title", "status", "due_date", "priority", "phase", "description"])));
  }
}

const ADDABLE: RecordKind[] = ["budget_line", "attendee", "promo_item", "task"];

export async function addRecord(eventId: string, kindArg: unknown, f: Fields) {
  const kind = kindOf(kindArg);
  if (!ADDABLE.includes(kind)) throw new Error(`Add ${kind} with its own tool (save_speakers, save_sponsors, add_risks)`);
  const A = await import("@/app/actions");
  if (kind === "budget_line") return done(await A.addBudgetLine(eventId, { category: String(f.category ?? "Other"), description: String(f.description ?? ""), qty: num(f.qty) ?? 1, unit_cost: num(f.unit_cost) ?? 0, funding: f.funding as string | undefined }));
  if (kind === "attendee") return done(await A.addAttendee(eventId, text(f, ["name", "email", "dietary", "accessibility"])));
  if (kind === "promo_item") return done(await A.addPromoItem(eventId, text(f, ["title", "channel", "due_date"])));
  return done(await A.createTask(eventId, { title: String(f.title ?? ""), phase: String(f.phase ?? "execution"), due_date: String(f.due_date ?? ""), priority: f.priority as string | undefined }));
}

export async function removeRecord(eventId: string, kindArg: unknown, id: string) {
  const kind = kindOf(kindArg);
  await onEvent(eventId, kind, id);
  const A = await import("@/app/actions");
  switch (kind) {
    case "budget_line":
      return done(await A.removeBudgetLine(id));
    case "speaker":
      return done(await A.removeSpeaker(id));
    case "sponsor":
      return done(await (await import("@/app/actions-sponsors")).removeSponsor(id));
    case "risk":
      return done(await A.deleteRisk(id));
    case "promo_item":
      return done(await A.removePromoItem(id));
    case "task":
      return done(await A.deleteTask(id));
    case "attendee":
      return done(await A.setRsvpStatus(id, "cancelled"));
    case "supplier":
      throw new Error("Suppliers are swapped on the Budget tab, not removed");
  }
}

const NAME_COL: Record<RecordKind, string> = { budget_line: "description", speaker: "name", sponsor: "company", supplier: "name", risk: "category", promo_item: "title", attendee: "name", task: "title" };

/** A readable name for an item, so a proposal says which line it changes. */
export async function recordName(kindArg: unknown, id: string) {
  if (!RECORD_KINDS.includes(kindArg as RecordKind)) return null;
  const k = kindArg as RecordKind;
  const r = await one<{ n: string }>(`SELECT ${NAME_COL[k]} AS n FROM ${TABLE[k]} WHERE id = $1`, [id]);
  return r?.n ? r.n.split(" — ")[0] : null;
}
