import { NextResponse } from "next/server";
import { OAuthError } from "./oauth";
import { publicError } from "./errors";

/** Discovery, registration and token endpoints are called from other origins (browser-based clients). */
export const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type, authorization, mcp-protocol-version",
  "access-control-max-age": "86400",
};

export const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { ...CORS, "cache-control": "no-store" } });

export function oauthFail(err: unknown) {
  if (err instanceof OAuthError) return json({ error: err.code, error_description: err.message }, err.status);
  return json({ error: "server_error", error_description: publicError(err) }, 500);
}

export async function formOrJson(req: Request): Promise<Record<string, string>> {
  const type = req.headers.get("content-type") ?? "";
  if (type.includes("application/json")) {
    const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    return Object.fromEntries(Object.entries(b).map(([k, v]) => [k, typeof v === "string" ? v : JSON.stringify(v)]));
  }
  return Object.fromEntries(new URLSearchParams(await req.text()));
}

export const preflight = () => new NextResponse(null, { status: 204, headers: CORS });
