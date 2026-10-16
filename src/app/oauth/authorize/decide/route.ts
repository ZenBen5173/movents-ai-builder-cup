import { NextResponse } from "next/server";
import { currentUser } from "@/lib/session";
import { appUrl } from "@/lib/appurl";
import { audit } from "@/lib/audit";
import { authorizeParamError, checkAuthorizeRequest, issueCode } from "@/lib/oauth";

/**
 * Consent form target. The browser is sent back to the client with a page
 * that navigates on load: a 302 after a form POST would be blocked by the
 * CSP form-action rule for app schemes and other origins.
 */
export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  let host: string | null = null;
  try {
    host = origin ? new URL(origin).host : null;
  } catch {
    host = "invalid";
  }
  if (origin && host !== new URL(appUrl()).host && host !== req.headers.get("host")) {
    return NextResponse.json({ error: "Cross-site request blocked" }, { status: 403 });
  }
  const p = Object.fromEntries((await req.formData()).entries()) as Record<string, string>;
  const user = await currentUser();
  if (!user?.society_id) return NextResponse.redirect(new URL("/login", req.url), 303);
  let client;
  try {
    client = await checkAuthorizeRequest(p);
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const target = new URL(p.redirect_uri);
  const bad = authorizeParamError(p);
  if (p.decision !== "allow" || bad) {
    target.searchParams.set("error", bad ?? "access_denied");
  } else {
    const code = await issueCode(user.id, { client_id: client.id, redirect_uri: p.redirect_uri, code_challenge: p.code_challenge, scope: p.scope, resource: p.resource });
    target.searchParams.set("code", code);
    await audit(user, "oauth.authorized", { client: client.name });
  }
  if (p.state) target.searchParams.set("state", p.state);
  target.searchParams.set("iss", appUrl());
  const href = target.toString().replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  return new NextResponse(
    `<!doctype html><meta charset="utf-8"><meta name="referrer" content="no-referrer"><meta http-equiv="refresh" content="0;url=${href}"><title>Returning…</title><body style="font-family:system-ui;padding:40px"><p>Returning to ${client.name.replace(/[<>&"]/g, "")}… <a href="${href}">Continue</a></p></body>`,
    { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } },
  );
}
