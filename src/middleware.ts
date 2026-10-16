import { NextResponse, type NextRequest } from "next/server";

const SESSION = "mv_session";

/**
 * API routes that read `Authorization: Bearer` themselves: MCP and agent
 * clients, and the daily cron (Vercel sends CRON_SECRET, checked by the route).
 */
const TOKEN_ROUTES = ["/api/mcp", "/api/agent/", "/api/runs/", "/api/outputs/", "/api/cron/"];

/** Pages anyone can open (each checks access itself where needed). */
const PUBLIC = /^\/(login|privacy|terms|auth\/|invite\/|oauth\/|onboarding|\.well-known\/|e\/|f\/|faculty\/|pay\/)/;

function sameSite(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).host === req.headers.get("host");
  } catch {
    return false;
  }
}

/**
 * 1. Bearer tokens only authenticate the token API routes. Everywhere else
 *    the Authorization header is removed, so an API or OAuth token cannot
 *    drive pages, server actions, settings or the OAuth consent screen.
 * 2. API writes authenticated by cookie must come from this site (CSRF).
 * 3. App pages without a session cookie go to sign-in. The session itself
 *    is validated against the database by currentUser() on the server.
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  let headers: Headers | undefined;
  if (req.headers.has("authorization") && !TOKEN_ROUTES.some((p) => pathname.startsWith(p))) {
    headers = new Headers(req.headers);
    headers.delete("authorization");
  }
  const pass = () => (headers ? NextResponse.next({ request: { headers } }) : NextResponse.next());

  if (pathname.startsWith("/api/")) {
    const write = !["GET", "HEAD", "OPTIONS"].includes(req.method);
    const cookieAuth = req.cookies.get(SESSION) && !(headers ?? req.headers).get("authorization");
    if (write && cookieAuth && !pathname.startsWith("/api/payments/webhook") && !sameSite(req)) {
      return NextResponse.json({ error: "Cross-site request blocked" }, { status: 403 });
    }
    return pass();
  }
  if (PUBLIC.test(pathname) || req.cookies.get(SESSION)) return pass();
  const login = new URL("/login", req.url);
  const next = pathname + req.nextUrl.search;
  if (next !== "/") login.searchParams.set("next", next);
  return NextResponse.redirect(login);
}

export const config = {
  // Everything except static assets.
  matcher: ["/((?!_next/static|_next/image|icons/|venues/|unis/|icon|apple-icon|manifest|sw.js|robots.txt|favicon|.*\\.(?:png|jpg|jpeg|svg|webp|ico|woff2?)$).*)"],
};
