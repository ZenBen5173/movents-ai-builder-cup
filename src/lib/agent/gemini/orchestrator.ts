import "server-only";
import { gemini, geminiJson, GeminiError, resolveCitation } from "../../ai/gemini";
import { fmtDate, fmtRM, today } from "../../appurl";
import { audit } from "../../audit";
import { one, query } from "../../db";
import { parsePrompt } from "../../planning";
import type { Speaker, User, Venue } from "../../types";
import { withAgent } from "../context";
import { execute } from "../pipelines";
import { findTool, outputs } from "../registry";
import { Run } from "../run";
import * as T from "../tools";
import { BRIEF_SCHEMA, mergeBrief, timeSaved, type GeminiBrief } from "./brief";
import { runToolAgent, type ToolCallLog } from "./loop";
import { groundedResearch } from "./research";
import { pageImage, pagePreview } from "../../media";

/**
 * The in-app Gemini planner. One prompt in, a full event pack out:
 *
 *   planner      understands the brief, creates the event, reads the SOP,
 *                books a venue, back-plans the timeline, writes briefs
 *   agents       speakers, budget, sponsors, proposal, promotion run in
 *                parallel; then risk & operations (needs speakers + budget)
 *   checker      deterministic SOP checks, then a Gemini review of the whole plan
 *   re-plan      failed areas go back to their agent with the problem (max 2 rounds)
 *   approvals    every outbound action is drafted and queued for a human
 *
 * Every step is written to the run as it happens, so /runs/:id shows it live.
 */

const BASE = `You are one agent in Movents, a team of AI agents that plans university society events in Malaysia for volunteer student committees.
Currency is RM (Malaysian ringgit); times are Malaysia time. Write plain, short British English.
Never invent people, companies, prices, emails or tool results. Use your tools to do the work, then reply with one or two sentences on what you did and anything a human must decide.`;

type AgentKey = "speakers" | "budget" | "sponsors" | "proposal" | "promotion" | "risk";
type Briefs = Record<AgentKey, string>;
type Ctx = {
  run: Run;
  user: User;
  eventId: string;
  card: string;
  briefs: Briefs;
  done: Set<string>;
  notes: Partial<Record<AgentKey, string>>;
  /** Agents that cannot do their job on this server (no web search), so a retry would change nothing. */
  blocked: Set<AgentKey>;
  /** Agents already sent back once: each gets one revision. */
  revised: Set<AgentKey>;
};
type Issue = { agent: AgentKey | "human"; severity: "high" | "medium" | "low"; problem: string; fix: string };

const label = (agent: string) => `Gemini · ${agent}`;
const AGENTS: AgentKey[] = ["speakers", "budget", "sponsors", "proposal", "promotion", "risk"];

export async function geminiPlan(run: Run) {
  const user = run.user;
  try {
    const brief = await understand(run, user);
    if (!brief) return; // Fell back to the rule-based planner, which finishes the run itself.
    const ctx = await foundation(run, user, brief);

    await wave(ctx, ["speakers", "budget", "sponsors", "proposal", "promotion"], {});
    await wave(ctx, ["risk"], {});

    let issues: Issue[] = [];
    for (let round = 1; round <= 3; round++) {
      issues = await check(ctx, round);
      const fixable = issues.filter((i): i is Issue & { agent: AgentKey } => i.agent !== "human" && i.severity !== "low" && !ctx.blocked.has(i.agent) && !ctx.revised.has(i.agent));
      if (!fixable.length || round === 3) break;
      fixable.forEach((i) => ctx.revised.add(i.agent));
      const feedback: Partial<Record<AgentKey, string>> = {};
      for (const i of fixable) feedback[i.agent] = [feedback[i.agent], `${i.problem} Fix: ${i.fix}`].filter(Boolean).join("\n");
      const agents = Object.keys(feedback) as AgentKey[];
      await run.step(`Re-plan, round ${round}`, label("planner"), { feedback }, async () => ({
        status: "warn" as const,
        summary: `Sending ${fixable.length} issue(s) back to: ${agents.join(", ")}`,
        adapt: fixable.map((i) => `${i.agent}: ${i.problem}`).join(" | "),
      }));
      await wave(ctx, agents, feedback);
    }

    await approvals(ctx);
    await finish(ctx, issues);
  } catch (err) {
    await run.finish({ error: err instanceof Error ? err.message : String(err), event_id: run.eventId }, true);
  }
}

// ------------------------------------------------------------------ planner

