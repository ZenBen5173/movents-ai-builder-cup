import "server-only";
import { cache } from "react";
import { one, query } from "../db";
import { fmtDate, fmtRM } from "../appurl";
import { feedbackThemes, nps } from "../planning";
import { ROLE_LABEL } from "../types";
import type { BudgetLine, EventRow, Feedback, Risk, Rsvp, Speaker, Task, University, User, Vendor, Venue } from "../types";
import type { Block, DocModel } from "./render";
import { templateOf, type SopTemplate } from "../templates";

export type Bundle = Awaited<ReturnType<typeof loadBundle>>;

/** Everything about one event, for pages and documents. Memoised per request. */
export const loadBundle = cache(async (eventId: string) => {
  const row = await one<{ event: EventRow; society: { id: string; name: string; university_id: string }; university: University }>(
    `SELECT to_jsonb(e) AS event, jsonb_build_object('id', s.id, 'name', s.name, 'university_id', s.university_id) AS society, to_jsonb(u) AS university
     FROM events e JOIN societies s ON s.id = e.society_id JOIN universities u ON u.id = s.university_id WHERE e.id = $1`,
    [eventId],
  );
  if (!row) return null;
  const { event, society, university } = row;
  const [venue, tasks, speakers, vendors, lines, risks, users, runsheet, promo, rsvps, feedback, volunteers] = await Promise.all([
    event.venue_id ? one<Venue>("SELECT * FROM venues WHERE id = $1", [event.venue_id]) : Promise.resolve(null),
    query<Task>("SELECT * FROM tasks WHERE event_id = $1 ORDER BY due_date, sort", [eventId]),
    query<Speaker>("SELECT * FROM speakers WHERE event_id = $1 ORDER BY name", [eventId]),
    query<Vendor>("SELECT * FROM vendors WHERE event_id = $1 ORDER BY category, unit_price", [eventId]),
    query<BudgetLine>("SELECT * FROM budget_lines WHERE event_id = $1 ORDER BY sort", [eventId]),
    query<Risk>("SELECT * FROM risks WHERE event_id = $1 ORDER BY likelihood * impact DESC", [eventId]),
    query<User>("SELECT * FROM society_members WHERE society_id = $1", [event.society_id]),
    query<{ start_time: string; end_time: string; activity: string; owner: string; location: string; notes: string }>("SELECT * FROM runsheet_items WHERE event_id = $1 ORDER BY start_time", [eventId]),
    query<{ channel: string; title: string; due_date: string; status: string }>("SELECT * FROM promo_items WHERE event_id = $1 ORDER BY due_date", [eventId]),
    query<Rsvp>("SELECT * FROM rsvps WHERE event_id = $1", [eventId]),
    query<Feedback>("SELECT * FROM feedback WHERE event_id = $1", [eventId]),
    query<{ name: string; role: string; phone: string; shift: string; emergency: boolean }>("SELECT * FROM volunteers WHERE event_id = $1 ORDER BY emergency DESC, name", [eventId]),
  ]);
  return { event, society, university, venue, tasks, speakers, vendors, lines, risks, users, runsheet, promo, rsvps, feedback, volunteers };
});

export function budgetTotals(lines: BudgetLine[], contingencyPct: number) {
  const subtotal = round(lines.reduce((s, l) => s + l.estimated, 0));
  const contingency = round(subtotal * (contingencyPct / 100));
  const actual = round(lines.reduce((s, l) => s + (l.actual ?? 0), 0));
  return { subtotal, contingency, total: round(subtotal + contingency), actual, hasActuals: lines.some((l) => l.actual != null) };
}
const round = (n: number) => Math.round(n * 100) / 100;

function owner(users: User[], role: string) {
  const u = users.find((x) => x.role === role);
  return u ? `${u.name} (${ROLE_LABEL[u.role]})` : ROLE_LABEL[role as User["role"]] ?? role;
}

// ------------------------------------------------------------------ proposal

