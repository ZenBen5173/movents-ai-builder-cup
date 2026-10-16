import "server-only";

/**
 * Gemini API client for the in-app agents (generateContent over REST).
 * - Model chain: GEMINI_MODEL first, then GEMINI_FALLBACK_MODELS, so a busy
 *   model (503) or an exhausted one (429) does not stop a run.
 * - At most GEMINI_CONCURRENCY calls in flight, so parallel agents stay
 *   inside the key's rate limit.
 * - Function calling, Google Search grounding and JSON output.
 * The model's own content is returned untouched: Gemini 3 needs its thought
 * signatures sent back as they came on the next turn.
 */

export type Part = {
  text?: string;
  thought?: boolean;
  thoughtSignature?: string;
  functionCall?: { id?: string; name: string; args?: Record<string, unknown> };
  functionResponse?: { id?: string; name: string; response: Record<string, unknown> };
};
export type Content = { role: "user" | "model"; parts: Part[] };
export type FunctionDecl = { name: string; description: string; parametersJsonSchema: Record<string, unknown> };
export type Citation = { uri: string; title: string };
export type Grounding = { queries: string[]; chunks: Citation[]; supports: { text: string; chunks: number[] }[] };

export type GeminiRequest = {
  system?: string;
  contents: Content[];
  functions?: FunctionDecl[];
  /** Google Search grounding. */
  search?: boolean;
  /** JSON Schema for a JSON answer. */
  json?: Record<string, unknown>;
  temperature?: number;
  /** Try this model first (keeps one agent's conversation on one model). */
  model?: string;
  timeoutMs?: number;
};

export type GeminiResponse = {
  model: string;
  content: Content;
  text: string;
  calls: { id?: string; name: string; args: Record<string, unknown> }[];
  grounding: Grounding | null;
  usage: { input: number; output: number };
};

export class GeminiError extends Error {
  constructor(
    message: string,
    public status: number,
    public kind: "quota" | "busy" | "bad_request" | "auth" | "other",
  ) {
    super(message);
  }
}

const API = "https://generativelanguage.googleapis.com/v1beta/models";

export function geminiEnabled() {
  return Boolean(process.env.GEMINI_API_KEY);
}

export function modelChain(first?: string) {
  const primary = process.env.GEMINI_MODEL || "gemini-3.5-flash";
  const fallbacks = (process.env.GEMINI_FALLBACK_MODELS ?? "gemini-3-flash-preview,gemini-3.5-flash-lite").split(",").map((m) => m.trim()).filter(Boolean);
  return [...new Set([first, primary, ...fallbacks].filter((m): m is string => Boolean(m)))];
}

// ------------------------------------------------------------------ concurrency

let active = 0;
const waiting: (() => void)[] = [];

