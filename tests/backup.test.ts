import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

if (!process.env.DATABASE_URL) process.env.PGLITE_DIR = "memory://";
const { snapshot, restoreSnapshot, encodeSnapshot, decodeSnapshot } = await import("../src/lib/backup");
const { query } = await import("../src/lib/db");

// A scratch table of our own, so restoring can't disturb other test files sharing CI's database.
const T = `backup_test_${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`;

test("backup: snapshot survives gzip and restores rows, JSON columns and deletions", async () => {
  await query(`CREATE TABLE ${T} (id text PRIMARY KEY, label text, data jsonb, at timestamptz)`);
  try {
    await query(`INSERT INTO ${T} VALUES ('a', 'first', '{"tags":["x","y"],"n":1}', now()), ('b', 'second', NULL, now())`);
    const full = decodeSnapshot(encodeSnapshot(await snapshot()));
    assert.equal(full.tables[T].length, 2);
    assert.ok(!("sessions" in full.tables) && !("rate_limits" in full.tables), "short-lived security tables are skipped");

    await query(`UPDATE ${T} SET label = 'changed' WHERE id = 'a'`);
    await query(`DELETE FROM ${T} WHERE id = 'b'`);
    await query(`INSERT INTO ${T} VALUES ('c', 'added later', NULL, now())`);

    const counts = await restoreSnapshot({ ...full, tables: { [T]: full.tables[T] } });
    assert.equal(counts[T], 2);
    const rows = await query<{ id: string; label: string; data: { tags: string[]; n: number } | null }>(`SELECT id, label, data FROM ${T} ORDER BY id`);
    assert.deepEqual(rows.map((r) => [r.id, r.label]), [["a", "first"], ["b", "second"]]);
    assert.deepEqual(rows[0].data, { tags: ["x", "y"], n: 1 });
  } finally {
    await query(`DROP TABLE IF EXISTS ${T}`);
  }
});

test("backup: refuses something that isn't a Movents backup", async () => {
  await assert.rejects(restoreSnapshot({ tables: {} } as never), /Not a Movents backup/);
});
