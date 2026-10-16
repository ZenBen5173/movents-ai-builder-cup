import { test } from "node:test";
import assert from "node:assert/strict";

if (!process.env.DATABASE_URL) process.env.PGLITE_DIR = "memory://";
process.env.DEMO_MODE = "1";
process.env.GEMINI_API_KEY = "test-key";
process.env.GEMINI_MODEL = "gemini-test";
process.env.GEMINI_FALLBACK_MODELS = "gemini-test-2";

const { parsePrompt } = await import("../src/lib/planning");
const { mergeBrief, timeSaved } = await import("../src/lib/agent/gemini/brief");
const { citedChunks } = await import("../src/lib/agent/gemini/research");
const { parseJson, gemini } = await import("../src/lib/ai/gemini");
const { declaration, runToolAgent } = await import("../src/lib/agent/gemini/loop");
const { withAgent } = await import("../src/lib/agent/context");
const { Run } = await import("../src/lib/agent/run");
const { gate, decideDraft } = await import("../src/lib/actions");
const { createDemoSandbox } = await import("../src/lib/demo");
const { one, query } = await import("../src/lib/db");
const T = await import("../src/lib/agent/tools");
type User = import("../src/lib/types").User;

const TODAY = "2026-10-16";

/** Answer Gemini calls from a script instead of the network. */
function fakeGemini(replies: ((body: Record<string, unknown>, model: string) => Response)[]) {
  const real = globalThis.fetch;
  const seen: { model: string; body: Record<string, unknown>; url: string; headers: Record<string, string> }[] = [];
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    const u = String(url);
    if (!u.includes("generativelanguage.googleapis.com") && !u.includes("aiplatform.googleapis.com")) return real(url, init);
    const model = u.match(/models\/([^:]+):/)?.[1] ?? "";
    const body = JSON.parse(String(init?.body ?? "{}"));
    seen.push({ model, body, url: u, headers: (init?.headers ?? {}) as Record<string, string> });
    const next = replies.shift();
    if (!next) throw new Error("unexpected Gemini call");
    return next(body, model);
  }) as typeof fetch;
  return { seen, restore: () => (globalThis.fetch = real) };
}
const ok = (parts: unknown[]) => () => new Response(JSON.stringify({ candidates: [{ content: { role: "model", parts } }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 } }), { status: 200 });
const fail = (status: number) => () => new Response(JSON.stringify({ error: { message: "busy" } }), { status });

async function sandbox() {
  const userId = await createDemoSandbox();
  return (await one<User>("SELECT * FROM users WHERE id = $1", [userId]))!;
}

test("mergeBrief: Gemini's reading wins where valid, rules fill the rest", () => {
  const base = parsePrompt("We want a workshop with Hafiz next month", TODAY);
  const m = mergeBrief(base, { title: "Gemini Hands-on Workshop", date: "2026-11-14", start_time: "09:00", end_time: "12:00", pax: 80, budget_rm: 1500, team: ["Hafiz Ismail"], assumptions: [] }, TODAY);
  assert.equal(m.title, "Gemini Hands-on Workshop");
  assert.equal(m.date, "2026-11-14");
  assert.equal(m.pax, 80);
  assert.equal(m.budget, 1500);
  assert.equal(m.startTime, "09:00");
  assert.deepEqual(m.team, ["Hafiz Ismail"], "first name from the rule parse is folded into the full name");
  assert.deepEqual(m.missing, []);
});

test("mergeBrief: bad values are ignored and every default is stated as an assumption", () => {
  const base = parsePrompt("A talk about robots", TODAY);
  const m = mergeBrief(base, { date: "2020-01-01", pax: 0, budget_rm: -5, end_time: "25:99", assumptions: [] }, TODAY);
  assert.equal(m.date, base.date, "a past date is not taken");
  assert.equal(m.pax, base.pax);
  assert.ok(m.assumptions.some((a) => a.includes("Headcount")));
  assert.ok(m.assumptions.some((a) => a.includes("Budget")));
  assert.ok(m.endTime > m.startTime);
});

test("citations: an item is backed only when a cited passage names it", () => {
  const g = {
    queries: ["ai healthcare speakers malaysia"],
    chunks: [{ uri: "https://a.example/1", title: "a.example" }, { uri: "https://b.example/2", title: "b.example" }],
    supports: [
      { text: "Dr. Aisha Tan leads the AI lab at Hospital X.", chunks: [0] },
      { text: "Ravi Kumar founded MedAI Sdn Bhd in 2019.", chunks: [1] },
    ],
  };
  assert.deepEqual(citedChunks(g, "Aisha Tan"), [0]);
  assert.deepEqual(citedChunks(g, "Dr Aisha Tan"), [0]);
  assert.deepEqual(citedChunks(g, "MedAI Sdn. Bhd."), [1]);
  assert.deepEqual(citedChunks(g, "John Invented"), []);
});

