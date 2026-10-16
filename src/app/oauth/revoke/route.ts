import { revokeToken } from "@/lib/oauth";
import { formOrJson, json, preflight } from "@/lib/oauth-http";

/** RFC 7009: always 200, whether or not the token existed. */
export async function POST(req: Request) {
  const p = await formOrJson(req);
  if (p.token) await revokeToken(p.token);
  return json({});
}
export const OPTIONS = preflight;
