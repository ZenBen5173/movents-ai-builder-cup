import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import crypto from "node:crypto";
import { MIGRATIONS } from "./migrations";

/**
 * One SQL interface, two engines.
 *
 * - DATABASE_URL set → Postgres through the `postgres` driver (production).
 * - Not set → PGlite, an in-process Postgres under .data/ for local
 *   development and tests. Refused on Vercel, where every instance would get
 *   its own private copy.
 */

type Row = Record<string, unknown>;
type Runner = {
  query: (sql: string, params?: unknown[]) => Promise<Row[]>;
  /** Several statements, no parameters. */
  exec: (sql: string) => Promise<void>;
};
type Engine = Runner & { transaction: <T>(fn: (tx: Runner) => Promise<T>) => Promise<T> };

const g = globalThis as unknown as { __mvDb?: Promise<Engine> };
const txStore = new AsyncLocalStorage<Runner>();

async function createEngine(): Promise<Engine> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const { default: postgres } = await import("postgres");
    // insert()/update() already JSON.stringify objects. The driver's default
    // json serializer would stringify them again and store a jsonb *string*
    // ('"[]"'), so pass strings through untouched.
    const sql = postgres(url, {
      prepare: false,
      max: Number(process.env.DATABASE_POOL_MAX ?? 3),
      idle_timeout: 20,
      connect_timeout: 10,
      onnotice: () => {},
      types: {
        json: {
          to: 114,
          from: [114, 3802],
          serialize: (x: unknown) => (typeof x === "string" ? x : JSON.stringify(x)),
          parse: (x: string) => JSON.parse(x),
        },
      },
    });
    type Sql = typeof sql;
    const runner = (s: Pick<Sql, "unsafe">): Runner => ({
      query: async (text, params = []) => (await s.unsafe(text, params as never[])) as unknown as Row[],
      exec: async (text) => {
        await s.unsafe(text);
      },
    });
    return {
      ...runner(sql),
      transaction: (fn) => sql.begin((tx) => fn(runner(tx as unknown as Sql))) as never,
    };
  }
  if (process.env.VERCEL) {
    throw new Error("DATABASE_URL is not set. Movents needs a Postgres database in production.");
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const path = await import("node:path");
  const fs = await import("node:fs");
  const dir = process.env.PGLITE_DIR || path.join(process.cwd(), ".data", "pglite");
  if (dir !== "memory://") fs.mkdirSync(dir, { recursive: true });
  const db = new PGlite(dir);
  await db.waitReady;
  type Tx = { query: typeof db.query; exec: typeof db.exec };
  const runner = (s: Tx): Runner => ({
    query: async (text, params = []) => (await s.query<Row>(text, params as unknown[])).rows,
    exec: async (text) => {
      await s.exec(text);
    },
  });
  return { ...runner(db), transaction: (fn) => db.transaction((tx) => fn(runner(tx))) };
}

/** Apply pending migrations under an advisory lock. Cheap when up to date. */
export async function migrate(e: Engine) {
  await e.exec("CREATE TABLE IF NOT EXISTS schema_migrations (id integer PRIMARY KEY, name text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())");
  const latest = MIGRATIONS[MIGRATIONS.length - 1].id;
  const [{ v }] = (await e.query("SELECT coalesce(max(id), 0)::int AS v FROM schema_migrations")) as { v: number }[];
  if (v >= latest) return;
  await e.transaction(async (tx) => {
    await tx.query("SELECT pg_advisory_xact_lock(727274)");
    const done = new Set(((await tx.query("SELECT id FROM schema_migrations")) as { id: number }[]).map((r) => r.id));
    for (const m of MIGRATIONS) {
      if (done.has(m.id)) continue;
      if (m.sql) await tx.exec(m.sql);
      if (m.run) await m.run((sql, params) => tx.query(sql, params));
      await tx.query("INSERT INTO schema_migrations (id, name) VALUES ($1, $2)", [m.id, m.name]);
      console.info(`[db] applied migration ${m.id}_${m.name}`);
    }
  });
}

async function init(): Promise<Engine> {
  const e = await createEngine();
  await migrate(e);
  return e;
}

function engine(): Promise<Engine> {
  if (!g.__mvDb) {
    g.__mvDb = init().catch((err) => {
      g.__mvDb = undefined;
      throw err;
    });
  }
  return g.__mvDb;
}

export async function query<T = Row>(sql: string, params: unknown[] = []): Promise<T[]> {
  const tx = txStore.getStore();
  if (tx) return (await tx.query(sql, params)) as T[];
  return (await (await engine()).query(sql, params)) as T[];
}

export async function one<T = Row>(sql: string, params: unknown[] = []): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] ?? null;
}

/**
 * Run `fn` in a transaction. query/one/insert/update called inside it (at any
 * depth) use the transaction automatically. Nested calls join the outer one.
 */
export async function transaction<T>(fn: () => Promise<T>): Promise<T> {
  if (txStore.getStore()) return fn();
  const e = await engine();
  return e.transaction((tx) => txStore.run(tx, fn));
}

export function id(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

const IDENT = /^[a-z_][a-z0-9_]*$/;

/** Table and column names are spliced into SQL, so they must be plain identifiers. */
function ident(name: string) {
  if (!IDENT.test(name)) throw new Error(`Invalid field name: ${name.slice(0, 40)}`);
  return name;
}

/** Insert a row from an object; JSON-able objects are stored as jsonb. */
export async function insert<T = Row>(table: string, data: Record<string, unknown>): Promise<T> {
  const keys = Object.keys(data).filter((k) => data[k] !== undefined).map(ident);
  const vals = keys.map((k) => toDb(data[k]));
  const sql = `INSERT INTO ${ident(table)} (${keys.join(", ")}) VALUES (${keys
    .map((_, i) => `$${i + 1}`)
    .join(", ")}) RETURNING *`;
  const rows = await query<T>(sql, vals);
  return rows[0];
}

export async function update<T = Row>(
  table: string,
  rowId: string,
  data: Record<string, unknown>,
): Promise<T | null> {
  const t = ident(table);
  const keys = Object.keys(data).filter((k) => data[k] !== undefined).map(ident);
  if (keys.length === 0) return one<T>(`SELECT * FROM ${t} WHERE id = $1`, [rowId]);
  const sql = `UPDATE ${t} SET ${keys.map((k, i) => `${k} = $${i + 1}`).join(", ")} WHERE id = $${
    keys.length + 1
  } RETURNING *`;
  const rows = await query<T>(sql, [...keys.map((k) => toDb(data[k])), rowId]);
  return rows[0] ?? null;
}

/** Keep only the listed keys. Use on any object that came from a client. */
export function pick<T extends Record<string, unknown>, K extends string>(data: T, allowed: readonly K[]): Partial<Pick<T, K & keyof T>> {
  const out: Record<string, unknown> = {};
  if (!data || typeof data !== "object") return out as never;
  for (const k of allowed) if (Object.prototype.hasOwnProperty.call(data, k)) out[k] = data[k as keyof T];
  return out as never;
}

function toDb(v: unknown) {
  if (v === null) return null;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object") return JSON.stringify(v);
  return v;
}
