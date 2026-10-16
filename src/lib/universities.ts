import "server-only";
import { one } from "./db";
import { isFinal } from "./rbac";
import type { User } from "./types";

/** Operators who may maintain any university (comma-separated emails). */
function platformAdmin(user: Pick<User, "email">) {
  const list = (process.env.PLATFORM_ADMIN_EMAILS ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  return list.includes(user.email.toLowerCase());
}

/**
 * A university's SOP, templates and rules apply to every society there, so
 * only the President/VP of the society that added it (or a platform admin)
 * may change them.
 */
export async function canManageUniversity(user: Pick<User, "email" | "role" | "society_id">, universityId: string) {
  if (platformAdmin(user)) return true;
  if (!user.society_id || !isFinal(user)) return false;
  return Boolean(await one("SELECT 1 FROM universities WHERE id = $1 AND created_by_society = $2", [universityId, user.society_id]));
}

/** Shared suppliers: the society that added one, or whoever manages the university. */
export async function canEditRegistryVendor(user: Pick<User, "email" | "role" | "society_id">, vendor: { university_id: string | null; added_by_society?: string | null }) {
  if (vendor.added_by_society && vendor.added_by_society === user.society_id) return true;
  return vendor.university_id ? canManageUniversity(user, vendor.university_id) : false;
}
