import "server-only";

/**
 * Gemini client for the in-app agents (generateContent over REST), on either:
 * - Vertex AI (GEMINI_PROVIDER=vertex): Google Cloud's Gemini, billed to the
 *   project, authenticated as the Cloud Run service account. Used in production.
 * - the Gemini API with GEMINI_API_KEY (default when a key is set): for local work.
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

type Provider = "vertex" | "api";

export function geminiProvider(): Provider | null {
  const p = process.env.GEMINI_PROVIDER;
  if (p === "vertex") return process.env.GOOGLE_CLOUD_PROJECT ? "vertex" : null;
  return process.env.GEMINI_API_KEY ? "api" : null;
}

export function geminiEnabled() {
  return geminiProvider() !== null;
}

function endpoint(provider: Provider, model: string) {
  if (provider === "api") return `${API}/${model}:generateContent`;
  const loc = process.env.VERTEX_LOCATION || "global";
  const host = loc === "global" ? "aiplatform.googleapis.com" : `${loc}-aiplatform.googleapis.com`;
  return `https://${host}/v1/projects/${process.env.GOOGLE_CLOUD_PROJECT}/locations/${loc}/publishers/google/models/${model}:generateContent`;
}

let token: { value: string; until: number } | null = null;

/** The service account's access token from the Cloud Run metadata server (GOOGLE_ACCESS_TOKEN overrides, for local tests). */
async function vertexToken() {
  if (process.env.GOOGLE_ACCESS_TOKEN) return process.env.GOOGLE_ACCESS_TOKEN;
  if (token && token.until > Date.now() + 60_000) return token.value;
  let res: Response;
  try {
    res = await fetch("http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token", { headers: { "Metadata-Flavor": "Google" }, signal: AbortSignal.timeout(3000) });
  } catch {
    // Local development: borrow the developer's gcloud sign-in.
    if (process.env.NODE_ENV !== "production") {
      const value = await gcloudToken();
      token = { value, until: Date.now() + 45 * 60_000 };
      return value;
    }
    throw new GeminiError("No Google Cloud credentials here (Vertex AI needs to run on Google Cloud, or set GOOGLE_ACCESS_TOKEN)", 401, "auth");
  }
  if (!res.ok) throw new GeminiError(`Could not get a Google Cloud access token (${res.status})`, 401, "auth");
  const j = (await res.json()) as { access_token: string; expires_in: number };
  token = { value: j.access_token, until: Date.now() + j.expires_in * 1000 };
  return token.value;
}

async function gcloudToken() {
  const { exec } = await import("node:child_process");
  return new Promise<string>((resolve, reject) =>
    exec("gcloud auth print-access-token", { timeout: 20_000, windowsHide: true }, (err, stdout) => {
      const t = String(stdout ?? "").trim().split(/\s+/).pop() ?? "";
      if (err || !t) reject(new GeminiError("Vertex AI locally needs `gcloud auth login` (or GOOGLE_ACCESS_TOKEN)", 401, "auth"));
      else resolve(t);
    }),
  );
}

async function authHeaders(provider: Provider): Promise<Record<string, string>> {
  return provider === "api" ? { "x-goog-api-key": process.env.GEMINI_API_KEY! } : { authorization: `Bearer ${await vertexToken()}` };
}

export function modelChain(first?: string) {
  const primary = process.env.GEMINI_MODEL || "gemini-3.5-flash";
  const fallbacks = (process.env.GEMINI_FALLBACK_MODELS ?? "gemini-3-flash-preview,gemini-3.5-flash-lite").split(/[,;]/).map((m) => m.trim()).filter(Boolean);
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
  const provider = geminiProvider();
  if (!provider) throw new GeminiError("Gemini is not configured (set GEMINI_API_KEY, or GEMINI_PROVIDER=vertex with GOOGLE_CLOUD_PROJECT)", 401, "auth");
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
        return await slot(async () => callOnce(provider, model, await authHeaders(provider), body, req.timeoutMs ?? 45_000));
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
    if (quotaOnly && req.search && provider === "api") break;
    await sleep(1500 * 2 ** pass + Math.random() * 500);
  }
  throw last ?? new GeminiError("Gemini call failed", 500, "other");
}

async function callOnce(provider: Provider, model: string, auth: Record<string, string>, body: string, timeoutMs: number): Promise<GeminiResponse> {
  let res: Response;
  try {
    res = await fetch(endpoint(provider, model), { method: "POST", headers: { "content-type": "application/json", ...auth }, body, signal: AbortSignal.timeout(timeoutMs) });
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
    // On Vertex AI a 429 is shared capacity running short, so worth a retry; on the API it is the key's quota.
    const kind = res.status === 429 ? (provider === "vertex" ? "busy" : "quota") : res.status === 402 ? "quota" : res.status === 401 || res.status === 403 ? "auth" : res.status === 400 ? "bad_request" : res.status === 404 || res.status >= 500 ? "busy" : "other";
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
