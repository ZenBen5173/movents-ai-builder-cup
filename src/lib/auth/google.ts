import "server-only";
import crypto from "node:crypto";
import { appUrl } from "../appurl";

/** Sign in with Google. Set AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET to enable. */
export const googleEnabled = () => Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);

const redirectUri = () => `${appUrl()}/auth/google/callback`;

export function googleAuthUrl(state: string, verifier: string) {
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  const p = new URLSearchParams({
    client_id: process.env.AUTH_GOOGLE_ID!,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: "openid email profile",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    prompt: "select_account",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

export async function googleProfile(code: string, verifier: string) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.AUTH_GOOGLE_ID!,
      client_secret: process.env.AUTH_GOOGLE_SECRET!,
      redirect_uri: redirectUri(),
      grant_type: "authorization_code",
      code_verifier: verifier,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Google token exchange failed (${res.status})`);
  const { access_token } = (await res.json()) as { access_token: string };
  const info = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { authorization: `Bearer ${access_token}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (!info.ok) throw new Error(`Google profile request failed (${info.status})`);
  const p = (await info.json()) as { sub: string; email?: string; email_verified?: boolean; name?: string; picture?: string };
  if (!p.email || !p.email_verified) throw new Error("Your Google account has no verified email address.");
  return { sub: p.sub, email: p.email, name: p.name ?? null, picture: p.picture ?? null };
}