export function proposalSections(b: NonNullable<Bundle>): DocModel["sections"] {
  const { event, venue, university, speakers, lines, risks, users, runsheet, promo, tasks, society } = b;
  const sop = university!.sop;
  const t = budgetTotals(lines, sop.budget_rules.contingency_pct);
  const pres = users.find((u) => u.role === "president");
  const adv = users.find((u) => u.role === "faculty_advisor");

  const builders: Record<string, () => Block[]> = {
    overview: () => [
      { type: "kv", rows: [["Event", event.title], ["Organiser", society?.name ?? ""], ["Date", fmtDate(event.date)], ["Time", `${event.start_time} to ${event.end_time}`], ["Venue", venue ? `${venue.name} (${venue.location ?? ""}), capacity ${venue.capacity}` : "TBC"], ["Format", event.setup_style ? `${event.setup_style} seating` : "Talk"]] },
      { type: "p", text: `${society?.name ?? "The society"} proposes to organise ${event.title}, ${/^[aeiou]/i.test(event.topic ?? "") ? "an" : "a"} ${event.topic ?? ""} session for ${event.pax} students on ${fmtDate(event.date)}.` },
    ],
    objectives: () => [
      { type: "bullets", items: [`Introduce students to current developments in ${event.topic ?? "the field"} from practitioners.`, "Connect students with industry and research speakers for mentorship and internships.", "Build practical understanding through live demos and open Q&A.", "Grow society membership and cross-faculty participation."] },
      { type: "p", text: "Learning outcomes: participants can explain key concepts, identify career pathways, and apply at least one tool or method shown in the session." },
    ],
    target_audience: () => [
      { type: "p", text: `Target: ${event.pax} undergraduate and postgraduate students across faculties. Registration via Luma/Meetup with waitlist once capacity is reached; dietary and accessibility needs collected at sign-up.` },
    ],
    programme: () =>
      runsheet.length
        ? [{ type: "table", head: ["Time", "Activity", "Owner"], rows: collapseRunsheet(runsheet).map((r) => [`${r.start_time} to ${r.end_time}`, r.activity, r.owner]), widths: [1, 3, 1] }]
        : [{ type: "p", text: "Programme to be finalised." }],
    speakers: () =>
      speakers.length
        ? [
            { type: "table", head: ["Name", "Background", "Status", "Source"], rows: speakers.map((s) => [s.name, s.headline ?? "", s.status, s.source_url ?? ""]), widths: [1.2, 2, 0.8, 1.6] },
            { type: "p", text: `External speakers will be declared to Student LIFE (SLE) at least ${sop.lead_times.find((l) => l.key === "speaker_declaration")?.weeks_before ?? 3} weeks before the event.`, muted: true },
          ]
        : [{ type: "p", text: "Speakers to be confirmed." }],
    organising_committee: () => [{ type: "table", head: ["Name", "Role", "Department"], rows: users.filter((u) => u.role !== "faculty_advisor").map((u) => [u.name, ROLE_LABEL[u.role], u.department ?? ""]) }],
    budget: () => [
      { type: "table", head: ["Category", "Item", "Qty", "Unit (RM)", "Estimate (RM)", "Funding"], widths: [1, 2.6, 0.5, 0.8, 0.9, 1], totalRow: true, rows: [...lines.map((l) => [l.category, l.description, l.qty, l.unit_cost, l.estimated, l.funding_source]), ["", `Subtotal + ${sop.budget_rules.contingency_pct}% contingency (${fmtRM(t.contingency)})`, "", "", t.total, ""]] },
      { type: "p", text: `Total ${fmtRM(t.total)} against a cap of ${fmtRM(event.budget_cap)}, ${t.total <= event.budget_cap ? "within budget" : "OVER budget"}. Supplier quotes and links are in the attached budget sheet.` },
    ],
    risk: () => [
      { type: "table", head: ["Risk", "L", "I", "Score", "Mitigation"], widths: [2, 0.3, 0.3, 0.5, 3], rows: risks.map((r) => [`${r.category}: ${r.description}`, r.likelihood, r.impact, r.likelihood * r.impact, r.mitigation]) },
      { type: "p", text: `Emergency: campus security first, then 999. Event lead on the day: ${pres?.name ?? "President"} (${pres?.phone ?? ""}).` },
    ],
    promotion: () =>
      promo.length ? [{ type: "table", head: ["Channel", "Action", "Due"], rows: promo.map((p) => [p.channel, p.title, fmtDate(p.due_date)]) }] : [{ type: "p", text: "Publicity plan to be finalised." }],
    timeline: () => [{ type: "table", head: ["Due", "Phase", "Milestone"], widths: [0.8, 0.8, 3], rows: tasks.filter((x) => x.sop_ref || x.phase !== "concept").slice(0, 22).map((x) => [fmtDate(x.due_date), x.phase, x.title]) }],
    endorsement: () => [
      { type: "table", head: ["Role", "Name", "Signature / Date"], rows: [["Prepared by (Committee)", users.find((u) => u.role === "committee")?.name ?? "", ""], ["President", pres?.name ?? "", ""], ["Faculty advisor", adv?.name ?? "", ""], ["Student LIFE (SLE)", "", ""]] },
    ],
  };

  return sop.required_sections.map((s) => ({
    key: s.key,
    title: s.title,
    blocks: builders[s.key]?.() ?? [{ type: "p", text: `[Needs input] ${s.hint}. This section is required by the ${university!.short_name} SOP but has no automatic generator yet.` }],
  }));
}

