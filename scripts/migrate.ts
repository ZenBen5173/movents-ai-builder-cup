// Apply pending database migrations: `npm run migrate`.
// The app also applies them on first query, so this is for deploy pipelines.
import { query } from "../src/lib/db";

const rows = await query<{ id: number; name: string }>("SELECT id, name FROM schema_migrations ORDER BY id");
console.log(`Database is at migration ${rows.at(-1)?.id ?? 0} (${rows.map((r) => `${r.id}_${r.name}`).join(", ")})`);
process.exit(0);
