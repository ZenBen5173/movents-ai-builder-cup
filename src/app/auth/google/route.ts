import { NextResponse, type NextRequest } from "next/server";
import { googleAuthUrl, googleEnabled } from "@/lib/auth/google";
import { randomToken, safeNext } from "@/lib/auth/tokens";

export async function GET(req: NextRequest) {
  if (!googleEnabled()) return NextResponse.redirect(new URL("/login?error=google", req.url));
  const state = randomToken("", 16);
  const verifier = randomToken("", 32);
  const res = NextResponse.redirect(googleAuthUrl(state, verifier));
  const opts = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/auth/google", maxAge: 600 };
  res.cookies.set("mv_g_state", state, opts);
  res.cookies.set("mv_g_verifier", verifier, opts);
  res.cookies.set("mv_g_next", safeNext(req.nextUrl.searchParams.get("next")), opts);
  return res;
}