function collapseRunsheet(rows: { start_time: string; end_time: string; activity: string; owner: string }[]) {
  const out: { start_time: string; end_time: string; activity: string; owner: string }[] = [];
  for (const r of rows) {
    const base = r.activity.replace(/ \(cont\.\)$/, "");
    const last = out[out.length - 1];
    if (last && last.activity === base) last.end_time = r.end_time;
    else out.push({ ...r, activity: base });
  }
  return out;
}

export function proposalDoc(b: NonNullable<Bundle>): DocModel {
  return {
    title: `Event Proposal, ${b.event.title}`,
    subtitle: `${b.society?.name ?? ""} · ${b.university?.name ?? ""} · prepared in the ${b.university?.short_name} SOP format (v${b.university?.sop.version})`,
    sections: proposalSections(b),
    footer: `Generated by Movents on ${new Date().toISOString().slice(0, 10)}. Status: ${b.event.status}.`,
  };
}

export function validateProposal(b: NonNullable<Bundle>) {
  const sections = proposalSections(b);
  return b.university!.sop.required_sections.map((req) => {
    const s = sections.find((x) => x.key === req.key);
    const filled = Boolean(s && s.blocks.length && !s.blocks.some((bl) => bl.type === "p" && /^\[Needs input\]|to be (confirmed|finalised)/i.test(bl.text)));
    return { check: `Section: ${req.title}`, passed: filled, detail: filled ? "present" : s ? "present but needs human input" : "missing" };
  });
}

// ------------------------------------------------------------------ risk register

export function riskDoc(b: NonNullable<Bundle>): DocModel {
  return {
    title: `Risk Register, ${b.event.title}`,
    subtitle: `${fmtDate(b.event.date)} · ${b.venue?.name ?? "Venue TBC"} · score = likelihood × impact (1 to 5 each)`,
    sections: [
      { title: "Risk register", blocks: [{ type: "table", head: ["#", "Category", "Risk", "L", "I", "Score", "Mitigation", "Contingency", "Owner"], widths: [0.3, 0.8, 1.6, 0.3, 0.3, 0.45, 2, 1.7, 1], rows: b.risks.map((r, i) => [i + 1, r.category, r.description, r.likelihood, r.impact, r.likelihood * r.impact, r.mitigation, r.contingency ?? "", b.users.find((u) => u.id === r.owner_id)?.name ?? ""]) }] },
      { title: "Weather & contingency plan", blocks: b.risks.filter((r) => r.category === "Weather").map((r) => ({ type: "p" as const, text: `${r.description} Mitigation: ${r.mitigation} Contingency: ${r.contingency}` })) },
      { title: "Emergency contacts", blocks: [{ type: "table", head: ["Name", "Role", "Phone"], rows: [...b.volunteers.filter((v) => v.emergency).map((v) => [v.name, v.role, v.phone ?? ""]), ["Malaysia emergency services", "Police / ambulance / fire", "999"]] }] },
    ],
  };
}

// ------------------------------------------------------------------ run sheet

