import { test } from "node:test";
import assert from "node:assert/strict";

// Runs against DATABASE_URL when set (CI Postgres), else an in-memory PGlite.
if (!process.env.DATABASE_URL) process.env.PGLITE_DIR = "memory://";
const { insert, one, query, transaction, update } = await import("../src/lib/db");

test("jsonb arrays round-trip as arrays, not strings", async () => {
  await insert("tasks", { id: "tsk_db1", event_id: "evt_db", phase: "p", title: "t", due_date: "2026-11-01", depends_on: ["a", "b"] });
  const r = await one<{ t: string; depends_on: string[] }>("SELECT jsonb_typeof(depends_on) AS t, depends_on FROM tasks WHERE id = 'tsk_db1'");
  assert.equal(r?.t, "array");
  assert.deepEqual(r?.depends_on, ["a", "b"]);
  await update("tasks", "tsk_db1", { depends_on: ["c"] });
  const r2 = await one<{ depends_on: string[] }>("SELECT depends_on FROM tasks WHERE id = 'tsk_db1'");
  assert.deepEqual(r2?.depends_on, ["c"]);
});

test("transactions roll back on error", async () => {
  await assert.rejects(
    transaction(async () => {
      await query("DELETE FROM tasks WHERE id = 'tsk_db1'");
      throw new Error("boom");
    }),
  );
  assert.ok(await one("SELECT id FROM tasks WHERE id = 'tsk_db1'"));
  await query("DELETE FROM tasks WHERE id = 'tsk_db1'");
});

test("insert/update refuse non-identifier field names", async () => {
  await assert.rejects(insert("tasks", { "id) VALUES ('x'); --": 1 }), /Invalid field name/);
  await assert.rejects(update("tasks", "x", { "title = (SELECT 1), status": "a" }), /Invalid field name/);
});

test("reference data is seeded once", async () => {
  const r = await one<{ n: number }>("SELECT count(*)::int AS n FROM universities WHERE id = 'uni_sunway'");
  assert.equal(r?.n, 1);
});
