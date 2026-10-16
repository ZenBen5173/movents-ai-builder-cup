import "server-only";
import { esc } from "./html";
import { audit, notify } from "./audit";
import { id, insert, one, query, update } from "./db";
import { ACTION_LABEL, canDecide, decide } from "./rbac";
import { appUrl, fmtDate, fmtRM, outputsUrl, signToken } from "./appurl";
import { emailShell, sendEmail } from "./integrations/email";
import { buildIcs, calendarMode, createGoogleEvent } from "./integrations/gcal";
import { lumaCreateEvent, meetupCreateEvent } from "./integrations/ticketing";
import { createCheckout, paymentsMode } from "./integrations/payments";
import type { ActionType, ApprovalRequest, EventRow, Speaker, Sponsor, Task, University, User, Vendor, Venue } from "./types";

export type GateResult =
  | { status: "executed"; result: Record<string, unknown>; reason: string }
  | { status: "blocked"; approval: ApprovalRequest; reason: string }
  | { status: "failed"; error: string };

type Payload = Record<string, unknown>;

/**
 * The single gate every outbound action passes through.
 * Allowed → runs now. Not allowed → approval request, approver notified, action blocked.
 * Both paths land in the audit log.
 */
export async function gate(
  user: User,
  action: ActionType,
  title: string,
  payload: Payload,
  opts: { eventId?: string | null; runId?: string | null; amount?: number } = {},
): Promise<GateResult> {
  const threshold = await budgetThreshold(opts.eventId ?? null);
  const d = decide(user, action, { amount: opts.amount, threshold });
  if (d.allowed) {
    try {
      const result = await execute(action, payload, user, null);
      await audit(user, action, { title, ...summarise(payload), result, permission: d.reason }, { eventId: opts.eventId });
      return { status: "executed", result, reason: d.reason };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      await audit(user, `${action}.failed`, { title, error }, { eventId: opts.eventId });
      return { status: "failed", error };
    }
  }
  const approval = await insert<ApprovalRequest>("approval_requests", {
    id: id("apr"),
    event_id: opts.eventId ?? null,
    society_id: user.society_id,
    action_type: action,
    title,
    payload,
    requested_by: user.id,
    approver_role: d.approver_role,
    approver_department: d.approver_department,
    status: "pending",
    run_id: opts.runId ?? null,
  });
  if (action === "email.speaker" && payload.speaker_id) {
    await update("speakers", String(payload.speaker_id), { status: "pending_approval" });
  }
  if (action === "payment.deposit" && payload.vendor_id) {
    await update("vendors", String(payload.vendor_id), { deposit_status: "pending_approval" });
  }
  await notify(
    { role: d.approver_role, societyId: user.society_id! },
    `Approval needed: ${ACTION_LABEL[action]}`,
    `${user.name} requested: ${title}${d.approver_department ? ` (${d.approver_department})` : ""}`,
    `/approvals#${approval.id}`,
  );
  await notifyApproverByEmail(d.approver_role, d.approver_department, approval, user);
  await audit(
    user,
    "approval.requested",
    { action, title, approver_role: d.approver_role, approver_department: d.approver_department, reason: d.reason, approval_id: approval.id },
    { eventId: opts.eventId },
  );
  return { status: "blocked", approval, reason: d.reason };
}

async function notifyApproverByEmail(role: string, dept: string | null, approval: ApprovalRequest, requester: User) {
  if (process.env.NOTIFY_APPROVERS_BY_EMAIL !== "1") return;
  const approvers = await query<User>(
    `SELECT u.* FROM memberships m JOIN users u ON u.id = m.user_id
     WHERE m.society_id = $1 AND m.role = $2 ${dept ? "AND m.department = $3" : ""}`,
    dept ? [requester.society_id, role, dept] : [requester.society_id, role],
  );
  for (const a of approvers) {
    await sendEmail({
      to: a.email,
      kind: "approval_ping",
      subject: `[Movents] Approval needed: ${approval.title}`,
      html: emailShell("Approval needed", `<p>${esc(requester.name)} needs your approval for <b>${esc(approval.title)}</b>.</p><p><a href="${appUrl()}/approvals">Open approval queue</a></p>`),
      eventId: approval.event_id,
      relatedId: approval.id,
      sentBy: "system",
    });
  }
}

export async function budgetThreshold(eventId: string | null) {
  if (!eventId) return 1000;
  const row = await one<{ sop: University["sop"] }>(
    `SELECT u.sop FROM events e JOIN societies s ON s.id = e.society_id JOIN universities u ON u.id = s.university_id WHERE e.id = $1`,
    [eventId],
  );
  return row?.sop?.budget_rules?.president_threshold ?? 1000;
}

