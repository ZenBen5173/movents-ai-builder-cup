import "server-only";
import { googleAccessToken } from "./ai/gemini";
import type { AgentRun } from "./types";

/**
 * Live agent runs in Cloud Firestore (Native mode, same region as Cloud Run).
 *
 * Every save of a run (each step starting and finishing) is written to
 * `agent_runs/{id}`, and the live views read it from here: the run trace page
 * and the live build on an event poll Firestore, not Postgres. Postgres keeps
 * the same row as the record of truth for the rest of the app, and is the
 * fallback whenever Firestore is off (FIRESTORE_RUNS unset, local dev without
 * gcloud) or a read fails, so a hiccup never breaks a run.
 *
 * Talks to the Firestore REST API with the app's own Google Cloud token, the
 * one Vertex AI uses, so there is no extra SDK or key.
 */

export type StoredRun = Pick<AgentRun, "id" | "event_id" | "prompt" | "kind" | "source" | "status" | "steps" | "outputs" | "summary" | "started_by" | "created_at" | "finished_at">;

export const firestoreEnabled = () => process.env.FIRESTORE_RUNS === "1" && Boolean(process.env.GOOGLE_CLOUD_PROJECT);

const base = () => `https://firestore.googleapis.com/v1/projects/${process.env.GOOGLE_CLOUD_PROJECT}/databases/(default)/documents`;
const docName = (id: string) => `projects/${process.env.GOOGLE_CLOUD_PROJECT}/databases/(default)/documents/agent_runs/${id}`;

// ---------------------------------------------------------------- Firestore values

type Value =
  | { nullValue: null }
  | { booleanValue: boolean }
  | { integerValue: string }
  | { doubleValue: number }
  | { stringValue: string }
  | { arrayValue: { values?: Value[] } }
  | { mapValue: { fields?: Record<string, Value> } };

function encode(v: unknown): Value {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === "string") return { stringValue: v };
  if (v instanceof Date) return { stringValue: v.toISOString() };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(encode) } };
  if (typeof v === "object") return { mapValue: { fields: Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([, x]) => x !== undefined).map(([k, x]) => [k, encode(x)])) } };
  return { stringValue: String(v) };
}

function decode(v: Value | undefined): unknown {
  if (!v) return null;
  if ("nullValue" in v) return null;
  if ("booleanValue" in v) return v.booleanValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("stringValue" in v) return v.stringValue;
  if ("arrayValue" in v) return (v.arrayValue.values ?? []).map(decode);
  if ("mapValue" in v) return Object.fromEntries(Object.entries(v.mapValue.fields ?? {}).map(([k, x]) => [k, decode(x)]));
  return null;
}

// A document is capped at 1 MiB: big step inputs and outputs (research dumps) are trimmed for the feed.
const MAX_PART = 24_000;
function trim(x: unknown) {
  if (x === undefined) return undefined;
  const json = JSON.stringify(x);
  return json && json.length > MAX_PART ? { trimmed: true, preview: json.slice(0, 2_000) } : x;
}

async function call(path: string, init: RequestInit) {
  const res = await fetch(`${base()}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${await googleAccessToken()}`, "content-type": "application/json", ...init.headers },
    signal: AbortSignal.timeout(5_000),
  });
  if (!res.ok && res.status !== 404) throw new Error(`Firestore ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res;
}

// ---------------------------------------------------------------- writes

const pending = new Map<string, StoredRun>();
const writing = new Set<string>();

/**
 * Queue the run's latest state. Writes for one run go one at a time and always
 * send the newest snapshot, so a burst of parallel steps costs a few writes and
 * never lands an older state last. Never throws.
 */
export function mirrorRun(run: StoredRun) {
  if (!firestoreEnabled()) return;
  pending.set(run.id, run);
  if (!writing.has(run.id)) void flush(run.id);
}

async function flush(id: string) {
  writing.add(id);
  try {
    for (let r = pending.get(id); r; r = pending.get(id)) {
      pending.delete(id);
      const doc = { ...r, steps: r.steps.map((s) => ({ ...s, input: trim(s.input), output: trim(s.output) })), updated_at: new Date().toISOString() };
      await call(`/agent_runs/${id}`, { method: "PATCH", body: JSON.stringify({ fields: (encode(doc) as { mapValue: { fields: Record<string, Value> } }).mapValue.fields }) }).catch((err) =>
        console.error(JSON.stringify({ level: "warn", msg: "firestore write failed", run: id, err: String(err) })),
      );
    }
  } finally {
    writing.delete(id);
  }
}

// ---------------------------------------------------------------- reads

const fromDoc = (doc: { fields?: Record<string, Value> }) => decode({ mapValue: { fields: doc.fields ?? {} } }) as StoredRun;

/** One run from Firestore, or null when it is not there (or Firestore is off). */
export async function readRun(id: string): Promise<StoredRun | null> {
  if (!firestoreEnabled()) return null;
  try {
    const res = await call(`/agent_runs/${id}`, { method: "GET" });
    if (res.status === 404) return null;
    return fromDoc(await res.json());
  } catch (err) {
    console.error(JSON.stringify({ level: "warn", msg: "firestore read failed", run: id, err: String(err) }));
    return null;
  }
}

/** Several runs at once; missing ones are left out. */
export async function readRuns(ids: string[]): Promise<Map<string, StoredRun>> {
  const out = new Map<string, StoredRun>();
  if (!firestoreEnabled() || !ids.length) return out;
  try {
    const res = await call(":batchGet", { method: "POST", body: JSON.stringify({ documents: ids.map(docName) }) });
    for (const item of (await res.json()) as { found?: { fields?: Record<string, Value> } }[]) if (item.found) {
      const r = fromDoc(item.found);
      out.set(r.id, r);
    }
  } catch (err) {
    console.error(JSON.stringify({ level: "warn", msg: "firestore batch read failed", err: String(err) }));
  }
  return out;
}
