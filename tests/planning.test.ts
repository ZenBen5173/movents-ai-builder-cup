import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePrompt, buildTimeline, checkLeadTimes, selectVenue, composeBudget, predictAttendance, buildRunsheet, nps, feedbackThemes, parseSignals, type Supplier } from "../src/lib/planning";
import { SUNWAY_SOP } from "../src/lib/sop-default";
import { REFERENCE_SUPPLIERS } from "../src/lib/integrations/reference-data";
import { decide, canDecide } from "../src/lib/rbac";

const TODAY = "2026-10-10";

test("parses the demo prompt", () => {
  const p = parsePrompt("Plan a 150-pax AI talk at Sunway on 15 Nov, budget RM3,000.", TODAY);
  assert.equal(p.pax, 150);
  assert.equal(p.budget, 3000);
  assert.equal(p.date, "2026-11-15");
  assert.equal(p.university, "Sunway");
  assert.equal(p.format, "talk");
  assert.equal(p.topic, "AI");
  assert.deepEqual(p.missing, []);
});

test("rolls a past date into next year and reads k budgets", () => {
  const p = parsePrompt("Plan a 80 people workshop on data at Monash on 3 Mar, budget 2.5k", TODAY);
  assert.equal(p.date, "2027-03-03");
  assert.equal(p.budget, 2500);
});

test("parsePrompt: headcount words like 120-person are read as pax and kept out of the title", () => {
  const p = parsePrompt("Plan a 120-person AI talk on 20 Dec 2026, budget RM3,000", TODAY);
  assert.equal(p.pax, 120);
  assert.equal(p.title, "AI Talk");
  assert.ok(!p.missing.includes("pax"));
  assert.equal(parsePrompt("Plan a 60 attendee workshop on cloud on 5 Dec", TODAY).pax, 60);
  assert.equal(parsePrompt("Plan a 1-person demo on 5 Dec", TODAY).pax, 1);
});

test("lead times: venue booking missed for 15 Nov, suggests compliant date on same weekday", () => {
  const r = checkLeadTimes("2026-11-15", TODAY, SUNWAY_SOP, 6);
  const venue = r.checks.find((c) => c.key === "venue_booking")!;
  assert.equal(venue.passed, false);
  assert.ok(r.checks.find((c) => c.key === "proposal_submission")!.passed);
  assert.equal(r.allPassed, false);
  assert.equal(new Date(r.suggestedDate).getUTCDay(), new Date("2026-11-15").getUTCDay());
  assert.ok(r.suggestedDate >= "2026-11-21");
});

test("timeline covers all 5 phases and compresses past deadlines to today", () => {
  const t = buildTimeline("2026-11-15", TODAY, SUNWAY_SOP);
  for (const ph of ["concept", "planning", "promotion", "execution", "post"]) assert.ok(t.some((x) => x.phase === ph), ph);
  assert.ok(t.every((x) => x.phase === "post" || x.due_date >= TODAY));
  assert.ok(t.some((x) => x.compressed));
});

test("venue: skips clash and too-small rooms", () => {
  const venues = [
    { id: "a", university_id: "u", name: "Small", capacity: 120, setup_styles: [], av: [], cost: 0, booking_lead_weeks: 4, location: null },
    { id: "b", university_id: "u", name: "JC2", capacity: 160, setup_styles: [], av: [], cost: 0, booking_lead_weeks: 6, location: null },
    { id: "c", university_id: "u", name: "JC3", capacity: 160, setup_styles: [], av: [], cost: 0, booking_lead_weeks: 6, location: null },
  ];
  const r = selectVenue(venues, [{ id: "x", venue_id: "b", date: "2026-11-15", start_time: "09:00", end_time: "18:00", title: "RoboWars" }], 150, { date: "2026-11-15", start_time: "14:00", end_time: "17:00" });
  assert.equal(r.chosen?.id, "c");
  assert.match(r.considered[1].reason, /clash/);
});

test("budget adapt loop brings RM3,000 demo within cap incl. 10% contingency", () => {
  const suppliers: Record<string, Supplier[]> = {};
  for (const s of REFERENCE_SUPPLIERS) (suppliers[s.category] ??= []).push({ ...s, unit_price: s.unit_price! });
  const pred = predictAttendance(150, 0, 0.68, 160).predicted;
  const r = composeBudget({ pax: 150, predicted: pred, cap: 3000, contingencyPct: 10, foodBufferPct: 5, suppliers, venueCost: 0, speakers: 3, crew: 25, coreCommittee: 12, lanyardsForAttendees: false });
  assert.equal(r.iterations[0].withinCap, false);
  assert.ok(r.iterations.length >= 2);
  assert.equal(r.final.withinCap, true);
  assert.ok(r.final.total <= 3000);
  assert.equal(r.final.contingency, Math.round(r.final.subtotal * 10) / 100);
  console.log(r.iterations.map((i) => `${i.label}: ${i.total}`).join("\n"));
});

