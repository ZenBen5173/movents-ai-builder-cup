// Restore a daily backup made by /api/cron/daily.
//
//   npm run restore-backup -- backups/2026-10-14.json.gz          # dry run: what would be restored
//   npm run restore-backup -- backups/2026-10-14.json.gz --yes    # replace the data
//   npm run restore-backup -- ./local-copy.json.gz --yes          # from a downloaded file
//
// Needs DATABASE_URL (the target) and, for a backups/… key, BLOB_READ_WRITE_TOKEN
// of the store that holds it. The target is migrated first. Restoring replaces
// the contents of every table in the backup, so try it on a Neon branch first.
import fs from "node:fs";
import { decodeSnapshot, fetchBackup, restoreSnapshot } from "../src/lib/backup";
import { query } from "../src/lib/db";

const src = process.argv.slice(2).find((a) => !a.startsWith("--"));
const yes = process.argv.includes("--yes");
if (!src) {
  console.error("Usage: npm run restore-backup -- <backups/YYYY-MM-DD.json.gz | file.json.gz> [--yes]");
  process.exit(1);
}

const snap = src.startsWith("backups/") ? await fetchBackup(src) : decodeSnapshot(fs.readFileSync(src));
const total = Object.values(snap.tables).reduce((n, r) => n + r.length, 0);
console.log(`Backup from ${snap.created_at}: ${Object.keys(snap.tables).length} tables, ${total} rows`);
for (const [t, rows] of Object.entries(snap.tables)) if (rows.length) console.log(`  ${t.padEnd(22)} ${rows.length}`);

await query("SELECT 1"); // runs pending migrations on the target
if (!yes) {
  console.log("\nDry run. Re-run with --yes to replace the target's data with this backup.");
  process.exit(0);
}
const counts = await restoreSnapshot(snap);
console.log(`Restored ${Object.values(counts).reduce((a, b) => a + b, 0)} rows into ${Object.keys(counts).length} tables.`);
process.exit(0);
