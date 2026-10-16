import "server-only";
import { esc } from "./html";
import { one } from "./db";
import type { User, Vendor } from "./types";

/**
 * Where a vendor email should go. Supplier links are often review or price
 * pages, so we never guess an address from a URL: without a known contact
 * email the message goes to the Logistics Director to forward.
 */
export async function vendorRecipient(v: Pick<Vendor, "contact_email" | "name">, societyId: string | null) {
  if (v.contact_email) return { to: v.contact_email, forward: false };
  const dir =
    (await one<User>("SELECT * FROM society_members WHERE society_id = $1 AND role = 'director' AND department = 'Logistics'", [societyId])) ??
    (await one<User>("SELECT * FROM society_members WHERE society_id = $1 AND role = 'president'", [societyId]));
  if (!dir) throw new Error("No contact email for this supplier and no Logistics Director to forward to. Add the supplier's email first.");
  return { to: dir.email, forward: true };
}

export const forwardNote = (name: string) =>
  `<p style="background:#fff7c2;padding:8px 12px;border-radius:8px"><b>No contact email on file for ${esc(name)}.</b> Please forward this request to the vendor (via their website or WhatsApp) and add their email in the vendor registry.</p>`;