export function runsheetDoc(b: NonNullable<Bundle>): DocModel {
  return {
    title: `Run Sheet, ${b.event.title}`,
    subtitle: `${fmtDate(b.event.date)} · ${b.venue?.name ?? ""} · 15-minute blocks`,
    sections: [
      { title: "Run sheet", blocks: [{ type: "table", head: ["Start", "End", "Activity", "Owner", "Notes"], widths: [0.5, 0.5, 2.5, 0.9, 1.6], rows: b.runsheet.map((r) => [r.start_time, r.end_time, r.activity, r.owner, r.notes ?? ""]) }] },
      { title: "Volunteer roster", blocks: [{ type: "table", head: ["Name", "Role", "Shift", "Phone", "Emergency contact"], rows: b.volunteers.map((v) => [v.name, v.role, v.shift ?? "", v.phone ?? "", v.emergency ? "Yes" : ""]) }] },
    ],
  };
}

// ------------------------------------------------------------------ post-event report

export function reportData(b: NonNullable<Bundle>) {
  const registered = b.rsvps.filter((r) => r.status !== "cancelled").length;
  const attended = b.rsvps.filter((r) => r.checked_in).length;
  const t = budgetTotals(b.lines, b.university?.sop.budget_rules.contingency_pct ?? 10);
  const spent = t.hasActuals ? t.actual : t.subtotal;
  const n = nps(b.feedback.map((f) => f.nps));
  const avgRating = b.feedback.length ? Math.round((b.feedback.reduce((s, f) => s + f.rating, 0) / b.feedback.length) * 10) / 10 : 0;
  const themes = feedbackThemes(b.feedback);
  const showRate = registered ? attended / registered : 0;
  const lessons: string[] = [];
  lessons.push(`Show rate was ${Math.round(showRate * 100)}% (${attended}/${registered}). Size food at ~${Math.round(showRate * 100)}% of registrations plus a 5% buffer next time.`);
  const foodLine = b.lines.find((l) => l.category.toLowerCase().startsWith("food"));
  if (foodLine && foodLine.qty > attended * 1.1) lessons.push(`Catering was for ${foodLine.qty} pax but ${attended} attended, about ${Math.round(foodLine.qty - attended)} meals over.`);
  if (t.hasActuals && t.actual > t.subtotal) lessons.push(`Spend exceeded estimate by ${fmtRM(round(t.actual - t.subtotal))}, review vendor quotes earlier.`);
  for (const imp of themes.improvements.slice(0, 3)) lessons.push(`Feedback: "${imp.theme}" raised by ${imp.count} respondents, address in next event plan.`);
  const contacted = b.speakers.filter((s) => s.followed_up_at).length;
  if (contacted) lessons.push(`${contacted} speaker(s) needed a follow-up before replying, keep the automatic follow-up.`);
  return {
    registered,
    attended,
    showRate,
    estimated: t.subtotal,
    actual: spent,
    hasActuals: t.hasActuals,
    variance: round(spent - t.subtotal),
    costPerAttendee: attended ? round(spent / attended) : 0,
    approvedBudget: b.event.approved_budget ?? b.event.budget_cap,
    nps: n,
    avgRating,
    themes,
    lessons,
    signals: { show_rate: round(showRate), follow_up_days: 3, lanyards_attendees: false, av_check: themes.improvements.some((x) => x.theme.startsWith("Audio")) },
  };
}

