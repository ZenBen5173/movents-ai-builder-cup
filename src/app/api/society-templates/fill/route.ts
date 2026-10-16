import { requireUser } from "@/lib/session";
import { handle } from "@/lib/server/http";
import { rateLimit } from "@/lib/ratelimit";
import { assertMember } from "@/lib/members";
import { fillTemplate } from "@/lib/agent/gemini/templates";

export const maxDuration = 120;

/** Fill a society template for one event with Gemini. */
export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser();
    await rateLimit(`template-fill:${user.id}`, 40, 3600);
    const body = (await req.json().catch(() => ({}))) as { template_id?: unknown; event_id?: unknown };
    const templateId = typeof body.template_id === "string" ? body.template_id : "";
    const eventId = typeof body.event_id === "string" ? body.event_id : "";
    if (!templateId || !eventId) throw new Error("template_id and event_id are required");
    await assertMember(user, eventId);
    return fillTemplate(user, templateId, eventId);
  });
}
