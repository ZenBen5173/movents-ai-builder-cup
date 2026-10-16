import "server-only";
import { GeminiError, gemini, geminiJson, resolveCitation, type Grounding } from "../../ai/gemini";

/**
 * Web research with Google Search grounding, in two calls:
 * 1. a grounded answer in plain text, with Google's citations attached;
 * 2. a JSON extraction of that answer.
 * Then every item is checked against the citations: an item (a person, a
 * supplier, a company) is kept only when a cited passage names it, and its
 * link is that citation. Anything the model cannot back with a source is dropped.
 */

export type Researched<T> = {
  mode: "live" | "unavailable";
  kept: (T & { source_url: string; source_title: string })[];
  dropped: { name: string; reason: string }[];
  queries: string[];
  citations: number;
  note?: string;
};

const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

/** The cited chunks for passages that mention `name` (full name, or its two most distinctive words). */
export function citedChunks(g: Grounding, name: string): number[] {
  const n = norm(name);
  if (!n) return [];
  const words = n.split(" ").filter((w) => w.length > 2 && !["the", "and", "sdn", "bhd", "dr", "prof"].includes(w));
  const key = words.length > 1 ? words.slice(0, 2) : words;
  const out = new Set<number>();
  for (const s of g.supports) {
    const t = norm(s.text);
    if (t.includes(n) || (key.length && key.every((w) => t.includes(w)))) s.chunks.forEach((c) => out.add(c));
  }
  return [...out].filter((i) => g.chunks[i]?.uri);
}

export async function groundedResearch<T extends { name: string }>(opts: {
  question: string;
  schema: Record<string, unknown>;
  extractInstruction: string;
  /** Pull the list out of the extraction JSON. */
  pick: (data: unknown) => T[];
}): Promise<Researched<T>> {
  let answer;
  try {
    answer = await gemini({ contents: [{ role: "user", parts: [{ text: opts.question }] }], search: true, temperature: 0.2 });
  } catch (err) {
    if (err instanceof GeminiError && (err.kind === "quota" || err.kind === "auth")) {
      return { mode: "unavailable", kept: [], dropped: [], queries: [], citations: 0, note: "Google Search grounding is not enabled for this API key (it needs billing on the Google Cloud project). Nothing was invented." };
    }
    throw err;
  }
  const g = answer.grounding;
  if (!g) return { mode: "live", kept: [], dropped: [], queries: [], citations: 0, note: "Gemini answered without searching, so there were no sources to cite. Nothing saved." };

  const { data } = await geminiJson<unknown>({
    system: "You extract structured data from a research answer. Use only facts stated in the answer. Never add people, companies or prices that are not in it.",
    prompt: `${opts.extractInstruction}\n\nResearch answer:\n"""\n${answer.text}\n"""`,
    schema: opts.schema,
    temperature: 0,
  });
  const items = opts.pick(data);
  const kept: Researched<T>["kept"] = [];
  const dropped: Researched<T>["dropped"] = [];
  const resolved = new Map<number, string>();
  for (const it of items) {
    const idx = citedChunks(g, it.name);
    if (!idx.length) {
      dropped.push({ name: it.name, reason: "not backed by a cited search result" });
      continue;
    }
    const i = idx[0];
    if (!resolved.has(i)) resolved.set(i, await resolveCitation(g.chunks[i].uri));
    kept.push({ ...it, source_url: resolved.get(i)!, source_title: g.chunks[i].title });
  }
  return { mode: "live", kept, dropped, queries: g.queries, citations: g.chunks.length };
}
