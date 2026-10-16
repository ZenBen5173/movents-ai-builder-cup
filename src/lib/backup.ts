import "server-only";
import { gunzipSync, gzipSync } from "node:zlib";
import { del, get, list, put } from "@vercel/blob";
import { query, transaction } from "./db";
import { blobEnabled } from "./storage";

/**
 * Daily logical backup to the private Blob store (`backups/YYYY-MM-DD.json.gz`),
 * kept for KEEP_DAYS. Complements the database provider's short point-in-time
 * restore window. Restore with `npm run restore-backup` (see the script).
 *
 * Short-lived security rows (sessions, sign-in links, OAuth codes and tokens,
 * rate limits) are left out: after a restore people simply sign in again.
 * schema_migrations stays with the target database. Fine for a small
 * database; move to pg_dump on a worker as data grows.
 */
const SKIP = new Set(["sessions", "login_tokens", "oauth_codes", "oauth_tokens", "rate_limits", "schema_migrations"]);
const KEEP_DAYS = 14;
const IDENT = /^[a-z_][a-z0-9_]*$/;

export type Snapshot = { version: 1; created_at: string; tables: Record<string, Record<string, unknown>[]> };

async function tableNames() {
  const rows = await query<{ name: string }>("SELECT tablename AS name FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename");
  return rows.map((t) => t.name).filter((t) => IDENT.test(t) && !SKIP.has(t));
}

export async function snapshot(now = new Date()): Promise<Snapshot> {
  const tables: Snapshot["tables"] = {};
  for (const t of await tableNames()) tables[t] = await query(`SELECT * FROM ${t}`);
  return { version: 1, created_at: now.toISOString(), tables };
}

/**
 * Replace the backed-up tables' contents with the snapshot, in one transaction.
 * The target must already be migrated; columns missing from an older backup
 * come back as NULL/defaults, columns the target no longer has are ignored.
 */
export async function restoreSnapshot(snap: Snapshot) {
  if (snap?.version !== 1 || typeof snap.tables !== "object") throw new Error("Not a Movents backup");
  const present = new Set(await tableNames());
  const counts: Record<string, number> = {};
  await transaction(async () => {
    for (const [t, rows] of Object.entries(snap.tables)) {
      if (!present.has(t)) continue;
      await query(`DELETE FROM ${t}`);
      for (let i = 0; i < rows.length; i += 500) {
        await query(`INSERT INTO ${t} SELECT * FROM json_populate_recordset(null::${t}, $1::text::json)`, [JSON.stringify(rows.slice(i, i + 500))]);
      }
      counts[t] = rows.length;
    }
  });
  return counts;
}

export const encodeSnapshot = (s: Snapshot) => gzipSync(JSON.stringify(s));
export const decodeSnapshot = (buf: Buffer) => JSON.parse(gunzipSync(buf).toString("utf8")) as Snapshot;

/** Read a backup from the Blob store by key, e.g. "backups/2026-10-14.json.gz". */
export async function fetchBackup(key: string) {
  const r = await get(key, { access: "private" });
  if (!r || r.statusCode !== 200) throw new Error(`Backup not found: ${key}`);
  return decodeSnapshot(Buffer.from(await new Response(r.stream).arrayBuffer()));
}

export async function backupDatabase(now = new Date()) {
  if (!blobEnabled()) return { skipped: "no Blob store connected" };
  const snap = await snapshot(now);
  const body = encodeSnapshot(snap);
  const key = `backups/${now.toISOString().slice(0, 10)}.json.gz`;
  await put(key, body, { access: "private", contentType: "application/gzip", addRandomSuffix: false, allowOverwrite: true });

  const cutoff = now.getTime() - KEEP_DAYS * 86_400_000;
  const old: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await list({ prefix: "backups/", cursor });
    old.push(...page.blobs.filter((b) => new Date(b.uploadedAt).getTime() < cutoff).map((b) => b.pathname));
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  if (old.length) await del(old);
  const rows = Object.values(snap.tables).reduce((n, r) => n + r.length, 0);
  return { key, bytes: body.length, tables: Object.keys(snap.tables).length, rows, deleted: old.length };
}
