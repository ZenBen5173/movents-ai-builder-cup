import { exchangeCode, OAuthError, refreshTokens } from "@/lib/oauth";
import { formOrJson, json, oauthFail, preflight } from "@/lib/oauth-http";
import { clientIp, rateLimit, RateLimitError } from "@/lib/ratelimit";

export async function POST(req: Request) {
  try {
    await rateLimit(`oauth-token:${await clientIp()}`, 120, 3600);
    const p = await formOrJson(req);
    if (p.grant_type === "authorization_code") return json(await exchangeCode(p));
    if (p.grant_type === "refresh_token") return json(await refreshTokens(p));
    throw new OAuthError("unsupported_grant_type", "grant_type must be authorization_code or refresh_token");
  } catch (err) {
    if (err instanceof RateLimitError) return json({ error: "slow_down", error_description: err.message }, 429);
    return oauthFail(err);
  }
}
export const OPTIONS = preflight;
