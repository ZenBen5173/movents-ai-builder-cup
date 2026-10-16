import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSopText } from "../src/lib/sop-parse";
import { SUNWAY_SOP, SUNWAY_SOP_TEXT } from "../src/lib/sop-default";

test("seed SOP text round-trips into the same structure", () => {
  const r = parseSopText(SUNWAY_SOP_TEXT, SUNWAY_SOP);
  assert.equal(r.sop.required_sections.length, SUNWAY_SOP.required_sections.length);
  assert.equal(r.sop.lead_times.length, SUNWAY_SOP.lead_times.length);
  assert.deepEqual(r.sop.lead_times.map((l) => l.weeks_before), SUNWAY_SOP.lead_times.map((l) => l.weeks_before));
  assert.equal(r.sop.budget_rules.contingency_pct, 10);
  assert.equal(r.sop.budget_rules.president_threshold, 1000);
  assert.equal(r.sop.budget_rules.claims_days_after, 14);
});

test("a different university's SOP is detected", () => {
  const text = `# Event SOP version 3.2
## Approval chain
1. Committee drafts proposal
2. Faculty advisor approves
3. Student Affairs (HEP) final approval
## Lead times
- Venue booking: at least 20 working days before
- Proposal to HEP: minimum 3 weeks before
## Proposal format
1. Overview — basics
2. Budget — itemised
3. Safety Plan — risks
## Rules
- Spending above RM800 needs President approval.
- Claims within 7 days after the event.
- 15% contingency required.`;
  const r = parseSopText(text, SUNWAY_SOP);
  assert.equal(r.sop.version, "3.2");
  assert.equal(r.found.sections, 3);
  assert.equal(r.sop.lead_times.find((l) => /venue/i.test(l.label))?.weeks_before, 4);
  assert.equal(r.sop.lead_times.find((l) => /HEP/i.test(l.label))?.weeks_before, 3);
  assert.equal(r.sop.approval_chain[2].role, "student_life");
  assert.equal(r.sop.approval_chain[1].role, "faculty_advisor");
  assert.equal(r.sop.budget_rules.president_threshold, 800);
  assert.equal(r.sop.budget_rules.claims_days_after, 7);
  assert.equal(r.sop.budget_rules.contingency_pct, 15);
  assert.equal(r.sop.rules.length, 3);
});
