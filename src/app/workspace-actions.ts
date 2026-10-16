"use server";

import { publicError } from "@/lib/errors";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { currentUser, requireUser } from "@/lib/session";
import { rateLimit } from "@/lib/ratelimit";
import * as W from "@/lib/workspace";
import type { Role } from "@/lib/types";

type Res = { ok: true; message?: string } | { ok: false; error: string };

async function signedIn() {
  const u = await currentUser();
  if (!u) redirect("/login");
  return u;
}

async function run(fn: () => Promise<string | void>): Promise<Res> {
  try {
    const message = (await fn()) ?? undefined;
    revalidatePath("/", "layout");
    return { ok: true, message };
  } catch (err) {
    return { ok: false, error: publicError(err) };
  }
}

export async function createSocietyAction(_prev: Res | null, form: FormData): Promise<Res> {
  const user = await signedIn();
  const r = await run(async () => {
    await rateLimit(`society:create:${user.id}`, 5, 86400);
    const uni = String(form.get("university") ?? "");
    await W.createSociety(user, {
      name: String(form.get("name") ?? ""),
      universityId: uni,
      newUniversity: uni === "__new" ? { name: String(form.get("uni_name") ?? ""), short: String(form.get("uni_short") ?? "") } : undefined,
    });
  });
  if (r.ok) redirect("/");
  return r;
}

export async function acceptInviteAction(inviteId: string) {
  const user = await signedIn();
  const r = await run(() => W.acceptInviteById(user, inviteId));
  if (r.ok) redirect("/");
  return r;
}

export async function acceptInviteTokenAction(form: FormData) {
  const user = await signedIn();
  const token = String(form.get("token") ?? "");
  try {
    await W.acceptInvite(user, token);
  } catch {
    redirect(`/invite/${encodeURIComponent(token)}?error=1`);
  }
  revalidatePath("/", "layout");
  redirect("/");
}

export async function switchWorkspaceAction(societyId: string) {
  const user = await signedIn();
  return run(() => W.switchWorkspace(user.id, societyId));
}

export async function inviteMemberAction(input: { email: string; role: Role; department?: string | null }) {
  return run(async () => {
    const user = await requireUser();
    await rateLimit(`invite:${user.id}`, 50, 86400);
    await W.inviteMember(user, input);
    return `Invite sent to ${input.email.trim()}`;
  });
}

export async function revokeInviteAction(inviteId: string) {
  return run(async () => W.revokeInvite(await requireUser(), inviteId));
}

export async function changeRoleAction(userId: string, role: Role, department: string | null) {
  return run(async () => {
    await W.changeMemberRole(await requireUser(), userId, role, department);
    return "Role updated";
  });
}

export async function removeMemberAction(userId: string) {
  return run(async () => {
    await W.removeFromSociety(await requireUser(), userId);
    return "Removed";
  });
}