function summarise(p: Payload) {
  const out: Payload = {};
  for (const [k, v] of Object.entries(p)) {
    if (k === "html") continue;
    out[k] = v;
  }
  return out;
}

export async function decideApproval(user: User, approvalId: string, decision: "approve" | "reject", note?: string) {
  const req = await one<ApprovalRequest>("SELECT * FROM approval_requests WHERE id = $1 AND society_id = $2", [approvalId, user.society_id]);
  if (!req) throw new Error("Approval request not found");
  if (req.status !== "pending") throw new Error(`Request is already ${req.status}`);
  if (!canDecide(user, req)) throw new Error(`Only a ${req.approver_role}${req.approver_department ? ` (${req.approver_department})` : ""} can decide this`);
  const requester = req.requested_by ? await one<User>("SELECT * FROM users WHERE id = $1", [req.requested_by]) : null;

  // Claim the request atomically: two approvers (or a double click) can't both run it.
  const claimed = await one(
    "UPDATE approval_requests SET status = $2, decided_by = $3, decided_at = now(), decision_note = $4 WHERE id = $1 AND status = 'pending' RETURNING id",
    [req.id, decision === "reject" ? "rejected" : "approved", user.id, note ?? null],
  );
  if (!claimed) throw new Error("This request was just decided by someone else");

  if (decision === "reject") {
    if (req.action_type === "email.speaker" && req.payload.speaker_id) await update("speakers", String(req.payload.speaker_id), { status: "found" });
    if (req.action_type === "payment.deposit" && req.payload.vendor_id) await update("vendors", String(req.payload.vendor_id), { deposit_status: "none" });
    if (req.action_type === "publish.social") for (const cid of (req.payload.creative_ids as string[]) ?? []) await update("creatives", cid, { status: "draft" });
    await audit(user, "approval.rejected", { action: req.action_type, title: req.title, note, approval_id: req.id }, { eventId: req.event_id, approvedBy: null });
    if (requester) await notify({ userId: requester.id }, "Request rejected", `${user.name} rejected: ${req.title}`, "/approvals");
    return { status: "rejected" as const };
  }

  await audit(user, "approval.approved", { action: req.action_type, title: req.title, approval_id: req.id, requested_by: requester?.name }, { eventId: req.event_id, approvedBy: user.name });
  try {
    const result = await execute(req.action_type, req.payload, requester ?? user, user, req);
    const status = req.action_type === "email.faculty" ? "awaiting_faculty" : "executed";
    await update("approval_requests", req.id, { status, result });
    await audit(requester ?? user, req.action_type, { title: req.title, ...summarise(req.payload), result }, { eventId: req.event_id, approvedBy: user.name });
    if (requester) await notify({ userId: requester.id }, "Approved & executed", `${user.name} approved: ${req.title}`, "/approvals");
    return { status, result };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    await update("approval_requests", req.id, { status: "failed", result: { error } });
    await audit(user, `${req.action_type}.failed`, { title: req.title, error }, { eventId: req.event_id });
    return { status: "failed" as const, error };
  }
}

/** Faculty advisor approves/rejects the submitted proposal from the emailed link. */
export async function facultyDecision(approvalId: string, decision: "approve" | "reject", note?: string) {
  const req = await one<ApprovalRequest>("SELECT * FROM approval_requests WHERE id = $1", [approvalId]);
  if (!req || req.action_type !== "email.faculty") throw new Error("Not a faculty submission");
  if (req.status !== "awaiting_faculty") throw new Error(`Submission is ${req.status}`);
  const society = req.event_id ? (await one<{ society_id: string }>("SELECT society_id FROM events WHERE id = $1", [req.event_id]))?.society_id ?? null : null;
  const faculty = society
    ? await one<User>("SELECT u.* FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.society_id = $1 AND m.role = 'faculty_advisor' LIMIT 1", [society])
    : null;
  const actor = faculty ?? { id: null, name: "Faculty advisor" };
  const approved = decision === "approve";
  const claimed = await one(
    "UPDATE approval_requests SET status = $2, result = $3 WHERE id = $1 AND status = 'awaiting_faculty' RETURNING id",
    [req.id, approved ? "executed" : "rejected", JSON.stringify({ ...(req.result ?? {}), faculty_decision: decision, faculty_note: note ?? null, faculty_decided_at: new Date().toISOString() })],
  );
  if (!claimed) throw new Error("This submission was already decided");
  if (req.event_id) {
    await update("events", req.event_id, { status: approved ? "approved" : "draft" });
    if (approved) {
      const ev = await one<EventRow>("SELECT * FROM events WHERE id = $1", [req.event_id]);
      if (ev && ev.approved_budget == null) await update("events", ev.id, { approved_budget: ev.budget_cap });
    }
  }
  await audit(actor as User, approved ? "faculty.approved" : "faculty.rejected", { title: req.title, note }, { eventId: req.event_id, approvedBy: actor.name });
  if (society) await notify({ role: "president", societyId: society }, `Faculty ${approved ? "approved" : "rejected"} the proposal`, req.title, req.event_id ? `/events/${req.event_id}` : "/approvals");
  return { status: approved ? "approved" : "rejected" };
}

