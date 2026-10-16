import { test } from "node:test";
import assert from "node:assert/strict";
import { klParts, minutesMarkdown, normAgenda, phaseFor, toStartsAt, type Meeting } from "../src/lib/meetings-shared";

test("meeting times round-trip in Malaysia time", () => {
  const iso = toStartsAt("2026-10-13", "20:00");
  assert.equal(iso, "2026-10-13T12:00:00.000Z");
  assert.deepEqual(klParts(iso), { date: "2026-10-13", time: "20:00" });
});

test("action item phase follows the due date", () => {
  assert.equal(phaseFor("2026-11-20", "2026-11-15"), "post");
  assert.equal(phaseFor("2026-11-10", "2026-11-15"), "execution");
  assert.equal(phaseFor("2026-10-20", "2026-11-15"), "promotion");
  assert.equal(phaseFor("2026-09-10", "2026-11-15"), "planning");
});

test("agenda strings become items", () => {
  const a = normAgenda(["Budget", { item: "Sponsors", minutes: 10 }, ""]);
  assert.equal(a.length, 2);
  assert.equal(a[0].item, "Budget");
  assert.equal(a[1].minutes, 10);
});

test("minutes text has no dashes other than bullets and lists absentees", () => {
  const m: Meeting = {
    id: "mtg_1", event_id: "evt_1", title: "Kick-off", starts_at: toStartsAt("2026-09-30", "19:00"), duration_min: 60,
    location: "Room 3", meeting_url: null, agenda: [{ item: "Goals", owner: "u1", minutes: 10, done: true }],
    attendees: ["u1", "u2"], attended: ["u1"], minutes: "## Goals\n- 150 students", decisions: ["Cap stays at RM3,000"],
    action_items: [{ id: "a", text: "Send deck", owner_id: "u2", due_date: "2026-10-14", task_id: null, done: false }],
    status: "done", created_by: "u1", created_at: new Date().toISOString(),
  };
  const md = minutesMarkdown(m, { eventTitle: "AI Talk", names: { u1: "Priya Nair", u2: "Jason Lim" } });
  assert.match(md, /absent: Jason Lim/);
  assert.match(md, /- \[ \] Send deck \(Jason Lim, due 14 Oct\)/);
  assert.doesNotMatch(md, /[–—]/);
});
