import { registerClient } from "@/lib/oauth";
import { json, oauthFail, preflight } from "@/lib/oauth-http";
import { clientIp, rateLimit, RateLimitError } from "@/lib/ratelimit";

/** RFC 7591 dynamic client registration (public clients). */
export async function POST(req: Request) {
  try {
    await rateLimit(`oauth-register:${await clientIp()}`, 30, 3600);
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    return json(await registerClient(body), 201);
  } catch (err) {
    if (err instanceof RateLimitError) return json({ error: "slow_down", error_description: err.message }, 429);
    return oauthFail(err);
  }
}
export const OPTIONS = preflight;
