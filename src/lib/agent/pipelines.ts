import "server-only";
import { Run } from "./run";
import * as T from "./tools";
import { parsePrompt } from "../planning";
import { fmtDate, fmtRM, today } from "../appurl";
import { update, one } from "../db";
import { audit } from "../audit";
import { emailProvider } from "../integrations/email";
import { calendarMode } from "../integrations/gcal";
import { lumaMode } from "../integrations/ticketing";
import { loadBundle, reportData } from "../docs/builders";
import { generateKit, imageHref } from "../marketing";
import { nanoBananaEnabled } from "../integrations/nanobanana";
import type { AgentRun, User } from "../types";

export function classify(prompt: string): AgentRun["kind"] {
  const p = prompt.toLowerCase();
  if (/(post[- ]?event|after[- ]event|wrap[- ]?up)\s+report|report\s+(for|on)\s+the|generate\s+the\s+(post|report)/.test(p) || (p.includes("report") && !p.includes("plan"))) return "report";
  if (/\b(plan|organi[sz]e|run|host|set up)\b/.test(p)) return "plan";
  return "custom";
}

export async function startRun(user: User, prompt: string) {
  const kind = classify(prompt);
  const run = await Run.start(user, prompt, kind);
  return { run, kind };
}

export async function execute(run: Run, kind: AgentRun["kind"]) {
  try {
    if (kind === "plan") await planPipeline(run);
    else if (kind === "report") await reportPipeline(run);
    else {
      await run.step("Understand request", "nlp.classify", { prompt: run.prompt }, async () => ({
        status: "fail",
        summary: 'I can plan an event ("Plan a 150-pax AI talk at Sunway on 15 Nov, budget RM3,000") or write a post-event report ("Generate the post-event report for the AI talk").',
      }));
      await run.finish({ error: "Unrecognised request" }, true);
    }
  } catch (err) {
    await run.finish({ error: err instanceof Error ? err.message : String(err) }, true);
  }
}

// ======================================================================== PLAN

