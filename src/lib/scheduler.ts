import "server-only";
import { esc } from "./html";
import { one, query, update } from "./db";
import { audit, notify } from "./audit";
import { addDays, appUrl, daysBetween, fmtDate, fmtRM, today } from "./appurl";
import { emailProvider, emailShell, sendEmail } from "./integrations/email";
import { speakerEmail } from "./actions";
import { forwardNote, vendorRecipient } from "./vendor-contact";
import { parseSignals } from "./planning";
import type { EventRow, Rsvp, Speaker, University, User, Vendor, Venue } from "./types";

const SYSTEM = { id: null, name: "Movents scheduler" } as const;

/** Send to every attendee — or, in test/redirect mode, one digest so test inboxes are not flooded. */
async function sendToAttendees(ev: EventRow, kind: string, subject: string, html: string) {
  const rsvps = await query<Rsvp>("SELECT * FROM rsvps WHERE event_id = $1 AND status = 'going'", [ev.id]);
  if (!rsvps.length) return { sent: 0, mode: "none" };
  const digest = Boolean(process.env.EMAIL_REDIRECT_TO) || emailProvider() === "outbox";
  if (digest) {
    const pres = await one<User>("SELECT u.* FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.society_id = $1 AND m.role = 'president' LIMIT 1", [ev.society_id]);
    if (!pres) return { sent: 0, mode: "none" };
    await sendEmail({ to: pres.email, subject: `[to ${rsvps.length} attendees] ${subject}`, html, kind, eventId: ev.id, sentBy: "scheduler" });
    return { sent: rsvps.length, mode: "digest" };
  }
  for (const r of rsvps) await sendEmail({ to: r.email, subject, html, kind, eventId: ev.id, relatedId: r.id, sentBy: "scheduler" });
  return { sent: rsvps.length, mode: "individual" };
}

