import { NextResponse, type NextRequest } from "next/server";
import { googleProfile } from "@/lib/auth/google";
import { findOrCreateUser } from "@/lib/auth/accounts";
import { safeEqual, safeNext } from "@/lib/auth/tokens";
import { startSession } from "@/lib/session";
import { audit } from "@/lib/audit";

export async function GET(req: NextRequest) {
  const fail = (code: string) => NextResponse.redirect(new URL(`/login?error=${code}`, req.url));
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const expected = req.cookies.get("mv_g_state")?.value;
  const verifier = req.cookies.get("mv_g_verifier")?.value;
  if (!code || !state || !expected || !verifier || !safeEqual(state, expected)) return fail("google");
  try {
    const p = await googleProfile(code, verifier);
    const user = await findOrCreateUser({ email: p.email, name: p.name, googleSub: p.sub, avatarUrl: p.picture, verified: true });
    await startSession(user.id);
    await audit(user, "session.sign_in", { method: "google" });
    const res = NextResponse.redirect(new URL(safeNext(req.cookies.get("mv_g_next")?.value), req.url));
    for (const c of ["mv_g_state", "mv_g_verifier", "mv_g_next"]) res.cookies.set(c, "", { path: "/auth/google", maxAge: 0 });
    return res;
  } catch (err) {
    console.error("[auth] google sign-in failed", err);
    return fail("google");
  }
}