// ------------------------------------------------------------------ executors

async function execute(action: ActionType, p: Payload, actor: User, approver: User | null, req?: ApprovalRequest): Promise<Record<string, unknown>> {
  switch (action) {
    case "email.speaker": {
      const sp = await one<Speaker>("SELECT * FROM speakers WHERE id = $1", [p.speaker_id]);
      if (!sp) throw new Error("Speaker not found");
      const email = await sendEmail({
        to: String(p.to ?? sp.email ?? "speaker-unknown@movents.test"),
        subject: String(p.subject),
        html: String(p.html),
        kind: p.follow_up ? "speaker_followup" : "speaker_outreach",
        eventId: sp.event_id,
        relatedId: sp.id,
        sentBy: actor.id,
      });
      if (email.status === "failed") throw new Error(email.error ?? "Email failed");
      await update("speakers", sp.id, p.follow_up ? { status: "followed_up", followed_up_at: new Date() } : { status: "contacted", contacted_at: new Date() });
      return { email_id: email.id, to: email.to_addr, intended_to: email.intended_to, provider: email.provider, delivery: email.status };
    }
    case "email.sponsor": {
      const sp = await one<Sponsor>("SELECT * FROM sponsors WHERE id = $1", [p.sponsor_id]);
      if (!sp) throw new Error("Sponsor not found");
      // The proposal travels as a link (the sender has no attachment support); the pixel marks the email opened.
      const pixel = `<img src="${appUrl()}/api/track/sponsor/${sp.id}?t=${signToken(`track:${sp.id}`, 365)}" width="1" height="1" alt="" style="display:block;border:0;width:1px;height:1px" />`;
      const email = await sendEmail({
        to: String(p.to ?? sp.contact_email ?? `partnerships@${sp.company.toLowerCase().replace(/[^a-z0-9]+/g, "")}.example`),
        subject: String(p.subject),
        html: `${String(p.html)}${pixel}`,
        kind: "sponsor_outreach",
        eventId: sp.event_id,
        relatedId: sp.id,
        sentBy: actor.id,
      });
      if (email.status === "failed") throw new Error(email.error ?? "Email failed");
      await update("sponsors", sp.id, sp.status === "found" ? { status: "contacted", contacted_at: new Date() } : { contacted_at: sp.contacted_at ?? new Date() });
      return { email_id: email.id, to: email.to_addr, intended_to: email.intended_to, provider: email.provider, delivery: email.status, proposal: outputsUrl(sp.event_id, "proposal.pdf") };
    }
    case "email.vendor": {
      const email = await sendEmail({
        to: String(p.to),
        subject: String(p.subject),
        html: String(p.html),
        kind: String(p.kind ?? "vendor"),
        eventId: (p.event_id as string) ?? null,
        relatedId: (p.vendor_id as string) ?? null,
        sentBy: actor.id,
      });
      if (email.status === "failed") throw new Error(email.error ?? "Email failed");
      if (p.vendor_id && p.kind !== "vendor_reminder") await update("vendors", String(p.vendor_id), { contract_status: "sent" });
      return { email_id: email.id, to: email.to_addr, provider: email.provider, delivery: email.status };
    }
    case "email.faculty": {
      const ev = await one<EventRow>("SELECT * FROM events WHERE id = $1", [p.event_id]);
      if (!ev) throw new Error("Event not found");
      const faculty = await one<User>(
        "SELECT u.* FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.society_id = $1 AND m.role = 'faculty_advisor' LIMIT 1",
        [ev.society_id],
      );
      const to = String(p.to ?? faculty?.email ?? "").trim();
      if (!to) throw new Error("This society has no faculty advisor yet. Invite one in Settings → Members, then submit again.");
      const reqId = req?.id ?? "direct";
      const link = `${appUrl()}/faculty/${reqId}?t=${signToken(`faculty:${reqId}`, 60)}`;
      const html = `${String(p.html)}<p style="margin-top:20px">
<a href="${link}&d=approve" style="background:#46a758;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;margin-right:8px">Approve proposal</a>
<a href="${link}&d=reject" style="background:#e5484d;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">Reject</a></p>
<p style="font-size:13px">Review the full proposal: <a href="${outputsUrl(ev.id, "proposal.pdf")}">PDF</a> · <a href="${outputsUrl(ev.id, "proposal.docx")}">Word</a> · <a href="${outputsUrl(ev.id, "budget.xlsx")}">Budget sheet</a></p>`;
      const email = await sendEmail({
        to,
        subject: String(p.subject),
        html: emailShell("Event proposal for your approval", html),
        kind: "faculty_submission",
        eventId: ev.id,
        relatedId: reqId,
        sentBy: actor.id,
      });
      if (email.status === "failed") throw new Error(email.error ?? "Email failed");
      await update("events", ev.id, { status: "pending_approval" });
      return { email_id: email.id, to: email.to_addr, provider: email.provider, delivery: email.status };
    }
    case "publish.luma":
    case "publish.meetup": {
      const ev = await one<EventRow & { venue_name: string | null; venue_capacity: number | null; university: string }>(
        `SELECT e.*, v.name AS venue_name, v.capacity AS venue_capacity, u.name AS university FROM events e
         JOIN societies s ON s.id = e.society_id JOIN universities u ON u.id = s.university_id
         LEFT JOIN venues v ON v.id = e.venue_id WHERE e.id = $1`,
        [p.event_id],
      );
      if (!ev) throw new Error("Event not found");
      const input = {
        id: ev.id,
        title: ev.title,
        description: `${ev.topic ?? ev.title}, organised by the society. Free entry, registration required.`,
        date: ev.date,
        startTime: ev.start_time,
        endTime: ev.end_time,
        venue: `${ev.venue_name ?? "TBC"}, ${ev.university}`,
        capacity: ev.venue_capacity ?? ev.pax,
      };
      const res = action === "publish.luma" ? await lumaCreateEvent(input) : await meetupCreateEvent(input);
      const field = action === "publish.luma" ? "luma" : "meetup";
      await update("events", ev.id, { [field]: { id: res.id, url: res.url, mode: res.mode, published_at: new Date().toISOString() } });
      if (ev.status === "approved") await update("events", ev.id, { status: "live" });
      return { ...res };
    }
    case "budget.approve": {
      const amount = Number(p.amount);
      await update("events", String(p.event_id), { approved_budget: amount });
      return { approved_budget: amount, approved_by: approver?.name ?? actor.name };
    }
    case "speaker.confirm": {
      await update("speakers", String(p.speaker_id), { status: "confirmed", replied_at: new Date() });
      return { speaker_id: p.speaker_id, status: "confirmed" };
    }
    case "payment.deposit": {
      const vendor = await one<Vendor>("SELECT * FROM vendors WHERE id = $1", [p.vendor_id]);
      if (!vendor) throw new Error("Vendor not found");
      const pid = id("pay");
      const amount = Number(p.amount);
      const checkout = await createCheckout({ paymentId: pid, amount, description: `Deposit, ${vendor.name}` });
      await insert("payments", {
        id: pid,
        event_id: (p.event_id as string) ?? null,
        vendor_id: vendor.id,
        amount,
        provider: paymentsMode(),
        status: "pending",
        checkout_url: checkout.url,
        provider_ref: checkout.ref,
        created_by: actor.id,
      });
      await update("vendors", vendor.id, { deposit_amount: amount, deposit_status: "pending" });
      return { payment_id: pid, checkout_url: checkout.url, provider: paymentsMode() };
    }
    case "calendar.push":
      return pushCalendar(String(p.event_id));
    case "publish.social": {
      const ids = (p.creative_ids as string[]) ?? [];
      for (const cid of ids) await update("creatives", cid, { status: "approved", updated_at: new Date() });
      return { approved_creatives: ids.length, note: "Approved for posting, the poster also satisfies the SOP publicity-approval step." };
    }
  }
}

