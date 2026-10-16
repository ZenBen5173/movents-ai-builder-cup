"use server";

import { redirect } from "next/navigation";
import { publicError } from "@/lib/errors";
import { consumeLoginLink, deleteAccount, endAllSessions, normaliseEmail, sendLoginLink } from "@/lib/auth/accounts";
import { clientIp, rateLimit, RateLimitError } from "@/lib/ratelimit";
import { endSession, startSession, currentUser } from "@/lib/session";
import { audit } from "@/lib/audit";

export type LoginState = { ok: boolean; sentTo?: string; error?: string };

export async function requestLoginLink(_prev: LoginState, form: FormData): Promise<LoginState> {
  const email = normaliseEmail(String(form.get("email") ?? ""));
  try {
    const ip = await clientIp();
    await rateLimit(`login:ip:${ip}`, 20, 3600);
    await rateLimit(`login:email:${email}`, 5, 900);
    await sendLoginLink(email, String(form.get("next") ?? "/"));
    return { ok: true, sentTo: email };
  } catch (err) {
    if (!(err instanceof RateLimitError)) console.error("[auth] login link failed", err);
    return { ok: false, error: publicError(err) };
  }
}

/** The emailed link lands on a page with a button that posts here, so link scanners cannot spend it. */
export async function confirmLoginLink(form: FormData) {
  const token = String(form.get("token") ?? "");
  await rateLimit(`verify:ip:${await clientIp()}`, 30, 3600);
  const r = token ? await consumeLoginLink(token) : null;
  if (!r) redirect("/login?error=link");
  await startSession(r.user.id);
  await audit(r.user, "session.sign_in", { method: "email" });
  redirect(r.next);
}

export async function signOut() {
  const u = await currentUser();
  await endSession();
  if (u) await audit(u, "session.sign_out", {});
  redirect("/login");
}

export async function signOutEverywhere() {
  const u = await currentUser();
  if (u) {
    await endAllSessions(u.id);
    await audit(u, "session.sign_out_all", {});
  }
  await endSession();
  redirect("/login");
}

export async function deleteMyAccount(confirmEmail: string): Promise<{ ok: false; error: string } | never> {
  const u = await currentUser();
  if (!u) redirect("/login");
  if (normaliseEmail(confirmEmail) !== normaliseEmail(u.email)) return { ok: false, error: "Type your email exactly to confirm." };
  try {
    await audit(u, "account.deleted", {});
    await deleteAccount(u.id);
  } catch (err) {
    return { ok: false, error: publicError(err) };
  }
  await endSession();
  redirect("/login");
}
