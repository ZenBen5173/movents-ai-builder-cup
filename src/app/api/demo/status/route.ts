import { NextResponse } from "next/server";
import { currentUser } from "@/lib/session";
import { demoProgress } from "@/lib/demo";

export const dynamic = "force-dynamic";

/** Sample events planned so far in this visitor's sandbox. */
export async function GET() {
  const user = await currentUser();
  if (!user?.society_id) return NextResponse.json({ events: [], total: 3, done: false }, { status: 401 });
  return NextResponse.json(await demoProgress(user.society_id), { headers: { "cache-control": "no-store" } });
}
