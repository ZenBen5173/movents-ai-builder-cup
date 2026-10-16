import { NextResponse } from "next/server";
import { one } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Liveness + database check for uptime monitors. */
export async function GET() {
  const t0 = Date.now();
  try {
    const r = await one<{ v: number }>("SELECT max(id)::int AS v FROM schema_migrations");
    return NextResponse.json({ ok: true, db: "up", migration: r?.v ?? 0, ms: Date.now() - t0 }, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    console.error("[health] database check failed", err);
    return NextResponse.json({ ok: false, db: "down" }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