async function understand(run: Run, user: User) {
  const members = await query<{ name: string; role: string; department: string | null }>("SELECT name, role, department FROM society_members WHERE society_id = $1 AND role <> 'faculty_advisor' ORDER BY name", [user.society_id]);
  const base = parsePrompt(run.prompt, today());
  try {
    return await run.step("Planner: understand the brief", label("planner"), { prompt: run.prompt }, async () => {
      const { data, model } = await geminiJson<GeminiBrief>({
        system: `${BASE}\nYou read an organiser's brief and pull out the event details. Today is ${today()}. Resolve relative dates ("next Friday", "mid November") to YYYY-MM-DD on or after today. Team members must come from this list: ${members.map((m) => `${m.name} (${m.role}${m.department ? `, ${m.department}` : ""})`).join("; ")}.`,
        prompt: run.prompt,
        schema: BRIEF_SCHEMA as unknown as Record<string, unknown>,
        temperature: 0.1,
      });
      const p = mergeBrief(base, data, today());
      return {
        output: { understood: p, model },
        summary: `${p.title}: ${p.pax} pax on ${fmtDate(p.date)}, ${p.startTime} to ${p.endTime}, cap ${fmtRM(p.budget)}${p.team.length ? `, team ${p.team.join(", ")}` : ""}`,
        validation: p.assumptions.length ? p.assumptions.map((a) => ({ check: "Assumed", passed: false, detail: a })) : undefined,
        status: p.assumptions.length ? ("warn" as const) : ("ok" as const),
        brief: { ...p, audience: data.audience ?? "", goals: data.goals ?? [] },
      };
    }).then((r) => r.brief);
  } catch (err) {
    // Gemini down or over quota: the rule-based planner still delivers the plan.
    await run.step("Gemini unavailable, switching to the rule-based planner", "fallback", {}, async () => ({ status: "warn" as const, summary: err instanceof GeminiError ? err.message : String(err) }));
    await execute(run, "plan");
    return null;
  }
}

async function foundation(run: Run, user: User, p: NonNullable<Awaited<ReturnType<typeof understand>>>): Promise<Ctx> {
  const ev = await withAgent({ run, label: label("planner"), requireApproval: true }, () =>
    run.step("Create event", `${label("planner")} → create_event`, { title: p.title, date: p.date, pax: p.pax, budget: p.budget }, async () => {
      const e = await T.createEvent(user, p);
      return { output: { event_id: e.id }, summary: `${e.title} created as a draft, you are the event lead` };
    }),
  );
  const eventId = ev.output!.event_id;
  await run.setEvent(eventId);
  await run.output("Event dashboard", `/events/${eventId}`, "page");
  const ctx: Ctx = { run, user, eventId, card: "", briefs: {} as Briefs, done: new Set(["brief"]), notes: {}, blocked: new Set(), revised: new Set() };

  const planner = await run.step("Planner: SOP, venue, deadlines, timeline", label("planner"), {}, async () => {
    const r = await runToolAgent({
      run,
      user,
      eventId,
      label: label("planner"),
      system: `${BASE}\nYou are the planner. Lay the foundation before the specialist agents start.`,
      task: `Event brief: ${run.prompt}\nUnderstood as: ${p.title}, ${p.topic}, ${p.pax} pax, ${p.date} ${p.startTime} to ${p.endTime}, budget cap RM${p.budget}.\nCall read_sop and match_venue together in one turn, then check_lead_times and plan_timeline together in the next. Then reply with the SOP rules and deadline problems the other agents must respect, in at most 5 short lines.`,
      tools: ["read_sop", "match_venue", "check_lead_times", "plan_timeline"],
    });
    return { output: { notes: r.text, calls: r.log.map((c) => c.name), model: r.model }, summary: r.text.split("\n")[0]?.slice(0, 600), notes: r.text, log: r.log };
  });
  ["sop", "venue", "timeline"].forEach((k) => ctx.done.add(k));
  ctx.card = await eventCard(eventId, p.audience, p.goals);

  const briefs = await run.step("Planner: brief the specialist agents", label("planner"), {}, async () => {
    const { data } = await geminiJson<Briefs>({
      system: `${BASE}\nYou are the planner. Write a short brief (2 to 3 sentences) for each specialist agent, using the event and the SOP notes.`,
      prompt: `${ctx.card}\n\nPlanner notes:\n${planner.notes}`,
      schema: { type: "object", properties: Object.fromEntries(AGENTS.map((a) => [a, { type: "string" }])), required: AGENTS },
    });
    return { output: data, summary: `Briefed ${AGENTS.length} agents: ${AGENTS.join(", ")}`, briefs: data };
  });
  ctx.briefs = briefs.briefs;
  return ctx;
}