test("citations: a person is backed by cited sentences in their own section of the answer", () => {
  const text = ["1. **Prof. Dr. Sarinder Kaur**", "* Founder of Sarinder Labs at Universiti Malaya.", "2. **Dr. Kev Lim**", "* Leads a Malaysian health-tech company.", "3. **Made Up Person**", "* Does things."].join(String.fromCharCode(10));
  const g = {
    queries: [],
    chunks: [{ uri: "https://um.example", title: "um" }, { uri: "https://qmed.example", title: "qmed" }],
    supports: [
      { text: "* Founder of Sarinder Labs at Universiti Malaya.", chunks: [0] },
      { text: "* Leads a Malaysian health-tech company.", chunks: [1] },
    ],
  };
  const names = ["Prof. Dr. Sarinder Kaur", "Dr. Kev Lim", "Made Up Person"];
  assert.deepEqual(citedChunks(g, names[0], { text, names }), [0]);
  assert.deepEqual(citedChunks(g, names[1], { text, names }), [1]);
  assert.deepEqual(citedChunks(g, names[2], { text, names }), [], "no cited sentence in their section");
});

test("time saved counts each piece of work once and ignores unknown keys", () => {
  const t = timeSaved(["proposal", "proposal", "budget", "nope"]);
  assert.equal(t.items.length, 2);
  assert.equal(t.hours, 8);
});

