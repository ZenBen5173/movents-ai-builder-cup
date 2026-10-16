import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { currentUser, type WorkspaceUser } from "./session";
import { isMember } from "./members";

/** Signed-in user with a workspace, for pages. Redirects instead of throwing. */
export const pageUser = cache(async (): Promise<WorkspaceUser> => {
  const u = await currentUser();
  if (!u) redirect("/login");
  if (!u.society_id) redirect("/onboarding");
  return u as WorkspaceUser;
});

/** Pages under /events/[id] call this themselves; layouts alone are not an access check. */
export const canViewEvent = cache(async (eventId: string) => {
  const u = await pageUser();
  return (await isMember(u, eventId)) ? u : null;
});