async function eventCard(eventId: string, audience = "", goals: string[] = []) {
  const { ev, uni } = await T.eventContext(eventId);
  const venue = ev.venue_id ? await one<Venue>("SELECT name, capacity, cost FROM venues WHERE id = $1", [ev.venue_id]) : null;
  return [
    `Event: ${ev.title} (${ev.topic ?? ""})`,
    `When: ${ev.date}, ${ev.start_time} to ${ev.end_time}`,
    `Where: ${venue ? `${venue.name}, capacity ${venue.capacity}` : "venue not booked"} at ${uni.name}, Malaysia`,
    `Expected attendance: ${ev.pax}. Budget cap: RM${ev.budget_cap}.`,
    audience && `Audience: ${audience}`,
    goals.length ? `Goals: ${goals.join("; ")}` : "",
  ].filter(Boolean).join("\n");
}

// ------------------------------------------------------------------ specialist agents

async function wave(ctx: Ctx, agents: AgentKey[], feedback: Partial<Record<AgentKey, string>>) {
  await Promise.allSettled(agents.map((a) => RUNNERS[a](ctx, feedback[a])));
}

const RUNNERS: Record<AgentKey, (ctx: Ctx, feedback?: string) => Promise<unknown>> = {
  speakers: speakerAgent,
  budget: budgetAgent,
  sponsors: sponsorAgent,
  proposal: (ctx, fb) =>
    toolAgent(ctx, "proposal", "Proposal agent: write the SOP proposal", fb, ["read_sop", "write_proposal_sections"], "Read the SOP, then call write_proposal_sections once with an event-specific overview (2 to 4 sentences), 3 to 5 measurable objectives, learning outcomes and the target audience with expected attendance and how people register. Be concrete to this event; no generic filler.", ["proposal"]),
  promotion: (ctx, fb) =>
    toolAgent(ctx, "promotion", "Promotion agent: marketing kit", fb, ["generate_marketing_kit", "update_creative_copy"], "Call generate_marketing_kit, then rewrite the caption of each poster and social creative with update_creative_copy so it sounds like a student society: specific hook, date, venue, why attend, call to register. Max 4 hashtags each. Skip the video storyboard.", ["promotion"]),
  risk: (ctx, fb) =>
    toolAgent(ctx, "risk", "Risk agent: risk register and run of show", fb, ["generate_risks", "generate_ops_pack", "add_risks"], "Call generate_risks and generate_ops_pack. Read the register it returns, then use add_risks for 2 or 3 risks specific to this event that the template missed (only real, event-specific ones). Do not call generate_risks again after add_risks.", ["risk", "ops"]),
};

/** A function-calling specialist, shown as one header step with its tool calls under it. */
async function toolAgent(ctx: Ctx, key: AgentKey, title: string, feedback: string | undefined, tools: string[], job: string, done: string[]) {
  return ctx.run.step(feedback ? `${title} (revision)` : title, label(`${key} agent`), { brief: ctx.briefs[key], feedback }, async () => {
    const r = await runToolAgent({
      run: ctx.run,
      user: ctx.user,
      eventId: ctx.eventId,
      label: label(`${key} agent`),
      system: `${BASE}\nYou are the ${key} agent.`,
      task: `${ctx.card}\n\nYour brief from the planner: ${ctx.briefs[key] ?? ""}\n\n${feedback ? `The checker sent this back to you. Fix it:\n${feedback}\n\n` : ""}${job}`,
      tools,
    });
    ctx.notes[key] = r.text;
    done.forEach((d) => ctx.done.add(d));
    const failed = r.log.filter((c) => c.error);
    return { output: { reply: r.text, calls: r.log.map(callSummary), model: r.model }, summary: r.text.slice(0, 600), status: failed.length ? ("warn" as const) : ("ok" as const) };
  });
}

const callSummary = (c: ToolCallLog) => (c.error ? `${c.name}: ERROR ${c.error}` : c.name);

