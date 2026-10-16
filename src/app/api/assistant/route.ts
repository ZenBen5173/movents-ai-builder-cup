import { requireUser } from "@/lib/session";
import { handle } from "@/lib/server/http";
import { assertMember } from "@/lib/members";
import { rateLimit } from "@/lib/ratelimit";
import { geminiEnabled } from "@/lib/ai/gemini";
import { askMovi, type ChatTurn } from "@/lib/agent/gemini/assistant";

export const maxDuration = 120;

/** Ask Movi to change an event. Returns a reply and proposals; nothing is applied here. */
export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser();
    await rateLimit(`movi:${user.id}`, 60, 3600);
    if (!geminiEnabled()) throw new Error("Gemini is not set up on this server");
    const body = (await req.json().catch(() => ({}))) as { event_id?: unknown; message?: unknown; history?: unknown };
    const eventId = typeof body.event_id === "string" ? body.event_id : "";
    const message = typeof body.message === "string" ? body.message.trim() : "";
    if (!eventId || !message) throw new Error("event_id and message are required");
    await assertMember(user, eventId);
    const history = (Array.isArray(body.history) ? body.history : [])
      .filter((t): t is ChatTurn => Boolean(t) && typeof (t as ChatTurn).text === "string" && ((t as ChatTurn).role === "user" || (t as ChatTurn).role === "assistant"))
      .slice(-8);
    return askMovi(user, eventId, history, message);
  });
}