export async function pushCalendar(eventId: string) {
  const ev = await one<EventRow>("SELECT * FROM events WHERE id = $1", [eventId]);
  if (!ev) throw new Error("Event not found");
  const tasks = await query<Task>("SELECT * FROM tasks WHERE event_id = $1 ORDER BY due_date, sort", [eventId]);
  const mode = calendarMode();
  await query("DELETE FROM calendar_events WHERE event_id = $1 AND provider = 'ics'", [eventId]);
  const milestones = tasks.filter((t) => t.sop_ref || t.phase === "execution" || t.phase === "post").slice(0, 25);
  const items = [
    { uid: `${ev.id}-day`, title: `🎤 ${ev.title}`, date: ev.date, startTime: ev.start_time, endTime: ev.end_time, description: "Event day", task_id: null as string | null },
    ...milestones.map((t) => ({ uid: t.id, title: `[${ev.title}] ${t.title}`, date: t.due_date, description: t.sop_ref ? `SOP deadline: ${t.sop_ref}` : `Phase: ${t.phase}`, task_id: t.id as string | null, startTime: undefined, endTime: undefined })),
  ];
  let created = 0;
  const links: string[] = [];
  for (const it of items) {
    if (mode === "google") {
      const g = await createGoogleEvent({ title: it.title, date: it.date, description: it.description, startTime: it.startTime, endTime: it.endTime });
      links.push(g.htmlLink);
      await insert("calendar_events", { id: id("cal"), event_id: ev.id, task_id: it.task_id, title: it.title, date: it.date, provider: "google", external_id: g.id, html_link: g.htmlLink });
    } else {
      await insert("calendar_events", { id: id("cal"), event_id: ev.id, task_id: it.task_id, title: it.title, date: it.date, provider: "ics" });
    }
    created++;
  }
  const feed = outputsUrl(ev.id, "timeline.ics", 365);
  return {
    provider: mode,
    created,
    feed_url: feed,
    google_subscribe_url: `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(feed.replace(/^https?:/, "webcal:"))}`,
    sample_links: links.slice(0, 3),
  };
}