async function speakerAgent(ctx: Ctx, feedback?: string) {
  return ctx.run.step(feedback ? "Speaker agent: find real speakers (revision)" : "Speaker agent: find real speakers", `${label("speaker agent")} → google_search`, { brief: ctx.briefs.speakers, feedback }, async () => {
    const r = await groundedResearch<{ name: string; headline: string; fit_reason: string; email?: string; linkedin?: string }>({
      question: `${ctx.card}\n\n${ctx.briefs.speakers ?? ""}\n${feedback ?? ""}\nSearch the web and name 4 real people who would be strong speakers for this event, preferably based in Malaysia or Southeast Asia (industry practitioners, researchers or founders). For each: full name, current role and organisation, one line on why they fit, and their LinkedIn profile URL if you found it. Only name people you found in search results.`,
      extractInstruction: "List each speaker in the answer: full name, headline (role and organisation), fit_reason (one line), email only if the answer states a public email, and linkedin only if the answer gives their LinkedIn profile URL.",
      schema: { type: "object", properties: { speakers: { type: "array", items: { type: "object", properties: { name: { type: "string" }, headline: { type: "string" }, fit_reason: { type: "string" }, email: { type: "string" }, linkedin: { type: "string" } }, required: ["name", "headline", "fit_reason"] } } }, required: ["speakers"] },
      pick: (d) => ((d as { speakers?: never[] })?.speakers ?? []).slice(0, 5),
    });
    if (r.mode === "unavailable") ctx.blocked.add("speakers");
    if (r.mode === "unavailable" || !r.kept.length) {
      // Keep (clearly labelled) sample speakers so the rest of the plan still works.
      await T.researchSpeakers(ctx.eventId, 3);
      return { status: "warn" as const, summary: `${r.note ?? `No speaker could be backed by a citation (${r.dropped.length} dropped).`} Sample speakers kept, clearly marked as samples.`, output: r, validation: [{ check: "Speakers backed by Google Search citations", passed: false, detail: r.mode === "unavailable" ? "search unavailable" : `0 of ${r.dropped.length}` }] };
    }
    ctx.done.add("speakers");
    const top = r.kept.slice(0, 3);
    const faces = await Promise.all(top.map((s) => speakerFace(s.name, s.linkedin, s.source_url)));
    await withAgent({ run: ctx.run, label: label("speaker agent"), requireApproval: true }, () =>
      findTool("save_speakers")!.run({ event_id: ctx.eventId, run_id: ctx.run.id, speakers: top.map((s, i) => ({ name: s.name, headline: s.headline, source_url: faces[i].profile ?? s.source_url, email: s.email || undefined, fit_reason: s.fit_reason, photo_url: faces[i].photo ?? undefined })) }, ctx.user),
    );
    return {
      output: { kept: r.kept, dropped: r.dropped, queries: r.queries },
      summary: `${r.kept.slice(0, 3).map((s) => s.name).join(", ")}, each with a source link`,
      validation: [{ check: "Speakers backed by Google Search citations", passed: true, detail: `${r.kept.length} cited, ${r.dropped.length} dropped (no source)` }],
      adapt: r.dropped.length ? `Dropped ${r.dropped.map((d) => d.name).join(", ")}: no cited source` : undefined,
    };
  });
}

/**
 * A speaker's photo and profile link. A LinkedIn profile counts only when the
 * page really is that person's (its title names them); otherwise the cited
 * page's picture is used only if the page is about them, never a stranger's face.
 */