async function planPipeline(run: Run) {
  const user = run.user;

  // 1 — PLAN
  const parsed = await run.step("Parse goal", "nlp.parse_prompt", { prompt: run.prompt }, async () => {
    const p = parsePrompt(run.prompt, today());
    return {
      output: p,
      summary: `${p.title}: ${p.pax} pax on ${fmtDate(p.date)}, ${p.startTime} to ${p.endTime}, cap ${fmtRM(p.budget)}${p.team.length ? `, team ${p.team.join(", ")}` : ""}`,
      validation: p.missing.length ? [{ check: "All details given", passed: false, detail: `Assumed defaults for: ${p.missing.join(", ")}` }] : undefined,
    };
  });
  const p = parsed.output!;
  const ev = await T.createEvent(user, p);
  await run.setEvent(ev.id);
  await run.output("Event dashboard", `/events/${ev.id}`, "page");

  const sop = await run.step("Read university SOP", "kb.read_sop", { event_id: ev.id }, async () => {
    const s = await T.readSop(ev.id);
    return {
      output: s,
      summary: `${s.university} SOP v${s.sopVersion}: ${s.requiredSections.length} proposal sections, ${s.leadTimes.length} lead-time rules, ${s.rules.length} rules`,
    };
  });
  const signals = sop.output!.signals;
  if (sop.output!.lessons.length) {
    await run.step("Apply lessons from past events", "kb.read_lessons", { count: sop.output!.lessons.length }, async () => ({
      output: { lessons: sop.output!.lessons, signals },
      summary: `Applying ${sop.output!.lessons.length} lessons: show rate ${Math.round((signals.show_rate ?? 0.75) * 100)}%${signals.lanyards_attendees === false ? ", lanyards for crew only" : ""}${signals.follow_up_days ? `, follow up speakers after ${signals.follow_up_days} days` : ""}`,
    }));
  }

  await run.step("Back-calculate timeline", "planner.backcalc", { date: ev.date }, async () => {
    const t = await T.planTimeline(ev.id);
    return {
      output: t,
      summary: `${t.tasks} tasks, ${t.dependencies} dependencies across 5 phases (${Object.entries(t.byPhase).map(([k, v]) => `${k} ${v}`).join(", ")})${t.compressed ? `, ${t.compressed} overdue items compressed to start now` : ""}`,
      status: t.compressed ? "warn" : "ok",
    };
  });

  const venue = await run.step("Match venue & check clashes", "venues.match", { pax: ev.pax, date: ev.date }, async () => {
    const r = await T.matchVenue(ev.id);
    const clash = r.considered.find((c) => c.reason.startsWith("clash"));
    return {
      output: r.considered.map((c) => ({ venue: c.venue.name, capacity: c.venue.capacity, ok: c.ok, reason: c.reason })),
      summary: r.chosen ? `${r.chosen.name} (capacity ${r.chosen.capacity})` : "No suitable venue",
      status: r.chosen ? "ok" : "fail",
      adapt: clash ? `${clash.venue.name} rejected, ${clash.reason}. Moved to ${r.chosen?.name ?? ""}.` : undefined,
      validation: [{ check: "Venue capacity ≥ pax and no clash", passed: Boolean(r.chosen), detail: r.chosen ? `${r.chosen.name} free` : "none available" }],
    };
  });

  // 4/5 — VALIDATE + ADAPT (lead times)
  await run.step("Validate SOP lead times", "validate.lead_times", { date: ev.date, today: today() }, async () => {
    const r = await T.checkLeads(ev.id);
    const missed = r.checks.filter((c) => !c.passed);
    return {
      output: r,
      summary: `${r.checks.filter((c) => c.passed).length}/${r.checks.length} SOP lead times met`,
      validation: r.checks.map((c) => ({ check: c.label, passed: c.passed, detail: c.passed ? `due ${fmtDate(c.deadline)}` : `due ${fmtDate(c.deadline)}, ${c.days_late} days late` })),
      adapt: missed.length ? `Flagged ${missed.length} missed lead time(s). Earliest fully compliant date: ${fmtDate(r.suggestedDate)}. Kept ${fmtDate(ev.date)} and marked "${missed.map((m) => m.label).join(", ")}" as urgent.` : undefined,
    };
  });

  // 2 — RESEARCH
  await run.step("Find speakers", "assistant.web_search", { topic: ev.topic, count: 3 }, async () => {
    const r = await T.researchSpeakers(ev.id, 3);
    return {
      output: r.speakers.map((s) => ({ name: s.name, headline: s.headline, url: s.source_url, email: s.email ?? "via contact page" })),
      summary: `${r.speakers.length} speakers${r.mode === "assistant" ? " from your AI assistant" : " (placeholders until your AI assistant or a teammate adds real ones)"}: ${r.speakers.map((s) => s.name).join(", ")}`,
      status: r.mode === "assistant" ? "ok" : "warn",
    };
  });
  await run.output("Speakers", `/events/${ev.id}/speakers`, "page");

  await run.step("Research suppliers (cheapest first)", "assistant.web_search + reference prices", { categories: ["food", "tshirt", "lanyard", "cardholder"] }, async () => {
    const r = await T.researchSuppliers(ev.id);
    const flat = Object.entries(r.suppliers).map(([cat, list]) => ({ category: cat, cheapest: list[0] ? `${list[0].name}, ${fmtRM(list[0].unit_price)}/${list[0].unit}` : "none", options: list.length, mode: r.modes[cat] }));
    return { output: flat, summary: flat.map((f) => `${f.category}: ${f.cheapest}`).join(" · ") };
  });

  // 3 — DRAFT + 4/5 validate & adapt budget
  const budget = await run.step("Draft budget & adapt to cap", "budget.compose", { cap: ev.budget_cap, contingency: "10%" }, async () => {
    const r = await T.draftBudget(ev.id, signals);
    const adaptations = r.iterations.slice(1).map((i) => i.change);
    return {
      output: { iterations: r.iterations.map((i) => ({ label: i.label, subtotal: i.subtotal, contingency: i.contingency, total: i.total, withinCap: i.withinCap })), predicted: r.predicted },
      summary: `${r.iterations.length} iteration(s): ${r.iterations.map((i) => fmtRM(i.total)).join(" → ")} (cap ${fmtRM(ev.budget_cap)})`,
      adapt: adaptations.length ? adaptations.join(" | ") : undefined,
      status: r.final.withinCap ? (adaptations.length ? "warn" : "ok") : "fail",
    };
  });
  await run.step("Validate budget", "validate.budget", { event_id: ev.id }, async () => {
    const v = await T.checkBudget(ev.id);
    return { validation: v, summary: v.every((x) => x.passed) ? "Budget passes all SOP checks" : "Budget has issues", status: v.every((x) => x.passed) ? "ok" : "fail" };
  });
  await run.output("Budget sheet (.xlsx)", `/api/outputs/${ev.id}/budget.xlsx`, "xlsx");
  await run.output("Budget (.csv)", `/api/outputs/${ev.id}/budget.csv`, "csv");

  await run.step("Risk register + weather plan", "risk.generate + open-meteo", { date: ev.date }, async () => {
    const r = await T.generateRisks(ev.id);
    return { output: r, summary: `${r.count} risks, ${r.mitigationTasks} mitigation tasks added to the board. Weather (${r.weather.mode}): ${r.weather.note}` };
  });
  await run.output("Risk register (.xlsx)", `/api/outputs/${ev.id}/risks.xlsx`, "xlsx");
  await run.output("Risk register (.pdf)", `/api/outputs/${ev.id}/risks.pdf`, "pdf");

  await run.step("Run sheet, promotion & reminders", "ops.generate", { event_id: ev.id }, async () => {
    const r = await T.generateOpsPack(ev.id);
    return { output: r, summary: `${r.runsheetBlocks} × 15-min run-sheet blocks, ${r.promoItems} promotion tasks, ${r.reminders} reminders, ${r.volunteers} roster slots` };
  });
  await run.output("Run sheet (.pdf)", `/api/outputs/${ev.id}/runsheet.pdf`, "pdf");

  await run.step("Create marketing kit", nanoBananaEnabled() ? "nano-banana (gemini image) + copywriter" : "poster templates + copywriter", { channels: ["poster", "instagram", "linkedin", "reels"] }, async () => {
    const r = await generateKit(ev.id, { withImages: true });
    return {
      output: r.creatives.map((c) => ({ kind: c.kind, channel: c.channel, image: c.kind === "video" ? "storyboard, generate with your AI assistant" : imageHref(c) })),
      summary: `Poster, Instagram post + story, LinkedIn image, captions & hashtags, 15s video storyboard${r.generated ? `, ${r.generated} images by Nano Banana` : ", branded templates (your AI assistant can replace them with generated images)"}`,
      status: r.errors.length ? "warn" : "ok",
    };
  });
  await run.output("Marketing kit", `/events/${ev.id}/promotion`, "page");
  await run.step("Request poster & social approval", "approvals.route · role-gated", {}, async () => {
    const r = await T.requestSocialApproval(user, ev.id, run.id);
    return { summary: r.status === "blocked" ? `Blocked: ${r.reason}` : r.status === "executed" ? "Creatives approved" : r.error, status: r.status === "blocked" ? "blocked" : r.status === "executed" ? "ok" : "fail" };
  });

  await run.step("Draft proposal in SOP format", "docs.proposal", { format: "docx + pdf" }, async () => ({
    summary: "Proposal generated as Word and PDF",
    output: { docx: `/api/outputs/${ev.id}/proposal.docx`, pdf: `/api/outputs/${ev.id}/proposal.pdf` },
  }));
  await run.step("Validate proposal sections", "validate.proposal", { event_id: ev.id }, async () => {
    const v = await T.checkProposal(ev.id);
    const passed = v.filter((x) => x.passed).length;
    return { validation: v, summary: `${passed}/${v.length} SOP sections complete`, status: passed === v.length ? "ok" : "warn" };
  });
  await run.output("Event proposal (.pdf)", `/api/outputs/${ev.id}/proposal.pdf`, "pdf");
  await run.output("Event proposal (.docx)", `/api/outputs/${ev.id}/proposal.docx`, "docx");

  // 6 — ACT (gated by role)
  const outreach = await run.step("Send speaker outreach", `outlook.send (${emailProvider()}) · role-gated`, { speakers: 3 }, async () => {
    const r = await T.outreachSpeakers(user, ev.id, run.id);
    const blocked = r.filter((x) => x.status === "blocked").length;
    return { output: r, summary: blocked ? `${blocked} email(s) blocked → sent to approval queue (${user.role} cannot send)` : `${r.length} invitations sent`, status: blocked ? "blocked" : r.some((x) => x.status === "failed") ? "fail" : "ok" };
  });
  await run.step("Request supplier quotes", `outlook.send (${emailProvider()}) · role-gated`, {}, async () => {
    const r = await T.requestVendorQuotes(user, ev.id, run.id);
    const blocked = r.filter((x) => x.status === "blocked").length;
    return { output: r, summary: blocked ? `${blocked} quote request(s) routed to Logistics Director` : `${r.length} quote requests sent`, status: blocked ? "blocked" : "ok" };
  });
  await run.step("Request budget approval", "approvals.route", {}, async () => {
    const r = await T.requestBudgetApproval(user, ev.id, run.id);
    return { output: r.status === "blocked" ? { approval: r.approval.id, approver: r.approval.approver_role } : r, summary: r.status === "blocked" ? r.reason : r.status === "executed" ? "Budget approved" : r.error, status: r.status === "blocked" ? "blocked" : r.status === "executed" ? "ok" : "fail" };
  });
  await run.step("Submit proposal to faculty", `outlook.send (${emailProvider()}) · role-gated`, {}, async () => {
    const r = await T.submitToFaculty(user, ev.id, run.id);
    return { output: r.status === "blocked" ? { approval: r.approval.id, approver: r.approval.approver_role } : r, summary: r.status === "blocked" ? `Blocked: ${r.reason}. President notified.` : r.status === "executed" ? `Sent to faculty advisor → ${String(r.result.to)}` : r.error, status: r.status === "blocked" ? "blocked" : r.status === "executed" ? "ok" : "fail" };
  });
  await run.step("Push timeline to calendar", calendarMode() === "google" ? "google_calendar.insert" : "calendar.ics_feed", {}, async () => {
    const r = await T.pushToCalendar(user, ev.id, run.id);
    if (r.status !== "executed") return { summary: r.status === "blocked" ? r.reason : r.error, status: r.status === "blocked" ? "blocked" : "fail" };
    return { output: r.result, summary: `${String(r.result.created)} events → ${r.result.provider === "google" ? "Google Calendar" : "subscribable .ics feed (add to Google Calendar)"}` };
  });
  await run.output("Timeline (.ics / Google Calendar)", `/api/outputs/${ev.id}/timeline.ics`, "ics");
  await run.step("Create Luma event page", `luma.create (${lumaMode()}) · role-gated`, {}, async () => {
    const r = await T.publishEvent(user, ev.id, run.id, "luma");
    return { output: r.status === "executed" ? r.result : undefined, summary: r.status === "blocked" ? `Blocked: ${r.reason}` : r.status === "executed" ? `Published (${String(r.result.mode)}): ${String(r.result.url)}` : r.error, status: r.status === "blocked" ? "blocked" : r.status === "executed" ? "ok" : "fail" };
  });
  await run.output("Approval queue", "/approvals", "page");
  await run.output("Audit log", `/audit?event=${ev.id}`, "page");

  // 7 — REPORT
  const final = await one<{ status: string; flags: unknown[] }>("SELECT status, flags FROM events WHERE id = $1", [ev.id]);
  await run.step("Run summary", "report.summary", {}, async () => ({
    summary: `Plan ready. ${outreach.output?.filter((o) => o.status === "blocked").length ?? 0} speaker emails + faculty submission awaiting approval. Venue: ${venue.summary}. Budget: ${budget.summary?.split(" (")[0]}.`,
    output: { event_id: ev.id, status: final?.status, flags: final?.flags },
  }));
  await audit(user, "agent.run_completed", { run_id: run.id, kind: "plan", steps: run.steps.length }, { eventId: ev.id });
  await run.finish({ event_id: ev.id, title: ev.title, flags: final?.flags ?? [] });
}