async function slot<T>(fn: () => Promise<T>): Promise<T> {
  const limit = Math.max(1, Number(process.env.GEMINI_CONCURRENCY ?? 4));
  if (active >= limit) await new Promise<void>((r) => waiting.push(r));
  active++;
  try {
    return await fn();
  } finally {
    active--;
    waiting.shift()?.();
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------------------ call

/** Running totals for this process, shown on the health check. */
export const usage = { calls: 0, input: 0, output: 0, errors: 0 };

export async function gemini(req: GeminiRequest): Promise<GeminiResponse> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new GeminiError("GEMINI_API_KEY is not set", 401, "auth");
  const body = JSON.stringify({
    ...(req.system ? { systemInstruction: { parts: [{ text: req.system }] } } : {}),
    contents: req.contents,
    ...(req.functions?.length || req.search
      ? { tools: [...(req.search ? [{ google_search: {} }] : []), ...(req.functions?.length ? [{ functionDeclarations: req.functions }] : [])] }
      : {}),
    generationConfig: {
      temperature: req.temperature ?? 0.4,
      thinkingConfig: { thinkingLevel: "low" },
      ...(req.json ? { responseMimeType: "application/json", responseJsonSchema: req.json } : {}),
    },
  });

  const models = modelChain(req.model);
  let last: GeminiError | null = null;
  // A few passes over the chain: busy spells usually clear in seconds.
  for (let pass = 0; pass < 3; pass++) {
    let quotaOnly = true;
    for (const model of models) {
      try {
        return await slot(() => callOnce(model, key, body, req.timeoutMs ?? 45_000));
      } catch (err) {
        if (!(err instanceof GeminiError)) throw err;
        last = err;
        usage.errors++;
        console.warn(`[gemini] ${err.message.slice(0, 160)}`);
        // A bad request or a bad key fails the same way on every model.
        if (err.kind === "bad_request" || err.kind === "auth") throw err;
        if (err.kind !== "quota") quotaOnly = false;
      }
    }
    // Search grounding without billing is refused on every model: no point waiting.
    if (quotaOnly && req.search) break;
    await sleep(1500 * 2 ** pass + Math.random() * 500);
  }
  throw last ?? new GeminiError("Gemini call failed", 500, "other");
}

async function callOnce(model: string, key: string, body: string, timeoutMs: number): Promise<GeminiResponse> {
  let res: Response;
  try {
    res = await fetch(`${API}/${model}:generateContent`, { method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": key }, body, signal: AbortSignal.timeout(timeoutMs) });
  } catch (err) {
    throw new GeminiError(`Gemini ${model} unreachable: ${err instanceof Error ? err.message : String(err)}`, 503, "busy");
  }
  if (!res.ok) {
    const text = await res.text();
    const msg = (() => {
      try {
        return (JSON.parse(text) as { error?: { message?: string } }).error?.message ?? text;
      } catch {
        return text;
      }
    })().slice(0, 300);
    const kind = res.status === 429 ? "quota" : res.status === 401 || res.status === 403 ? "auth" : res.status === 400 ? "bad_request" : res.status === 404 || res.status >= 500 ? "busy" : "other";
    throw new GeminiError(`Gemini ${model} ${res.status}: ${msg}`, res.status, kind);
  }
  const json = (await res.json()) as {
    candidates?: { content?: Content; finishReason?: string; groundingMetadata?: RawGrounding }[];
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number };
    promptFeedback?: { blockReason?: string };
  };
  const cand = json.candidates?.[0];
  if (!cand?.content?.parts?.length) {
    const why = json.promptFeedback?.blockReason ?? cand?.finishReason ?? "empty answer";
    throw new GeminiError(`Gemini ${model} returned no content (${why})`, 502, "busy");
  }
  const content: Content = { role: "model", parts: cand.content.parts };
  const input = json.usageMetadata?.promptTokenCount ?? 0;
  const output = (json.usageMetadata?.candidatesTokenCount ?? 0) + (json.usageMetadata?.thoughtsTokenCount ?? 0);
  usage.calls++;
  usage.input += input;
  usage.output += output;
  return {
    model,
    content,
    text: content.parts.filter((p) => p.text && !p.thought).map((p) => p.text).join(""),
    calls: content.parts.filter((p) => p.functionCall).map((p) => ({ id: p.functionCall!.id, name: p.functionCall!.name, args: p.functionCall!.args ?? {} })),
    grounding: grounding(cand.groundingMetadata),
    usage: { input, output },
  };
}

type RawGrounding = {
  webSearchQueries?: string[];
  groundingChunks?: { web?: { uri?: string; title?: string } }[];
  groundingSupports?: { segment?: { text?: string }; groundingChunkIndices?: number[] }[];
};

function grounding(g: RawGrounding | undefined): Grounding | null {
  if (!g?.groundingChunks?.length) return null;
  return {
    queries: g.webSearchQueries ?? [],
    chunks: g.groundingChunks.map((c) => ({ uri: c.web?.uri ?? "", title: c.web?.title ?? "" })),
    supports: (g.groundingSupports ?? []).map((s) => ({ text: s.segment?.text ?? "", chunks: s.groundingChunkIndices ?? [] })),
  };
}

/** Parse a JSON answer; tolerates a ```json fence or text around the object. */
export function parseJson<T>(text: string): T | null {
  const t = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "").trim();
  for (const candidate of [t, t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1), t.slice(t.indexOf("["), t.lastIndexOf("]") + 1)]) {
    if (!candidate) continue;
    try {
      return JSON.parse(candidate) as T;
    } catch {
      /* try the next shape */
    }
  }
  return null;
}

/** One JSON answer from a prompt. */
export async function geminiJson<T>(opts: { system?: string; prompt: string; schema: Record<string, unknown>; temperature?: number }): Promise<{ data: T; model: string }> {
  const r = await gemini({ system: opts.system, contents: [{ role: "user", parts: [{ text: opts.prompt }] }], json: opts.schema, temperature: opts.temperature });
  const data = parseJson<T>(r.text);
  if (data == null) throw new GeminiError(`Gemini ${r.model} returned invalid JSON`, 502, "other");
  return { data, model: r.model };
}

/**
 * Search grounding links point at a Google redirect. Follow it once to get
 * the real page, so citations stay readable and keep working.
 */
export async function resolveCitation(uri: string): Promise<string> {
  if (!/vertexaisearch\.cloud\.google\.com\/grounding-api-redirect/.test(uri)) return uri;
  try {
    const res = await fetch(uri, { method: "HEAD", redirect: "manual", signal: AbortSignal.timeout(6000) });
    const loc = res.headers.get("location");
    return loc && /^https?:\/\//.test(loc) ? loc : uri;
  } catch {
    return uri;
  }
}