test("parseJson reads fenced or padded JSON", () => {
  assert.deepEqual(parseJson('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(parseJson('Here you go: {"a":[1,2]} done'), { a: [1, 2] });
  assert.equal(parseJson("no json here"), null);
});

test("tool declarations hide the run and event ids the agent never picks", () => {
  const d = declaration("write_proposal_sections");
  const props = (d.parametersJsonSchema as { properties: Record<string, unknown>; required?: string[] }).properties;
  assert.ok(!("event_id" in props) && !("run_id" in props));
  assert.ok("objectives" in props);
  assert.equal((d.parametersJsonSchema as { required?: string[] }).required, undefined);
});

test("Gemini client falls back to the next model when one is busy", async () => {
  const f = fakeGemini([fail(503), ok([{ text: "hello" }])]);
  try {
    const r = await gemini({ contents: [{ role: "user", parts: [{ text: "hi" }] }] });
    assert.equal(r.text, "hello");
    assert.equal(r.model, "gemini-test-2");
    assert.deepEqual(f.seen.map((s) => s.model), ["gemini-test", "gemini-test-2"]);
  } finally {
    f.restore();
  }
});

test("Vertex AI mode calls the project's Gemini endpoint with a Google Cloud token, no API key", async () => {
  const saved = { p: process.env.GEMINI_PROVIDER, proj: process.env.GOOGLE_CLOUD_PROJECT, tok: process.env.GOOGLE_ACCESS_TOKEN };
  Object.assign(process.env, { GEMINI_PROVIDER: "vertex", GOOGLE_CLOUD_PROJECT: "proj-1", GOOGLE_ACCESS_TOKEN: "tok-1" });
  const f = fakeGemini([fail(429), ok([{ text: "from vertex" }])]);
  try {
    const r = await gemini({ contents: [{ role: "user", parts: [{ text: "hi" }] }] });
    assert.equal(r.text, "from vertex");
    assert.equal(f.seen[0].url, "https://aiplatform.googleapis.com/v1/projects/proj-1/locations/global/publishers/google/models/gemini-test:generateContent");
    assert.equal(f.seen[0].headers.authorization, "Bearer tok-1");
    assert.ok(!("x-goog-api-key" in f.seen[0].headers));
  } finally {
    f.restore();
    for (const [k, v] of [["GEMINI_PROVIDER", saved.p], ["GOOGLE_CLOUD_PROJECT", saved.proj], ["GOOGLE_ACCESS_TOKEN", saved.tok]] as const) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
});

test("agent loop: Gemini calls a tool, Movents runs it, the result goes back, the step is traced", async () => {
  const user = await sandbox();
  const ev = await T.createEvent(user, parsePrompt("Plan a 100-pax AI talk at Sunway on 15 Dec, budget RM3,000", TODAY));
  const run = await Run.start(user, "test", "plan", "gemini");
  await run.setEvent(ev.id);
  const f = fakeGemini([
    ok([{ functionCall: { id: "c1", name: "write_proposal_sections", args: { objectives: ["Teach prompt design"], event_id: "evt_someone_else" } }, thoughtSignature: "sig" }]),
    (body) => {
      // The model's own turn (with its thought signature) is sent back untouched, then our tool result.
      const contents = body.contents as { role: string; parts: Record<string, unknown>[] }[];
      assert.equal(contents[1].parts[0].thoughtSignature, "sig");
      const reply = contents[2].parts[0].functionResponse as { id: string; response: { result?: { written: string[] } } };
      assert.equal(reply.id, "c1");
      assert.deepEqual(reply.response.result?.written, ["objectives"]);
      return ok([{ text: "Wrote the objectives." }])();
    },
  ]);
  try {
    const r = await runToolAgent({ run, user, eventId: ev.id, label: "Gemini · proposal agent", system: "s", task: "t", tools: ["write_proposal_sections"] });
    assert.equal(r.text, "Wrote the objectives.");
    assert.equal(r.log.length, 1);
    const row = await one<{ steps: { tool: string; status: string }[] }>("SELECT steps FROM agent_runs WHERE id = $1", [run.id]);
    assert.ok(row?.steps.some((s) => s.tool === "Gemini · proposal agent → write_proposal_sections" && s.status === "ok"));
    const saved = await one<{ p: { objectives: string[] } }>("SELECT preferences->'proposal' AS p FROM events WHERE id = $1", [ev.id]);
    assert.deepEqual(saved?.p.objectives, ["Teach prompt design"], "written to this run's event, not the one the model named");
  } finally {
    f.restore();
  }
});

test("agent loop: a tool the agent was not given is refused and reported back to the model", async () => {
  const user = await sandbox();
  const ev = await T.createEvent(user, parsePrompt("Plan a 50-pax workshop at Sunway on 10 Dec, budget RM1,000", TODAY));
  const run = await Run.start(user, "test", "plan", "gemini");
  const f = fakeGemini([ok([{ functionCall: { name: "publish_event", args: {} } }]), ok([{ text: "ok" }])]);
  try {
    const r = await runToolAgent({ run, user, eventId: ev.id, label: "Gemini · x", system: "s", task: "t", tools: ["read_sop"] });
    assert.match(r.log[0].error ?? "", /not available/);
    assert.equal(Number((await one<{ n: number }>("SELECT count(*)::int AS n FROM approval_requests WHERE event_id = $1", [ev.id]))?.n), 0);
  } finally {
    f.restore();
  }
});

test("from the AI agent: money and faculty wait for sign-off, outreach becomes a draft you send", async () => {
  const user = await sandbox();
  assert.equal(user.role, "president");
  const ev = await T.createEvent(user, parsePrompt("Plan a 60-pax talk at Sunway on 12 Dec, budget RM2,000", TODAY));
  const run = await Run.start(user, "test", "plan", "gemini");
  const agent = <R,>(fn: () => Promise<R>) => withAgent({ run, label: "Gemini · approvals", requireApproval: true }, fn);
  const budget = await agent(() => gate(user, "budget.approve", "Approve budget", { event_id: ev.id, amount: 1800 }, { eventId: ev.id, runId: run.id, amount: 1800 }));
  assert.equal(budget.status, "blocked", "even a President's AI run waits for sign-off on money");
  const [sp] = await T.saveSpeakers(ev.id, [{ name: "Dr X", headline: "AI lead", source_url: "https://x.example" }]);
  const invite = await agent(() => gate(user, "email.speaker", "Invite Dr X", { speaker_id: sp.id, to: "", subject: "Invitation", html: "<p>Hi</p>" }, { eventId: ev.id, runId: run.id }));
  assert.equal(invite.status, "drafted");
  const rows = await query<{ status: string; approver_role: string; action_type: string }>("SELECT status, approver_role, action_type FROM approval_requests WHERE event_id = $1 ORDER BY created_at", [ev.id]);
  assert.deepEqual(rows.map((r) => r.status), ["pending", "draft"], "only the budget reaches Backstage");
  // The draft needs an address, then sends as the user's own action.
  const draftId = invite.status === "drafted" ? invite.approval.id : "";
  await assert.rejects(() => decideDraft(user, draftId, "send"), /valid email/);
  const sent = await decideDraft(user, draftId, "send", { to: "speaker@example.com" });
  assert.equal(sent.status, "executed");
  const mail = await one<{ intended_to: string; status: string }>("SELECT intended_to, status FROM emails WHERE event_id = $1", [ev.id]);
  assert.equal(mail?.intended_to, "speaker@example.com");
  assert.equal((await one<{ email: string }>("SELECT email FROM speakers WHERE id = $1", [sp.id]))?.email, "speaker@example.com", "the address is remembered");
  await assert.rejects(() => decideDraft(user, draftId, "send"), /not found|already sent/);
});

test("demo sandboxes are separate societies", async () => {
  const a = await sandbox();
  const b = await sandbox();
  assert.notEqual(a.society_id, b.society_id);
  const team = await query("SELECT 1 FROM memberships WHERE society_id = $1", [a.society_id]);
  assert.equal(team.length, 8);
});