export async function icsForEvent(eventId: string) {
  const ev = await one<EventRow>("SELECT * FROM events WHERE id = $1", [eventId]);
  if (!ev) return null;
  const tasks = await query<Task>("SELECT * FROM tasks WHERE event_id = $1 ORDER BY due_date, sort", [eventId]);
  return buildIcs(`${ev.title}, timeline`, [
    { uid: `${ev.id}-day`, title: `${ev.title}`, date: ev.date, startTime: ev.start_time, endTime: ev.end_time, description: "Event day" },
    ...tasks.map((t) => ({ uid: t.id, title: `[${t.phase}] ${t.title}`, date: t.due_date, description: t.sop_ref ? `SOP deadline: ${t.sop_ref}` : undefined })),
  ]);
}

export function speakerEmail(sp: Pick<Speaker, "name">, ev: Pick<EventRow, "title" | "date" | "start_time" | "end_time" | "topic" | "pax">, venue: Pick<Venue, "name"> | null, societyName: string, sender: Pick<User, "name" | "role">, followUp = false, universityName = "") {
  const first = esc(sp.name.replace(/^(dr\.?|prof\.?|mr\.?|ms\.?)\s+/i, "").split(" ")[0]);
  const society = esc(societyName);
  const at = universityName ? ` at ${esc(universityName)}` : "";
  ev = { ...ev, title: esc(ev.title), topic: ev.topic ? esc(ev.topic) : ev.topic };
  venue = venue ? { name: esc(venue.name) } : null;
  sender = { ...sender, name: esc(sender.name) };
  const subject = followUp ? `Following up: speaking invitation, ${ev.title}` : `Speaking invitation, ${ev.title} (${fmtDate(ev.date)})`;
  const body = followUp
    ? `<p>Hi ${first},</p><p>Just following up on our invitation to speak at <b>${ev.title}</b> on ${fmtDate(ev.date)}. We would love to have you, even a 30-minute talk or a panel slot would mean a lot to our members.</p><p>Could you let us know by the end of the week? Happy to work around your schedule.</p><p>Warm regards,<br>${sender.name}<br>${society}</p>`
    : `<p>Hi ${first},</p><p>I'm writing from the <b>${society}</b>${at}. We're organising <b>${ev.title}</b> on <b>${fmtDate(ev.date)}</b>, ${ev.start_time} to ${ev.end_time}${venue ? ` at ${venue.name}` : ""}, for around ${ev.pax} students.</p><p>Given your work on ${ev.topic ?? "this topic"}, we'd be honoured to invite you to give a 30 to 40 minute talk followed by Q&amp;A. We will cover parking and provide a token of appreciation.</p><p>Would you be available? If so, we'll send the details and the university's external speaker declaration form.</p><p>Warm regards,<br>${sender.name}<br>${society}</p>`;
  return { subject, html: emailShell(followUp ? "Following up" : "Speaking invitation", body) };
}

export { fmtRM };
