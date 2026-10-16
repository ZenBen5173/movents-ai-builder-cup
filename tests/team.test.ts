import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePrompt } from "../src/lib/planning";

test("parsePrompt picks up the team", () => {
  const p = parsePrompt("Plan a 150-pax AI talk at Sunway on 15 Nov, budget RM3,000, with Priya, Jason and Arjun.", "2026-10-10");
  assert.deepEqual(p.team, ["Priya", "Jason", "Arjun"]);
  assert.equal(p.budget, 3000);
  assert.equal(p.title, "AI Talk @ Sunway");
});

test("no team when none named", () => {
  assert.deepEqual(parsePrompt("Plan a 60-pax workshop at Sunway on 12 Feb, budget RM1,200.", "2026-10-10").team, []);
});

test("parsePrompt picks up named suppliers", () => {
  const p = parsePrompt("Plan a 150-pax AI talk at Sunway on 15 Nov, budget RM3,000, with Priya and Jason. Use Mix Mix Catering for food. Suppliers: CUSTA, Lanyards.com.my.", "2026-10-10");
  assert.deepEqual(p.team, ["Priya", "Jason"]);
  assert.ok(p.suppliers.includes("Mix Mix Catering"));
  assert.ok(p.suppliers.includes("CUSTA"));
});
