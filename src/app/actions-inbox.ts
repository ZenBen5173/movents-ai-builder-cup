"use server";

import { publicError } from "@/lib/errors";
import { revalidatePath } from "next/cache";
import { query } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { assertMember } from "@/lib/members";
import { audit } from "@/lib/audit";
import { setMailbox } from "@/lib/mailbox";

type Res = { ok: true; message?: string } | { ok: false; error: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Tag an email account to an event, so its inbox shows that address. */
export async function setEventMailbox(eventId: string, address: string, label?: string): Promise<Res> {
  try {
    const user = await requireUser();
    await assertMember(user, eventId);
    const addr = address.trim().toLowerCase();
    if (!EMAIL_RE.test(addr)) throw new Error("That is not an email address");
    const ev = await query<{ id: string }>("SELECT id FROM events WHERE id = $1", [eventId]);
    if (!ev.length) throw new Error("Event not found");
    await setMailbox(eventId, addr, label?.trim() || null);
    await audit(user, "mailbox.set", { address: addr }, { eventId });
    revalidatePath(`/events/${eventId}/inbox`);
    return { ok: true, message: "Mailbox saved" };
  } catch (err) {
    return { ok: false, error: publicError(err) };
  }
}
