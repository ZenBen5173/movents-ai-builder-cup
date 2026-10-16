import { after } from "next/server";
import { requireUser } from "@/lib/session";
import { handle } from "@/lib/server/http";
import { execute, startRun } from "@/lib/agent/pipelines";
import { rateLimit } from "@/lib/ratelimit";

export const maxDuration = 300;

/** Start an agent run from one prompt. Returns immediately; poll /api/runs/:id for the live trace. */
export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser();
    await rateLimit(`agent-run:${user.id}`, 30, 3600);
    const { prompt } = (await req.json().catch(() => ({}))) as { prompt?: unknown };
    const text = typeof prompt === "string" ? prompt.trim().slice(0, 4000) : "";
    if (!text) throw new Error("prompt is required");
    const { run, kind } = await startRun(user, text);
    after(() => execute(run, kind));
    return { run_id: run.id, kind, trace_url: `/runs/${run.id}` };
  });
}
