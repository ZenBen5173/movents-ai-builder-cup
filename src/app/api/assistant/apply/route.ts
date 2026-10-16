import { requireUser } from "@/lib/session";
import { handle } from "@/lib/server/http";
import { assertMember } from "@/lib/members";
import { rateLimit } from "@/lib/ratelimit";
import { applyProposals, type Proposal } from "@/lib/agent/gemini/assistant";

export const maxDuration = 300;

/** Apply the proposals the user accepted, as the user (role and team checks apply to every one). */
export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser();
    await rateLimit(`movi-apply:${user.id}`, 60, 3600);
    const body = (await req.json().catch(() => ({}))) as { event_id?: unknown; proposals?: unknown; request?: unknown };
    const eventId = typeof body.event_id === "string" ? body.event_id : "";
    if (!eventId) throw new Error("event_id is required");
    await assertMember(user, eventId);
    const proposals = (Array.isArray(body.proposals) ? body.proposals : []).filter(
      (p): p is Proposal => Boolean(p) && typeof (p as Proposal).tool === "string" && typeof (p as Proposal).args === "object" && (p as Proposal).args !== null,
    );
    return applyProposals(user, eventId, proposals, typeof body.request === "string" ? body.request : "");
  });
}