// ======================================================================== REPORT

async function reportPipeline(run: Run) {
  const user = run.user;
  const ev = await run.step("Find the event", "db.search_events", { prompt: run.prompt }, async () => {
    const e = await T.findEventForPrompt(user, run.prompt);
    if (!e) throw new Error("No events found for your society, plan one first.");
    return { output: { id: e.id, title: e.title, date: e.date, status: e.status }, summary: `${e.title} (${fmtDate(e.date)})` };
  });
  const eventId = ev.output!.id;
  await run.setEvent(eventId);

  await run.step("Registrations & check-ins", "db.rsvps", { event_id: eventId }, async () => {
    const b = await loadBundle(eventId);
    const reg = b!.rsvps.filter((r) => r.status !== "cancelled").length;
    const att = b!.rsvps.filter((r) => r.checked_in).length;
    const lines = b!.lines.filter((l) => l.actual != null).length;
    const missing = [!att && "no check-ins recorded", !lines && "no actual spend entered", !b!.feedback.length && "no survey responses yet"].filter(Boolean) as string[];
    return {
      output: { registered: reg, attended: att },
      summary: `${reg} registered, ${att} checked in`,
      status: missing.length ? "warn" : "ok",
      adapt: missing.length ? `The report will be incomplete: ${missing.join(", ")}.` : undefined,
    };
  });

  const data = await run.step("Analyse budget, attendance & feedback", "analytics.compute", { event_id: eventId }, async () => {
    const b = await loadBundle(eventId);
    const d = reportData(b!);
    return {
      output: { registered: d.registered, attended: d.attended, showRate: d.showRate, estimated: d.estimated, actual: d.actual, costPerAttendee: d.costPerAttendee, nps: d.nps, themes: d.themes },
      summary: `Show rate ${Math.round(d.showRate * 100)}%, spend ${fmtRM(d.actual)} vs ${fmtRM(d.estimated)}, ${fmtRM(d.costPerAttendee)}/attendee, NPS ${d.nps.nps}`,
      validation: [
        { check: "Attended ≤ registered", passed: d.attended <= d.registered, detail: `${d.attended} ≤ ${d.registered}` },
        { check: "Actual spend ≤ approved budget", passed: d.actual <= d.approvedBudget, detail: `${fmtRM(d.actual)} vs ${fmtRM(d.approvedBudget)}` },
        { check: "Enough survey responses (≥10% of attendees)", passed: d.nps.n >= d.attended * 0.1, detail: `${d.nps.n} responses` },
      ],
    };
  });

  await run.step("Write post-event report", "docs.report", { format: "pdf + docx" }, async () => ({
    summary: "Report generated: registered vs actual, budget vs actual, cost per attendee, feedback themes, lessons learned",
    output: { pdf: `/api/outputs/${eventId}/report.pdf`, docx: `/api/outputs/${eventId}/report.docx` },
  }));
  await run.output("Post-event report (.pdf)", `/api/outputs/${eventId}/report.pdf`, "pdf");
  await run.output("Post-event report (.docx)", `/api/outputs/${eventId}/report.docx`, "docx");

  await run.step("Feed lessons into SOP knowledge base", "kb.write_lessons", {}, async () => {
    const r = await T.feedLessons(user, eventId);
    return { output: r, summary: `${r.lessons.length} lessons saved, next plan will apply them automatically` };
  });
  await run.output("SOP knowledge base", "/sop", "page");

  const evRow = await one<{ date: string; status: string }>("SELECT date, status FROM events WHERE id = $1", [eventId]);
  if (evRow && evRow.date <= today()) await update("events", eventId, { status: "completed" });
  await audit(user, "agent.run_completed", { run_id: run.id, kind: "report" }, { eventId });
  await run.step("Run summary", "report.summary", {}, async () => ({ summary: data.summary ?? "Report ready" }));
  await run.finish({ event_id: eventId, title: ev.output!.title });
}