async function speakerFace(name: string, linkedin: string | undefined, cited: string) {
  const surname = name.replace(/^(dr|prof|assoc|associate|professor|dato'?|datuk|ts|ir)\.?\s+/gi, "").trim().split(/\s+/).pop()?.toLowerCase() ?? "";
  const about = (title: string) => Boolean(surname) && title.toLowerCase().includes(surname);
  // Social posts (Instagram, Facebook, TikTok) show anything, rarely the person's face: skip them.
  const portrait = (img: string | null) => (img && !/(cdninstagram|fbcdn|tiktokcdn|twimg)\./i.test(img) ? img : null);
  if (linkedin && /^https:\/\/([a-z]+\.)?linkedin\.com\/in\//i.test(linkedin)) {
    const li = await pagePreview(linkedin);
    if (li && about(li.title)) return { profile: linkedin, photo: portrait(li.image) };
  }
  const page = await pagePreview(cited);
  if (portrait(page?.image ?? null) && about(page!.title)) return { profile: null, photo: page!.image };
  return (await profileSearch(name, about, portrait)) ?? { profile: null, photo: null };
}

/** Ask Google Search for the person's own profile page (LinkedIn or a staff page) and take its photo when the page names them. */
async function profileSearch(name: string, about: (title: string) => boolean, portrait: (img: string | null) => string | null) {
  try {
    const r = await gemini({ contents: [{ role: "user", parts: [{ text: `Find the LinkedIn profile or official staff profile page of ${name}. Give the page title and URL.` }] }], search: true, temperature: 0 });
    const chunks = (r.grounding?.chunks ?? []).slice(0, 5);
    const urls = await Promise.all(chunks.map((c) => resolveCitation(c.uri)));
    // LinkedIn first: its share picture is the profile photo.
    urls.sort((a, b) => Number(/linkedin\.com\/in\//i.test(b)) - Number(/linkedin\.com\/in\//i.test(a)));
    for (const url of urls) {
      const p = await pagePreview(url);
      if (portrait(p?.image ?? null) && about(p!.title)) return { profile: /linkedin\.com\/in\//i.test(url) ? url : null, photo: p!.image };
    }
  } catch {
    /* no photo is fine */
  }
  return null;
}

/** A company website from the research, unless it is a social network or news site rather than their own. */
function officialSite(url: string | undefined) {
  try {
    if (!url) return null;
    const host = new URL(url).hostname.replace(/^www\./, "");
    if (/(instagram|facebook|linkedin|twitter|x\.com|tiktok|youtube|scribd|prnewswire|vulcanpost|wikipedia|medium|thestar|nst\.com|malaymail|theedgemalaysia|google)\./i.test(host)) return null;
    return url;
  } catch {
    return null;
  }
}

async function budgetAgent(ctx: Ctx, feedback?: string) {
  if (!feedback || /price|supplier|quote|link/i.test(feedback)) {
    await ctx.run.step("Budget agent: research supplier prices", `${label("budget agent")} → google_search`, { categories: ["food", "tshirt", "lanyard", "cardholder"] }, async () => {
      const r = await groundedResearch<{ name: string; category: string; unit_price: number; unit: string; snippet: string }>({
        question: `${ctx.card}\n\nSearch for current prices in Malaysia (RM) from real suppliers, ideally near the venue: (1) halal catering per pax for a buffet or packed meal, (2) printed event T-shirts per piece, (3) printed lanyards per piece, (4) ID card holders per piece. Name 2 suppliers per category with the price you found.`,
        extractInstruction: "List each supplier with a price stated in the answer: name, category (one of food, tshirt, lanyard, cardholder), unit_price as a number in RM, unit (pax for food, piece otherwise) and snippet (the sentence with the price). Skip any supplier without a stated price.",
        schema: { type: "object", properties: { quotes: { type: "array", items: { type: "object", properties: { name: { type: "string" }, category: { type: "string", enum: ["food", "tshirt", "lanyard", "cardholder"] }, unit_price: { type: "number" }, unit: { type: "string" }, snippet: { type: "string" } }, required: ["name", "category", "unit_price", "unit"] } } }, required: ["quotes"] },
        pick: (d) => ((d as { quotes?: never[] })?.quotes ?? []).filter((q: { unit_price: number }) => q.unit_price > 0 && q.unit_price < 500),
      });
      if (r.mode === "unavailable" || !r.kept.length) {
        return { status: "warn" as const, summary: `${r.note ?? "No price could be backed by a citation."} Using the supplier registry's reference prices.`, output: r };
      }
      ctx.done.add("suppliers");
      await withAgent({ run: ctx.run, label: label("budget agent"), requireApproval: true }, () =>
        Promise.all(r.kept.map((q) => pageImage(q.source_url))).then((pics) =>
          findTool("save_supplier_quotes")!.run({ event_id: ctx.eventId, run_id: ctx.run.id, quotes: r.kept.map((q, i) => ({ category: q.category, name: q.name, url: q.source_url, unit_price: q.unit_price, unit: q.unit, snippet: q.snippet, photo_url: pics[i] ?? undefined })) }, ctx.user),
        ),
      );
      return { output: { kept: r.kept, dropped: r.dropped, queries: r.queries }, summary: r.kept.map((q) => `${q.category}: ${q.name} RM${q.unit_price}/${q.unit}`).join(" · "), validation: [{ check: "Every price has a cited source", passed: true, detail: `${r.kept.length} cited, ${r.dropped.length} dropped` }] };
    });
  }
  return toolAgent(ctx, "budget", "Budget agent: draft and check the budget", feedback, ["list_speakers_and_suppliers", "draft_budget", "validate_budget"], "Call list_speakers_and_suppliers, then draft_budget, then validate_budget. If a check fails, say in one sentence what blocks it and the best option for the organiser (sponsorship, fewer meals, a higher cap).", ["budget"]);
}

async function sponsorAgent(ctx: Ctx, feedback?: string) {
  return ctx.run.step(feedback ? "Sponsor agent: find likely sponsors (revision)" : "Sponsor agent: find likely sponsors", `${label("sponsor agent")} → google_search`, { brief: ctx.briefs.sponsors, feedback }, async () => {
    const r = await groundedResearch<{ name: string; website?: string; industry: string; ask: string; fit_reason: string }>({
      question: `${ctx.card}\n\n${ctx.briefs.sponsors ?? ""}\n${feedback ?? ""}\nSearch for 5 real companies in Malaysia that sponsor or partner with university student events on this topic (tech companies, banks, telcos, food and drink brands). For each: company name, their official website, industry, why they fit, and a sensible ask (cash in RM or an in-kind item).`,
      extractInstruction: "List each company in the answer: name, website (the company's own official site, only if stated), industry, ask, fit_reason.",
      schema: { type: "object", properties: { sponsors: { type: "array", items: { type: "object", properties: { name: { type: "string" }, website: { type: "string" }, industry: { type: "string" }, ask: { type: "string" }, fit_reason: { type: "string" } }, required: ["name", "industry", "ask", "fit_reason"] } } }, required: ["sponsors"] },
      pick: (d) => ((d as { sponsors?: never[] })?.sponsors ?? []).slice(0, 6),
    });
    if (r.mode === "unavailable") ctx.blocked.add("sponsors");
    if (r.mode === "unavailable" || !r.kept.length) return { status: "warn" as const, summary: `${r.note ?? "No sponsor could be backed by a citation."} No sponsors saved.`, output: r };
    ctx.done.add("sponsors");
    await withAgent({ run: ctx.run, label: label("sponsor agent"), requireApproval: true }, () =>
      findTool("save_sponsors")!.run({ event_id: ctx.eventId, run_id: ctx.run.id, sponsors: r.kept.map((s) => ({ company: s.name, website: officialSite(s.website) ?? undefined, industry: s.industry, ask: s.ask, fit_reason: `${s.fit_reason} (source: ${s.source_url})` })) }, ctx.user),
    );
    return { output: { kept: r.kept, dropped: r.dropped, queries: r.queries }, summary: r.kept.map((s) => s.name).join(", "), validation: [{ check: "Every sponsor has a cited source", passed: true, detail: `${r.kept.length} cited, ${r.dropped.length} dropped` }] };
  });
}

// ------------------------------------------------------------------ checker

async function check(ctx: Ctx, round: number): Promise<Issue[]> {
  const { run, user, eventId } = ctx;
  const det = await withAgent({ run, label: label("checker"), requireApproval: true }, async () => {
    const call = async (name: string) => {
      try {
        return (await findTool(name)!.run({ event_id: eventId, run_id: run.id }, user)) as unknown;
      } catch (err) {
        return { error: err instanceof Error ? err.message : String(err) };
      }
    };
    return { budget: await call("validate_budget"), proposal: await call("validate_proposal"), lead_times: await call("check_lead_times") };
  });
  const speakers = await query<Speaker>("SELECT name, source, source_url FROM speakers WHERE event_id = $1", [eventId]);
  const risks = await query<{ category: string; description: string; likelihood: number; impact: number }>("SELECT category, description, likelihood, impact FROM risks WHERE event_id = $1 ORDER BY likelihood * impact DESC", [eventId]);
  const proposal = await one<{ p: unknown }>("SELECT preferences->'proposal' AS p FROM events WHERE id = $1", [eventId]);
  const creatives = await query<{ kind: string; caption: string | null }>("SELECT kind, caption FROM creatives WHERE event_id = $1 AND kind <> 'video'", [eventId]);

  const r = await run.step(`Checker: review the whole plan (round ${round})`, label("checker"), { round }, async () => {
    const { data } = await geminiJson<{ verdict: "pass" | "revise"; issues: Issue[] }>({
      system: `${BASE}\nYou are the checker. Review the plan like a strict faculty advisor reading a society proposal. Use the deterministic check results as facts.
Check three things: (1) the deterministic SOP checks; (2) consistency: the proposal text, captions and risks must agree with the event facts (date, venue, attendance, budget) and with each other, and no agent may state a decision only the organiser can take (such as moving the date or confirming a speaker) as if it were made; (3) quality: generic filler, placeholder or sample content, or claims with no source.
Report only real problems, at most 5, most important first. Each issue names the agent that can fix it: speakers, budget, sponsors, proposal, promotion, risk. Use "human" for things only the organiser can decide (a missed SOP deadline means moving the date or asking for an exception; sample speakers when web search is unavailable).
Severity high = the SOP or the faculty would reject it; medium = clearly weak; low = nice to have. Do not repeat an issue that the data shows is already fixed.${round > 1 ? " This is a re-check after fixes: only flag what is still wrong." : ""}`,
      prompt: JSON.stringify({ event: ctx.card, deterministic_checks: det, speakers, risks, proposal_text: proposal?.p ?? null, creatives, agent_notes: ctx.notes }),
      schema: { type: "object", properties: { verdict: { type: "string", enum: ["pass", "revise"] }, issues: { type: "array", items: { type: "object", properties: { agent: { type: "string", enum: [...AGENTS, "human"] }, severity: { type: "string", enum: ["high", "medium", "low"] }, problem: { type: "string" }, fix: { type: "string" } }, required: ["agent", "severity", "problem", "fix"] } } }, required: ["verdict", "issues"] },
      temperature: 0.1,
    });
    const issues = (data.issues ?? []).slice(0, 5);
    const failed = flattenChecks(det).filter((c) => !c.passed);
    return {
      output: { verdict: data.verdict, issues, deterministic: det },
      summary: issues.length ? `${data.verdict === "pass" ? "Passes, with notes" : "Needs revision"}: ${issues.length} issue(s), ${failed.length} SOP check(s) failing` : "All checks pass, no issues found",
      validation: [...flattenChecks(det), ...issues.map((i) => ({ check: `${i.agent} (${i.severity})`, passed: false, detail: i.problem }))],
      status: issues.some((i) => i.severity !== "low") || failed.length ? ("warn" as const) : ("ok" as const),
      issues,
    };
  });
  ctx.done.add("review");
  return r.issues;
}

function flattenChecks(det: Record<string, unknown>) {
  const out: { check: string; passed: boolean; detail: string }[] = [];
  for (const v of Object.values(det)) {
    const rows = Array.isArray(v) ? v : v && typeof v === "object" && Array.isArray((v as { checks?: unknown[] }).checks) ? (v as { checks: unknown[] }).checks : [];
    for (const c of rows as { check?: string; label?: string; passed: boolean; detail?: string; deadline?: string; days_late?: number }[]) {
      out.push({ check: c.check ?? c.label ?? "check", passed: Boolean(c.passed), detail: c.detail ?? (c.deadline ? `due ${c.deadline}${c.days_late ? `, ${c.days_late} days late` : ""}` : "") });
    }
  }
  return out;
}

// ------------------------------------------------------------------ approvals + finish

/**
 * Nothing leaves Movents on the AI's say-so. Outreach (speakers, sponsors,
 * suppliers) is drafted for the organiser to review and send; the budget and
 * the faculty submission go to Backstage for sign-off. Posts and the public
 * event page stay as drafts on their tabs.
 */
async function approvals(ctx: Ctx) {
  const { run, user, eventId } = ctx;
  await withAgent({ run, label: label("approvals"), requireApproval: true }, async () => {
    for (const name of ["send_speaker_outreach", "send_sponsor_outreach", "request_vendor_quotes", "request_budget_approval", "submit_to_faculty", "push_calendar"]) {
      await findTool(name)!.run({ event_id: eventId, run_id: run.id }, user).catch(() => null); // The failed step is already in the trace.
    }
  });
  ctx.done.add("approvals");
}

async function finish(ctx: Ctx, issues: Issue[]) {
  const { run, user, eventId } = ctx;
  const pending = await query<{ title: string; approver_role: string }>("SELECT title, approver_role FROM approval_requests WHERE event_id = $1 AND status = 'pending' ORDER BY created_at", [eventId]);
  const drafts = await query<{ title: string }>("SELECT title FROM approval_requests WHERE event_id = $1 AND status = 'draft' ORDER BY created_at", [eventId]);
  const saved = timeSaved([...ctx.done]);
  const human = issues.filter((i) => i.agent === "human" || i.severity === "high" || ctx.blocked.has(i.agent as AgentKey));
  const s = await run.step("Planner: summary", label("planner"), {}, async () => {
    let text = "";
    try {
      const { data } = await geminiJson<{ summary: string }>({
        system: `${BASE}\nWrite the final note to the organiser: 2 or 3 sentences. Say what is ready, which drafts they should review and send themselves (outreach emails), what waits for sign-off and who signs it, and anything only they can decide.`,
        prompt: JSON.stringify({ event: ctx.card, drafts_for_you_to_send: drafts.map((d) => d.title), waiting_for_signoff: pending, needs_human: human, notes: ctx.notes }),
        schema: { type: "object", properties: { summary: { type: "string" } }, required: ["summary"] },
      });
      text = data.summary;
    } catch {
      text = `Plan ready. ${drafts.length} draft(s) to review and send, ${pending.length} item(s) waiting for sign-off.`;
    }
    return {
      summary: text,
      output: { time_saved_hours: saved.hours, time_saved_breakdown: saved.items, drafts: drafts.map((d) => d.title), waiting_for_approval: pending, needs_human: human },
      validation: [{ check: "Committee time saved (estimate)", passed: true, detail: `about ${saved.hours} hours across ${saved.items.length} tasks` }],
      text,
    };
  });
  for (const [k, v] of Object.entries(outputs(eventId))) {
    if (k === "report_pdf" || k === "report_docx") continue; // The post-event report comes after the event.
    await run.output(k.replace(/_/g, " ").replace(/^[a-z]/, (c) => c.toUpperCase()).replace(/ (pdf|docx|xlsx|csv|ics)$/, " (.$1)"), v.replace(/^https?:\/\/[^/]+/, "").replace(/\?t=.*$/, ""), k.split("_").pop() ?? "page");
  }
  if (drafts.length) await run.output(`Drafts to review and send (${drafts.length})`, `/events/${eventId}/inbox#drafts`, "page");
  await run.output("Backstage sign-offs", "/approvals", "page");
  await audit(user, "agent.run_completed", { run_id: run.id, kind: "plan", engine: "gemini", steps: run.steps.length, time_saved_hours: saved.hours }, { eventId });
  await run.finish({ event_id: eventId, summary: s.text, time_saved_hours: saved.hours, drafts: drafts.length, waiting_for_approval: pending.length, needs_human: human.map((h) => h.problem) });
}

/**
 * Research one existing event: real speakers (with photos) and likely
 * sponsors (with logos) from Google Search, shown as its own run. Used for
 * the demo's sample events, which the fast rule-based planner seeds without AI.
 */
export async function researchEvent(user: User, eventId: string, what: { speakers?: boolean; sponsors?: boolean } = { speakers: true, sponsors: true }) {
  const ev = await one<{ title: string }>("SELECT title FROM events WHERE id = $1", [eventId]);
  if (!ev) return null;
  const topic = [what.speakers && "speakers", what.sponsors && "sponsors"].filter(Boolean).join(" and ");
  const run = await Run.start(user, `Find real ${topic} for ${ev.title}`, "custom", "gemini");
  await run.setEvent(eventId);
  const ctx: Ctx = { run, user, eventId, card: await eventCard(eventId), briefs: {} as Briefs, done: new Set(), notes: {}, blocked: new Set(), revised: new Set() };
  try {
    await Promise.allSettled([what.speakers ? speakerAgent(ctx) : null, what.sponsors ? sponsorAgent(ctx) : null]);
    if (what.speakers) {
      // Speakers already on the event who still have no photo get one more look.
      const missing = await query<{ id: string; name: string; source_url: string | null }>("SELECT id, name, source_url FROM speakers WHERE event_id = $1 AND source <> 'sample' AND photo_url IS NULL", [eventId]);
      await run.step("Speaker agent: find photos", `${label("speaker agent")} → google_search`, { speakers: missing.map((m) => m.name) }, async () => {
        const faces = await Promise.all(missing.map((m) => speakerFace(m.name, undefined, m.source_url ?? "")));
        let found = 0;
        for (const [i, f] of faces.entries()) {
          if (!f.photo) continue;
          found++;
          await query("UPDATE speakers SET photo_url = $2, source_url = coalesce($3, source_url) WHERE id = $1", [missing[i].id, f.photo, f.profile]);
        }
        return { summary: missing.length ? `${found} of ${missing.length} photo(s) found on pages that name the speaker` : "Every speaker already has a photo", status: found || !missing.length ? ("ok" as const) : ("warn" as const) };
      });
    }
    if (what.speakers) await run.output("Speakers", `/events/${eventId}/speakers`, "page");
    if (what.sponsors) await run.output("Sponsors", `/events/${eventId}/sponsors`, "page");
    const summary = run.steps.filter((s) => !s.tool.includes("→ save")).map((s) => s.summary).filter(Boolean).join(" ");
    await run.finish({ event_id: eventId, summary: summary || `Researched ${topic} with Google Search` });
    return { run_id: run.id, summary };
  } catch (err) {
    await run.finish({ error: err instanceof Error ? err.message : String(err), event_id: eventId }, true);
    return { run_id: run.id, summary: "Research failed" };
  }
}