export function reportDoc(b: NonNullable<Bundle>): DocModel {
  const d = reportData(b);
  const tpl = templateOf(b.university!.sop, "post_event");
  const claimsBy = fmtDate(new Date(Date.parse(b.event.date) + (b.university?.sop.budget_rules.claims_days_after ?? 14) * 86400000).toISOString().slice(0, 10));
  const builders: Record<string, () => Block[]> = {
    summary: () => [
      {
        type: "kv",
        rows: [
          ["Registered vs attended", `${d.registered} → ${d.attended} (${Math.round(d.showRate * 100)}% show rate)`],
          ["Budget vs actual", `${fmtRM(d.estimated)} → ${fmtRM(d.actual)} (${d.variance > 0 ? `${fmtRM(d.variance)} over` : d.variance < 0 ? `${fmtRM(-d.variance)} under` : "on estimate"})`],
          ["Cost per attendee", fmtRM(d.costPerAttendee)],
          ["NPS", `${d.nps.nps} (n=${d.nps.n})`],
          ["Average rating", `${d.avgRating} / 5`],
        ],
      },
    ],
    attendance: () => [{ type: "table", head: ["Source", "Registered", "Checked in"], rows: groupBy(b.rsvps, (r) => r.source).map(([src, rows]) => [src, rows.filter((r) => r.status !== "cancelled").length, rows.filter((r) => r.checked_in).length]) }],
    budget: () => [{ type: "table", head: ["Item", "Estimate (RM)", "Actual (RM)", "Variance (RM)"], totalRow: true, widths: [3, 1, 1, 1], rows: [...b.lines.map((l) => [l.description, l.estimated, l.actual ?? "", l.actual != null ? round(l.actual - l.estimated) : ""]), ["Total", d.estimated, d.actual, d.variance]] }],
    feedback: () => [
      { type: "p", text: `NPS ${d.nps.nps} · ${d.nps.promoters} promoters, ${d.nps.passives} passives, ${d.nps.detractors} detractors`, bold: true },
      { type: "p", text: "What worked:", bold: true },
      { type: "bullets", items: d.themes.strengths.slice(0, 5).map((t) => `${t.theme} (${t.count})`) },
      { type: "p", text: "What to improve:", bold: true },
      { type: "bullets", items: d.themes.improvements.slice(0, 5).map((t) => `${t.theme} (${t.count})`) },
    ],
    lessons: () => [{ type: "bullets", items: d.lessons }],
    claims: () => [{ type: "p", text: `Claims with receipts due by ${claimsBy}.` }],
  };
  return {
    title: `${tpl.title}, ${b.event.title}`,
    subtitle: `${b.society?.name ?? ""} · ${fmtDate(b.event.date)} · ${b.venue?.name ?? ""} · ${b.university?.short_name} template`,
    sections: tpl.sections.map((sec) => ({ key: sec.key, title: sec.title, blocks: builders[sec.key]?.() ?? [{ type: "p", text: `[Needs input] ${sec.hint}` }] })),
  };
}

/** One speaker's profile in the university's speaker template. */
export function speakerDoc(b: NonNullable<Bundle>, speakerId: string): DocModel | null {
  const sp = b.speakers.find((x) => x.id === speakerId);
  if (!sp) return null;
  const tpl = templateOf(b.university!.sop, "speaker_profile");
  const fill: Record<string, string> = {
    name: sp.name,
    role: sp.headline ?? "",
    bio: sp.fit_reason ?? "",
    talk: `${b.event.topic ?? b.event.title}, talk at ${b.event.title}`,
    abstract: "",
    contact: sp.email ?? "",
    declaration: "I confirm my talk follows the university's guidelines for external speakers.   Signature: ____________   Date: ________",
  };
  return {
    title: `${tpl.title}, ${sp.name}`,
    subtitle: `${b.event.title} · ${fmtDate(b.event.date)} · ${b.university?.short_name} template`,
    sections: tpl.sections.map((sec) => ({ key: sec.key, title: sec.title, blocks: [{ type: "p" as const, text: fill[sec.key] || "____________________________________________", muted: !fill[sec.key] }] })),
  };
}

/** Blank template to download and fill by hand. */
export function blankTemplateDoc(uniName: string, tpl: SopTemplate): DocModel {
  return {
    title: tpl.title,
    subtitle: `${uniName} template`,
    sections: tpl.sections.map((sec) => ({ key: sec.key, title: sec.title, blocks: [...(sec.hint ? [{ type: "p" as const, text: sec.hint, muted: true }] : []), { type: "p" as const, text: "____________________________________________________________" }, { type: "p" as const, text: "____________________________________________________________" }] })),
  };
}

function groupBy<T>(rows: T[], k: (r: T) => string): [string, T[]][] {
  const m = new Map<string, T[]>();
  for (const r of rows) m.set(k(r), [...(m.get(k(r)) ?? []), r]);
  return [...m.entries()];
}

export { owner };
