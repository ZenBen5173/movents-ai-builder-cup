import { NextResponse } from "next/server";
import { runScheduler } from "@/lib/scheduler";
import { pruneAuthTables } from "@/lib/auth/accounts";
import { safeEqual } from "@/lib/auth/tokens";
import { backupDatabase } from "@/lib/backup";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/** Vercel Cron only (Authorization: Bearer CRON_SECRET). Admins run it from Settings. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || !safeEqual(auth, `Bearer ${secret}`)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Each step runs on its own: one failing must not skip the others (least of all the backup).
  const step = async <T,>(name: string, fn: () => Promise<T>) => {
    try {
      return { ok: true as const, result: await fn() };
    } catch (err) {
      console.error(JSON.stringify({ level: "error", msg: `daily ${name} failed`, err: String(err), stack: (err as Error)?.stack?.split("\n").slice(0, 4).join("\n") }));
      return { ok: false as const, error: `${name} failed` };
    }
  };
  const scheduler = await step("scheduler", () => runScheduler());
  const prune = await step("prune", () => pruneAuthTables());
  const backup = await step("backup", () => backupDatabase());
  const ok = scheduler.ok && prune.ok && backup.ok;
  return NextResponse.json({ ok, scheduler, prune, backup }, { status: ok ? 200 : 500 });
}
