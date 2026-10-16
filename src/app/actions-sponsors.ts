"use server";

import { publicError } from "@/lib/errors";
import { revalidatePath } from "next/cache";
import { one } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { assertMember, assertMemberOf } from "@/lib/members";
import { audit } from "@/lib/audit";
import { findSponsors, recordSponsor, saveSponsors, sendSponsorOutreach, type SponsorInput } from "@/lib/sponsors";
import type { Sponsor } from "@/lib/types";

type Res = { ok: true; message?: string } | { ok: false; error: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const fail = (err: unknown): Res => ({ ok: false, error: publicError(err) });
const refresh = (eventId: string) => {
  revalidatePath(`/events/${eventId}/sponsors`);
  revalidatePath(`/events/${eventId}/inbox`);
};

async function load(sponsorId: string) {
  const user = await requireUser();
  await assertMemberOf(user, "sponsors", sponsorId);
  const sp = await one<Sponsor>("SELECT * FROM sponsors WHERE id = $1", [sponsorId]);
  if (!sp) throw new Error("Sponsor not found");
  return { user, sp };
}

export async function addSponsor(eventId: string, f: SponsorInput): Promise<Res> {
  try {
    const user = await requireUser();
    await assertMember(user, eventId);
    if (!f.company?.trim()) throw new Error("Company is required");
    if (f.contact_email?.trim() && !EMAIL_RE.test(f.contact_email.trim())) throw new Error("That is not an email address");
    const website = f.website?.trim();
    const [row] = await saveSponsors(eventId, [{ ...f, website: website && !/^https?:\/\//.test(website) ? `https://${website}` : website }], "manual");
    if (!row) throw new Error(`${f.company.trim()} is already on the list`);
    await audit(user, "sponsor.added", { company: row.company }, { eventId });
    refresh(eventId);
    return { ok: true, message: `${row.company} added` };
  } catch (err) {
    return fail(err);
  }
}

export async function findSponsorsAction(eventId: string): Promise<Res> {
  try {
    const user = await requireUser();
    await assertMember(user, eventId);
    const rows = await findSponsors(eventId);
    await audit(user, "sponsor.found", { companies: rows.map((r) => r.company) }, { eventId });
    refresh(eventId);
    return { ok: true, message: rows.length ? `${rows.length} sponsors added` : "No new matches" };
  } catch (err) {
    return fail(err);
  }
}

export async function sendSponsorEmail(sponsorId: string, draft: { to: string; subject: string; body: string }): Promise<Res> {
  try {
    const { user, sp } = await load(sponsorId);
    if (draft.to.trim() && !EMAIL_RE.test(draft.to.trim())) throw new Error("That is not an email address");
    if (!draft.subject.trim() || !draft.body.trim()) throw new Error("Subject and message are required");
    const r = await sendSponsorOutreach(user, sp, draft);
    refresh(sp.event_id);
    if (r.status === "failed") return { ok: false, error: r.error };
    return { ok: true, message: r.status === "blocked" ? "Sent for Director approval" : `Sent to ${sp.company}` };
  } catch (err) {
    return fail(err);
  }
}

export async function markSponsorReplied(sponsorId: string): Promise<Res> {
  try {
    const { user, sp } = await load(sponsorId);
    await recordSponsor(sp.id, { status: "replied" });
    await audit(user, "sponsor.replied", { company: sp.company }, { eventId: sp.event_id });
    refresh(sp.event_id);
    return { ok: true, message: `${sp.company} replied` };
  } catch (err) {
    return fail(err);
  }
}

export async function acceptSponsor(sponsorId: string, f: { offer_type: "cash" | "in_kind"; offer_amount: number | null; offer_note: string; notes?: string }): Promise<Res> {
  try {
    const { user, sp } = await load(sponsorId);
    const row = await recordSponsor(sp.id, { status: "accepted", offer_type: f.offer_type, offer_amount: f.offer_amount, offer_note: f.offer_note, notes: f.notes });
    await audit(user, "sponsor.accepted", { company: sp.company, offer_type: row.offer_type, offer_amount: row.offer_amount, offer_note: row.offer_note }, { eventId: sp.event_id });
    refresh(sp.event_id);
    return { ok: true, message: `${sp.company} is in` };
  } catch (err) {
    return fail(err);
  }
}

export async function declineSponsor(sponsorId: string): Promise<Res> {
  try {
    const { user, sp } = await load(sponsorId);
    await recordSponsor(sp.id, { status: "declined" });
    await audit(user, "sponsor.declined", { company: sp.company }, { eventId: sp.event_id });
    refresh(sp.event_id);
    return { ok: true, message: `${sp.company} declined` };
  } catch (err) {
    return fail(err);
  }
}
