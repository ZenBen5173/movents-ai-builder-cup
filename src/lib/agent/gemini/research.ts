import "server-only";
import { GeminiError, gemini, geminiJson, resolveCitation, type Grounding } from "../../ai/gemini";

/**
 * Web research with Google Search grounding, in two calls:
 * 1. a grounded answer in plain text, with Google's citations attached;
 * 2. a JSON extraction of that answer.
 * Then every item is checked against the citations: an item (a person, a
 * supplier, a company) is kept only when a cited passage names it or sits in
 * its own part of the answer, and its link is that citation. Anything the
 * model cannot back with a source is dropped.
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

/** Titles and company suffixes that say nothing about who or which one. */
const FILLER = new Set(["the", "and", "sdn", "bhd", "dr", "prof", "professor", "assoc", "associate", "assistant", "dato", "datuk", "datin", "tan", "sri", "puan", "encik", "ir", "ts", "mr", "ms", "mrs"]);

/** The distinctive words of a name: "Prof. Dr. Sarinder Kaur" → ["sarinder", "kaur"]. */
const keyWords = (name: string) => norm(name).split(" ").filter((w) => w.length > 1 && !FILLER.has(w));

const mentions = (text: string, name: string) => {
  const key = keyWords(name);
  const t = ` ${norm(text)} `;
  return key.length > 0 && key.every((w) => t.includes(` ${w} `));
};

/**
 * The cited chunks that back `name`: passages that mention it, or, when an
 * answer is given, passages inside that item's own section (from where the
 * item is named to where the next item starts), since Google often cites the
 * sentences about a person rather than the line with their name.
 */
export function citedChunks(g: Grounding, name: string, answer?: { text: string; names: string[] }): number[] {
  const out = new Set<number>();
  for (const s of g.supports) if (mentions(s.text, name)) s.chunks.forEach((c) => out.add(c));
  if (answer && !out.size) {
    const block = section(answer.text, name, answer.names);
    if (block) for (const s of g.supports) if (s.text.trim().length > 15 && block.includes(norm(s.text))) s.chunks.forEach((c) => out.add(c));
  }
  return [...out].filter((i) => g.chunks[i]?.uri);
}

/** The normalised part of `text` about `name`, up to the next item named in `names`. */
function section(text: string, name: string, names: string[]) {
  const t = norm(text);
  const at = (n: string) => {
    const key = keyWords(n);
    if (!key.length) return -1;
    const i = t.indexOf(key.join(" "));
    return i >= 0 ? i : t.indexOf(key[key.length - 1]);
  };
  const start = at(name);
  if (start < 0) return null;
  const next = names.map(at).filter((i) => i > start).sort((a, b) => a - b)[0];
  return t.slice(start, next ?? undefined);
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
  const names = items.map((x) => x.name);
  for (const it of items) {
    const idx = citedChunks(g, it.name, { text: answer.text, names });
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
