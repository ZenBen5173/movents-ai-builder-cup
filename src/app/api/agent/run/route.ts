import { after } from "next/server";
import { requireUser } from "@/lib/session";
import { handle } from "@/lib/server/http";
import { classify, execute } from "@/lib/agent/pipelines";
import { Run } from "@/lib/agent/run";
import { geminiPlan } from "@/lib/agent/gemini/orchestrator";
import { geminiEnabled } from "@/lib/ai/gemini";
import { rateLimit } from "@/lib/ratelimit";

export const maxDuration = 300;

/**
 * Start an agent run from one prompt. Returns immediately; poll /api/runs/:id for the live trace.
 * Planning runs on the Gemini agents when GEMINI_API_KEY is set (engine "rules" forces the rule-based planner).
 */
export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser();
    await rateLimit(`agent-run:${user.id}`, 30, 3600);
    const { prompt, engine } = (await req.json().catch(() => ({}))) as { prompt?: unknown; engine?: unknown };
    const text = typeof prompt === "string" ? prompt.trim().slice(0, 4000) : "";
    if (!text) throw new Error("prompt is required");
    // Gemini reads any brief ("we want a workshop next month..."); the keyword router needs "plan".
    const useGemini = classify(text) !== "report" && geminiEnabled() && engine !== "rules";
    const kind = useGemini ? "plan" : classify(text);
    const run = await Run.start(user, text, kind, useGemini ? "gemini" : "builtin");
    after(() => (useGemini ? geminiPlan(run) : execute(run, kind)));
    return { run_id: run.id, kind, engine: useGemini ? "gemini" : "rules", trace_url: `/runs/${run.id}` };
  });
}