/** Daily automations. `societyId` limits a manual run to one society; the cron runs them all. */
export async function runScheduler(opts: { todayOverride?: string; societyId?: string } = {}) {
  const now = (process.env.NODE_ENV !== "production" && opts.todayOverride) || today();
  const log: string[] = [];
  const events = opts.societyId
    ? await query<EventRow>("SELECT * FROM events WHERE status <> 'completed' AND society_id = $1", [opts.societyId])
    : await query<EventRow>("SELECT * FROM events WHERE status <> 'completed'");

  for (const ev of events) {
    const uni = await one<University & { society_name: string }>("SELECT u.*, s.name AS society_name FROM societies s JOIN universities u ON u.id = s.university_id WHERE s.id = $1", [ev.society_id]);
    const venue = ev.venue_id ? await one<Venue>("SELECT * FROM venues WHERE id = $1", [ev.venue_id]) : null;
    const lessons = uni ? await query<{ content: string }>("SELECT content FROM sop_documents WHERE university_id = $1 AND kind = 'lessons'", [uni.id]) : [];
    const followDays = Number(process.env.SPEAKER_FOLLOWUP_DAYS ?? lessons.map((l) => parseSignals(l.content).follow_up_days).find(Boolean) ?? 3);

    // 1. Speaker auto follow-up: contacted, no reply in N days.
    const speakers = await query<Speaker>("SELECT * FROM speakers WHERE event_id = $1 AND status = 'contacted' AND contacted_at IS NOT NULL", [ev.id]);
    for (const sp of speakers) {
      if (!sp.email) continue;
      const age = daysBetween(new Date(sp.contacted_at!).toISOString().slice(0, 10), now);
      if (age < followDays) continue;
      const sender = (await one<User>("SELECT * FROM society_members WHERE society_id = $1 AND role = 'director' AND department = 'Programmes'", [ev.society_id])) ?? ({ name: "The organising committee", role: "director" } as User);
      const { subject, html } = speakerEmail(sp, ev, venue, uni?.society_name ?? "", sender, true, uni?.name);
      const e = await sendEmail({ to: sp.email, subject, html, kind: "speaker_followup", eventId: ev.id, relatedId: sp.id, sentBy: "scheduler" });
      await update("speakers", sp.id, { status: "followed_up", followed_up_at: new Date() });
      await audit(SYSTEM, "speaker.followup_sent", { speaker: sp.name, days_without_reply: age, email_id: e.id, delivery: e.status }, { eventId: ev.id, approvedBy: "covered by original outreach approval" });
      log.push(`Follow-up → ${sp.name} (${age} days, ${ev.title})`);
    }

    // 2. Vendor reminders 7 days before the event.
    const daysToEvent = daysBetween(now, ev.date);
    if (daysToEvent >= 0 && daysToEvent <= 7) {
      const vendors = await query<Vendor>("SELECT * FROM vendors WHERE event_id = $1 AND selected = true AND reminded_at IS NULL", [ev.id]);
      for (const v of vendors) {
        const html = emailShell("Delivery reminder", `<p>Hello ${esc(v.name.split(" — ")[0])} team,</p><p>A reminder that <b>${esc(ev.title)}</b> is on <b>${fmtDate(ev.date)}</b> at ${esc(venue?.name ?? uni?.name ?? "the venue")}. Please confirm delivery time (by ${esc(ev.start_time)}) and final quantities.</p><p>Thank you!</p>`);
        const rcpt = await vendorRecipient(v, ev.society_id);
        const to = rcpt.to;
        const e = await sendEmail({ to, subject: `${rcpt.forward ? "[Forward to vendor] " : ""}Reminder: ${ev.title} on ${fmtDate(ev.date)}`, html: rcpt.forward ? forwardNote(v.name) + html : html, kind: "vendor_reminder", eventId: ev.id, relatedId: v.id, sentBy: "scheduler" });
        await update("vendors", v.id, { reminded_at: new Date() });
        await audit(SYSTEM, "vendor.reminder_sent", { vendor: v.name, days_to_event: daysToEvent, email_id: e.id }, { eventId: ev.id });
        log.push(`Vendor reminder → ${v.name}`);
      }
    }

    // 3. Attendee reminder cadence.
    const dueAll = await query<{ id: string; label: string }>("SELECT id, label FROM reminders WHERE event_id = $1 AND status = 'scheduled' AND scheduled_for <= $2 ORDER BY scheduled_for", [ev.id, now]);
    // Only the latest due reminder goes out; older missed ones are skipped rather than sent in a burst.
    for (const stale of dueAll.slice(0, -1)) await update("reminders", stale.id, { status: "skipped" });
    const due = dueAll.slice(-1);
    for (const r of due) {
      const html = emailShell(ev.title, `<p>${r.label === "Day of event" ? "See you today!" : `Reminder: ${esc(ev.title)} is coming up.`}</p><p><b>${fmtDate(ev.date)}</b>, ${esc(ev.start_time)} to ${esc(ev.end_time)} at ${esc(venue?.name ?? uni?.name ?? "the venue")}.</p><p><a href="${appUrl()}/e/${ev.id}">Event page & your ticket</a></p>`);
      const res = await sendToAttendees(ev, "attendee_reminder", `${r.label}: ${ev.title}`, html);
      await update("reminders", r.id, { status: res.sent ? "sent" : "skipped", sent_at: new Date() });
      await audit(SYSTEM, "attendee.reminder_sent", { label: r.label, recipients: res.sent, mode: res.mode }, { eventId: ev.id });
      log.push(`Reminder "${r.label}" → ${res.sent} attendees (${ev.title})`);
    }

    // 4. Spend alert at 90% of approved budget.
    const pct = uni?.sop.budget_rules.alert_pct ?? 90;
    const spent = Number((await one<{ s: number }>("SELECT coalesce(sum(actual),0)::float AS s FROM budget_lines WHERE event_id = $1", [ev.id]))?.s ?? 0);
    const approved = ev.approved_budget ?? 0;
    if (approved > 0 && spent >= approved * (pct / 100) && !ev.flags.some((f) => f.message.startsWith("Spend alert"))) {
      const msg = `Spend alert: ${fmtRM(spent)} is ${Math.round((spent / approved) * 100)}% of the approved ${fmtRM(approved)}.`;
      await update("events", ev.id, { flags: [...ev.flags, { level: "warn", message: msg }] });
      await notify({ role: "president", societyId: ev.society_id }, `Budget ${pct}% alert, ${ev.title}`, msg, `/events/${ev.id}`);
      await audit(SYSTEM, "budget.alert", { spent, approved, pct }, { eventId: ev.id });
      log.push(msg);
    }

    // 5. Feedback survey the day after.
    if (addDays(ev.date, 1) === now) {
      const html = emailShell("How was it?", `<p>Thanks for coming to <b>${esc(ev.title)}</b>! Two minutes of feedback helps us improve.</p><p><a href="${appUrl()}/f/${ev.id}">Take the survey</a></p>`);
      const res = await sendToAttendees(ev, "feedback_survey", `Feedback: ${ev.title}`, html);
      if (!res.sent) continue;
      await audit(SYSTEM, "feedback.survey_sent", { recipients: res.sent, mode: res.mode }, { eventId: ev.id });
      log.push(`Feedback survey → ${res.sent} attendees`);
    }
  }
  return { ran_at: new Date().toISOString(), today: now, actions: log };
}