test("run sheet is in 15-minute blocks", () => {
  const rs = buildRunsheet("14:00", "17:00", ["A", "B", "C"], "JC3");
  for (const b of rs) {
    const [h1, m1] = b.start_time.split(":").map(Number);
    const [h2, m2] = b.end_time.split(":").map(Number);
    assert.equal(h2 * 60 + m2 - (h1 * 60 + m1), 15);
  }
  assert.equal(rs[0].start_time, "13:00");
  assert.equal(rs.at(-1)!.end_time, "17:30");
});

test("nps, themes and lesson signals", () => {
  assert.equal(nps([10, 9, 8, 6]).nps, 25);
  const t = feedbackThemes([{ liked: "great speaker", improve: "food ran out" }]);
  assert.equal(t.improvements[0].theme, "Food & refreshments");
  assert.equal(parseSignals("x\n```signals\n{\"show_rate\":0.68}\n```").show_rate, 0.68);
});

test("rbac matches the spec table", () => {
  const committee = { role: "committee" as const, department: "Programmes" };
  const director = { role: "director" as const, department: "Programmes" };
  const president = { role: "president" as const, department: "Executive" };
  const f = decide(committee, "email.faculty");
  assert.equal(f.allowed, false);
  assert.equal(!f.allowed && f.approver_role, "president");
  const s = decide(committee, "email.speaker");
  assert.equal(!s.allowed && s.approver_role, "director");
  assert.equal(decide(director, "email.speaker").allowed, true);
  assert.equal(decide(director, "email.faculty").allowed, false);
  assert.equal(decide(director, "budget.approve", { amount: 3000, threshold: 1000 }).allowed, false);
  assert.equal(decide(director, "budget.approve", { amount: 800, threshold: 1000 }).allowed, true);
  assert.equal(decide(president, "publish.luma").allowed, true);
  assert.equal(canDecide(director, { approver_role: "director", approver_department: "Logistics" }), false);
  assert.equal(canDecide(director, { approver_role: "director", approver_department: "Programmes" }), true);
  assert.equal(canDecide(committee, { approver_role: "director", approver_department: "Programmes" }), false);
});

test("tight budget walks deeper adapt steps and reports shortfall honestly", () => {
  const suppliers: Record<string, Supplier[]> = {};
  for (const s of REFERENCE_SUPPLIERS) (suppliers[s.category] ??= []).push({ ...s, unit_price: s.unit_price! });
  const r = composeBudget({ pax: 80, predicted: 54, cap: 1500, contingencyPct: 10, foodBufferPct: 5, suppliers, venueCost: 0, speakers: 3, crew: 25, coreCommittee: 12, lanyardsForAttendees: false });
  assert.ok(r.iterations.length >= 5);
  assert.equal(r.final.withinCap, r.shortfall === 0);
  const impossible = composeBudget({ pax: 500, predicted: 400, cap: 100, contingencyPct: 10, foodBufferPct: 5, suppliers, venueCost: 0, speakers: 3, crew: 25, coreCommittee: 12, lanyardsForAttendees: true });
  assert.equal(impossible.final.withinCap, false);
  assert.ok(impossible.shortfall > 0);
});

import { blockedBy, criticalPath } from "../src/lib/planning";

test("timeline has acyclic dependencies ending at event day, with a critical path", () => {
  const t = buildTimeline("2026-11-15", TODAY, SUNWAY_SOP);
  const keys = new Set(t.map((x) => x.key));
  assert.ok(t.every((x) => x.deps.every((d) => keys.has(d))));
  const tasks = t.map((x) => ({ id: x.key, title: x.title, status: "todo", depends_on: x.deps, start_date: x.start_date, due_date: x.due_date }));
  const path = criticalPath(tasks, "eventday");
  assert.equal(path.at(-1), "eventday");
  assert.ok(path.length >= 4);
  const day = tasks.find((x) => x.id === "eventday")!;
  assert.ok(blockedBy(day, tasks).length > 0);
  assert.ok(t.every((x) => (x.start_date ?? "") <= x.due_date));
});
