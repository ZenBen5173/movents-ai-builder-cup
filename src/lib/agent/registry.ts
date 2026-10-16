import "server-only";
import { Run } from "./run";
import * as T from "./tools";
import { execute, classify } from "./pipelines";
import { parsePrompt } from "../planning";
import { appUrl, outputsUrl, signToken, today } from "../appurl";
import { one, query } from "../db";
import { decideApproval } from "../actions";
import { runScheduler } from "../scheduler";
import { loadBundle, budgetTotals } from "../docs/builders";
import { generateKit, imageHref, needsImage, refreshPrompts, setImage } from "../marketing";
import { update as updateRow } from "../db";
import type { AgentRun, Creative, StepStatus, User } from "../types";
import { addMembers, assertMember, assertMemberOf, listMembers, removeMember, resolvePeople, seesAll, visibleSql } from "../members";
import { offerLabel, outreachSponsors, recordSponsor, saveSponsors, type Decision, type SponsorInput } from "../sponsors";
import { audit } from "../audit";
import { isFinal } from "../rbac";
import { validateArgs } from "./validate";
import type { Sponsor } from "../types";

type Args = Record<string, unknown>;
type Tool = {
  name: string;
  description: string;
  inputSchema: { type: "object"; properties: Record<string, unknown>; required?: string[] };
  run: (args: Args, user: User) => Promise<unknown>;
};

/** MCP tool annotations: clients use them to decide when to ask the user before calling. */
export type ToolAnnotations = { title: string; readOnlyHint: boolean; destructiveHint: boolean; idempotentHint: boolean; openWorldHint: boolean };

const str = (description: string) => ({ type: "string", description });
const ev = { event_id: str("Event id (evt_...) returned by create_event") };
const runId = { run_id: str("Optional agent run id from start_run, when given, this call is recorded as a step in the live trace") };

/** Links to every generated file. Files carry a 7-day signed token so the assistant (or anyone the user shares them with) can open them. */
function outputs(eventId: string) {
  const base = appUrl();
  const f = (file: string) => outputsUrl(eventId, file, 7);
  return {
    dashboard: `${base}/events/${eventId}`,
    proposal_pdf: f("proposal.pdf"),
    proposal_docx: f("proposal.docx"),
    budget_xlsx: f("budget.xlsx"),
    budget_csv: f("budget.csv"),
    risks_xlsx: f("risks.xlsx"),
    risks_pdf: f("risks.pdf"),
    runsheet_pdf: f("runsheet.pdf"),
    timeline_ics: f("timeline.ics"),
    report_pdf: f("report.pdf"),
    report_docx: f("report.docx"),
    marketing_kit: `${base}/events/${eventId}/promotion`,
    audit_log: `${base}/audit?event=${eventId}`,
  };
}

/** Wrap a tool so that, given run_id, the call shows up in the run's live trace. */
async function traced(user: User, args: Args, name: string, tool: string, fn: () => Promise<unknown>) {
  const rid = args.run_id ? String(args.run_id) : null;
  const run = rid ? await Run.load(rid, user) : null;
  if (!run) return fn();
  if (args.event_id && !run.eventId) await run.setEvent(String(args.event_id));
  return run.step(name, `assistant → ${tool}`, args, async () => {
    const out = await fn();
    return { output: out, ...describe(out) };
  }).then((r) => r.output);
}

type Check = { check?: string; label?: string; passed: boolean; detail?: string; deadline?: string; days_late?: number };

/** Turn a tool result into the trace's status / summary / checks / adapt note. */
function describe(out: unknown): { status: StepStatus; summary?: string; validation?: { check: string; passed: boolean; detail: string }[]; adapt?: string } {
  const toChecks = (rows: Check[]) => rows.map((c) => ({ check: c.check ?? c.label ?? "check", passed: c.passed, detail: c.detail ?? (c.deadline ? `due ${c.deadline}${c.days_late ? `, ${c.days_late} days late` : ""}` : "") }));
  if (Array.isArray(out)) {
    if (out.length && typeof out[0] === "object" && out[0] && "passed" in out[0]) {
      const v = toChecks(out as Check[]);
      return { status: v.every((x) => x.passed) ? "ok" : "warn", validation: v, summary: `${v.filter((x) => x.passed).length}/${v.length} checks passed` };
    }
    const blocked = out.filter((x) => (x as { status?: string }).status === "blocked").length;
    return { status: blocked ? "blocked" : "ok", summary: blocked ? `${blocked} of ${out.length} blocked → approval queue` : `${out.length} done` };
  }
  if (out && typeof out === "object") {
    const o = out as Record<string, unknown>;
    if (Array.isArray(o.checks)) {
      const v = toChecks(o.checks as Check[]);
      return { status: v.every((x) => x.passed) ? "ok" : "warn", validation: v, adapt: o.allPassed === false ? `Earliest compliant date: ${String(o.suggestedDate)}` : undefined, summary: `${v.filter((x) => x.passed).length}/${v.length} lead times met` };
    }
    if (Array.isArray(o.iterations)) {
      const its = o.iterations as { total: number; change: string; withinCap: boolean }[];
      return { status: Number(o.shortfall) > 0 ? "fail" : its.length > 1 ? "warn" : "ok", summary: its.map((i) => `RM${i.total}`).join(" → "), adapt: its.length > 1 ? its.slice(1).map((i) => i.change).join(" | ") : undefined };
    }
    if (o.status === "blocked") return { status: "blocked", summary: String(o.reason ?? "Blocked → approval queue") };
    if (o.status === "failed") return { status: "fail", summary: String(o.error ?? "failed") };
    if (o.status === "executed") return { status: "ok", summary: String(o.reason ?? "executed") };
    if (typeof o.chosen === "string") return { status: "ok", summary: o.chosen };
    if (Array.isArray(o.speakers)) return { status: o.mode === "live" ? "ok" : "warn", summary: `${(o.speakers as { name: string }[]).map((s) => s.name).join(", ")} (${String(o.mode)})` };
    if (o.university) return { status: "ok", summary: `${String(o.university)} SOP v${String(o.sopVersion)}` };
    if (typeof o.tasks === "number") return { status: "ok", summary: `${o.tasks} tasks across 5 phases` };
    if (typeof o.count === "number") return { status: "ok", summary: `${o.count} risks` };
    if (typeof o.runsheetBlocks === "number") return { status: "ok", summary: `${o.runsheetBlocks} run-sheet blocks, ${String(o.promoItems)} promo tasks, ${String(o.reminders)} reminders` };
    return { status: "ok", summary: JSON.stringify(o).slice(0, 160) };
  }
  return { status: "ok", summary: String(out) };
}

const ALL_TOOLS: Tool[] = [
  {
    name: "review_brief",
    description: "Start here when the user wants to plan an event. Pass their words as they said them. Returns what was understood and the questions to ask (all at once) before planning. If questions is empty, go straight to planning.",
    inputSchema: { type: "object", properties: { brief: str("The user's request in their own words") }, required: ["brief"] },
    run: async (a, user) => {
      const brief = String(a.brief);
      const p = parsePrompt(brief, today());
      const people = await query<{ name: string; department: string | null }>("SELECT name, department FROM society_members WHERE society_id = $1 AND role <> 'faculty_advisor' ORDER BY name", [user.society_id]);
      const questions: string[] = [];
      if (p.missing.includes("date")) questions.push("What date (and time) is the event?");
      if (p.missing.includes("pax")) questions.push("Roughly how many people are you expecting?");
      if (p.missing.includes("budget")) questions.push("What is the budget cap (in RM)?");
      if (!p.team.length) questions.push(`Who is helping run it? (e.g. ${people.slice(0, 3).map((x) => x.name.split(" ")[0]).join(", ")})`);
      if (p.title.toLowerCase().startsWith("event") || p.topic.toLowerCase() === "event") questions.push("What is the event about (topic and format, e.g. AI talk, hackathon, workshop)?");
      return {
        understood: { title: p.title, date: p.missing.includes("date") ? null : p.date, time: `${p.startTime} to ${p.endTime}`, pax: p.missing.includes("pax") ? null : p.pax, budget_rm: p.missing.includes("budget") ? null : p.budget, campus: p.university, team: p.team, preferred_suppliers: p.suppliers },
        questions,
        defaults_if_user_says_you_decide: { date: p.date, pax: p.pax, budget_rm: p.budget, time: `${p.startTime} to ${p.endTime}`, campus: (await one<{ short_name: string }>("SELECT u.short_name FROM societies s JOIN universities u ON u.id = s.university_id WHERE s.id = $1", [user.society_id]))?.short_name ?? null },
        optional_to_ask: p.suppliers.length ? [] : ["Any suppliers you want to use (e.g. a caterer)?"],
        next: questions.length ? "Ask the user these questions in one message, then plan end to end." : "Everything needed is here. Plan end to end now (start_run first).",
      };
    },
  },
  {
    name: "list_society_members",
    description: "People in the caller's society (name, role, department, email). Use to pick an event team.",
    inputSchema: { type: "object", properties: {} },
    run: async (_, user) => query("SELECT name, role, department, email FROM society_members WHERE society_id = $1 AND role <> 'faculty_advisor' ORDER BY name", [user.society_id]),
  },
  {
    name: "list_my_events",
    description: "Events the caller is on the team for (President, VP and advisor see all).",
    inputSchema: { type: "object", properties: {} },
    run: async (_, user) => query(`SELECT e.id AS event_id, e.title, e.date, e.status FROM events e WHERE e.society_id = $1 AND ${visibleSql(user, 2)} ORDER BY e.date`, [user.society_id, user.id]),
  },
  {
    name: "event_team",
    description: "Show, add or remove people on an event team. Only team members can see and edit an event.",
    inputSchema: { type: "object", properties: { ...ev, add: { type: "array", items: { type: "string" }, description: "Names or emails to add" }, remove: { type: "array", items: { type: "string" }, description: "Names or emails to remove" } }, required: ["event_id"] },
    run: async (a, user) => {
      const eventId = String(a.event_id);
      const add = Array.isArray(a.add) ? (a.add as string[]) : [];
      const rem = Array.isArray(a.remove) ? (a.remove as string[]) : [];
      if (add.length || rem.length) {
        const lead = await one("SELECT 1 FROM event_members WHERE event_id = $1 AND user_id = $2 AND role IN ('lead','colead')", [eventId, user.id]);
        if (!lead && !seesAll(user)) throw new Error("Only the event lead (or President/VP) can change the team");
      }
      const added = await resolvePeople(user.society_id ?? "", add);
      await addMembers(eventId, added.ids, user.id);
      const removed = await resolvePeople(user.society_id ?? "", rem);
      const leadRow = await one<{ user_id: string }>("SELECT user_id FROM event_members WHERE event_id = $1 AND role = 'lead'", [eventId]);
      for (const uid of removed.ids) if (uid !== leadRow?.user_id) await removeMember(eventId, uid);
      return { team: (await listMembers(eventId)).map((m) => ({ name: m.name, role: m.member_role, department: m.department })), not_found: [...added.unknown, ...removed.unknown] };
    },
  },
  {
    name: "list_event_emails",
    description: "Every email Movents sent for one event (speaker invites, supplier quotes, faculty proposal, attendee reminders), newest first, plus the event's tagged mailbox. Inbox UI: /events/<event_id>/inbox.",
    inputSchema: { type: "object", properties: { ...ev }, required: ["event_id"] },
    run: async (a) => {
      const eventId = String(a.event_id);
      const box = await query<{ address: string }>("SELECT address FROM event_mailboxes WHERE event_id = $1", [eventId]).catch(() => []);
      const emails = await query<{ id: string; subject: string; to: string; kind: string; status: string; sent_at: string | null }>(
        `SELECT id, subject, COALESCE(intended_to, to_addr) AS "to", kind, status, COALESCE(sent_at, created_at) AS sent_at FROM emails WHERE event_id = $1 ORDER BY created_at DESC LIMIT 200`,
        [eventId],
      );
      return { mailbox: box[0]?.address ?? null, inbox_url: `${appUrl()}/events/${eventId}/inbox`, count: emails.length, emails: emails.map((e) => ({ ...e, link: `${appUrl()}/events/${eventId}/inbox#${e.id}` })) };
    },
  },
  {
    name: "save_sponsors",
    description: "Save sponsors you found with your own web search (local companies that fit the event topic: tech, banks, telcos, F&B...). Skips companies already on the event. If you cannot search the web, skip this step. Sponsors UI: /events/<event_id>/sponsors.",
    inputSchema: { type: "object", properties: { ...ev, sponsors: { type: "array", items: { type: "object", properties: { company: str("Company name"), website: str("Company website"), contact_name: str("Contact person, if found"), contact_email: str("Partnerships / marketing email, if public"), industry: str("e.g. Banking, Technology, F&B, Telco"), ask: str('What to ask for, e.g. "RM3,000" or "Coffee for 150 pax"'), fit_reason: str("Why they fit this event") }, required: ["company"] } }, ...runId }, required: ["event_id", "sponsors"] },
    run: (a, u) => traced(u, a, "Save sponsors from web search", "save_sponsors", async () => { const r = await saveSponsors(String(a.event_id), (a.sponsors as SponsorInput[]) ?? []); return { saved: r.length, sponsors: r.map((s) => ({ sponsor_id: s.id, company: s.company })) }; }),
  },
  {
    name: "list_sponsors",
    description: "Sponsors on an event with their outreach status (found → contacted → opened → replied → accepted | declined), offers, and funnel totals.",
    inputSchema: { type: "object", properties: { ...ev }, required: ["event_id"] },
    run: async (a) => {
      const eventId = String(a.event_id);
      const rows = await query<Sponsor>("SELECT * FROM sponsors WHERE event_id = $1 ORDER BY created_at", [eventId]);
      const funnel = Object.fromEntries(["found", "contacted", "opened", "replied", "accepted", "declined"].map((s) => [s, rows.filter((r) => r.status === s).length]));
      const accepted = rows.filter((r) => r.status === "accepted");
      return {
        page: `${appUrl()}/events/${eventId}/sponsors`,
        funnel,
        confirmed_cash: accepted.filter((r) => r.offer_type !== "in_kind").reduce((n, r) => n + (r.offer_amount ?? 0), 0),
        in_kind: accepted.filter((r) => r.offer_type === "in_kind").length,
        sponsors: rows.map((r) => ({ sponsor_id: r.id, company: r.company, industry: r.industry, contact_email: r.contact_email, ask: r.ask, status: r.status, offer: r.status === "accepted" ? offerLabel(r) : null, notes: r.notes })),
      };
    },
  },
  {
    name: "send_sponsor_outreach",
    description: "Email the sponsorship invitation with the event proposal (PDF) attached to every 'found' sponsor, or only sponsor_ids. Role-gated: committee members' emails are queued for Programmes Director approval.",
    inputSchema: { type: "object", properties: { ...ev, sponsor_ids: { type: "array", items: { type: "string" }, description: "Optional spn_... ids; default all not yet contacted" }, ...runId }, required: ["event_id"] },
    run: (a, u) => traced(u, a, "Send sponsor outreach", "send_sponsor_outreach", () => outreachSponsors(u, String(a.event_id), Array.isArray(a.sponsor_ids) ? (a.sponsor_ids as string[]) : null, (a.run_id as string) ?? null)),
  },
  {
    name: "record_sponsor_reply",
    description: "Record a sponsor's reply: status replied | accepted | declined (or opened). For accepted give offer_type cash (with offer_amount in RM) or in_kind (with offer_note, e.g. 'Coffee and pastries for 150 pax').",
    inputSchema: { type: "object", properties: { ...ev, sponsor_id: str("spn_..."), status: { type: "string", enum: ["opened", "replied", "accepted", "declined"] }, offer_type: { type: "string", enum: ["cash", "in_kind"] }, offer_amount: { type: "number", description: "RM value" }, offer_note: str("What they offer / conditions"), notes: str("Short note, e.g. why they declined") }, required: ["event_id", "sponsor_id", "status"] },
    run: async (a, u) => {
      const sp = await one<Sponsor>("SELECT * FROM sponsors WHERE id = $1 AND event_id = $2", [String(a.sponsor_id), String(a.event_id)]);
      if (!sp) throw new Error("Sponsor not found on this event");
      const r = await recordSponsor(sp.id, { status: a.status as Decision["status"], offer_type: (a.offer_type as Decision["offer_type"]) ?? null, offer_amount: a.offer_amount == null ? null : Number(a.offer_amount), offer_note: (a.offer_note as string) ?? null, notes: a.notes as string | undefined });
      await audit(u, `sponsor.${r.status}`, { company: r.company, offer: r.status === "accepted" ? offerLabel(r) : null, via: "assistant" }, { eventId: r.event_id });
      return { sponsor_id: r.id, company: r.company, status: r.status, offer: r.status === "accepted" ? offerLabel(r) : null };
    },
  },
  {
    name: "schedule_meeting",
    description: "Book a team meeting for an event (kick-off, weekly sync, vendor check-in, day-before run-through, debrief). Times are Malaysia time. Attendees default to the whole event team. Shows on /events/<event_id>/meetings with an .ics link.",
    inputSchema: {
      type: "object",
      properties: {
        ...ev,
        title: str('e.g. "Weekly sync"'),
        starts_at: str('Start, ISO 8601, e.g. "2026-10-13T20:00" (Malaysia time when no offset is given)'),
        duration_min: { type: "number", description: "Length in minutes (default 60, or the template's)" },
        location: str("Room or place"),
        meeting_url: str("Video call link"),
        attendees: { type: "array", items: { type: "string" }, description: "Names or emails; default the whole event team" },
        agenda: { type: "array", items: { type: "string" }, description: "Agenda lines" },
        template: { type: "string", enum: ["kickoff", "weekly", "vendor", "runthrough", "debrief"], description: "Prefill title, length and agenda" },
        ...runId,
      },
      required: ["event_id", "starts_at"],
    },
    run: (a, u) =>
      traced(u, a, "Schedule meeting", "schedule_meeting", async () => {
        const M = await import("../meetings");
        const eventId = String(a.event_id);
        const tpl = M.templateFor(a.template as string | undefined);
        const raw = String(a.starts_at ?? "");
        const hasZone = /(Z|[+-]\d{2}:?\d{2})$/i.test(raw);
        const at = hasZone ? M.klParts(new Date(raw).toISOString()) : { date: raw.slice(0, 10), time: raw.slice(11, 16) || "20:00" };
        const names = Array.isArray(a.attendees) ? (a.attendees as string[]).filter(Boolean) : [];
        const people = names.length ? await resolvePeople(u.society_id ?? "", names) : { ids: (await listMembers(eventId)).map((m) => m.user_id), unknown: [] as string[] };
        const agenda = Array.isArray(a.agenda) && a.agenda.length ? (a.agenda as string[]) : tpl?.agenda ?? [];
        const m = await M.createMeetingRecord(u, eventId, {
          title: String(a.title ?? tpl?.title ?? "Team meeting"),
          date: at.date,
          time: at.time,
          duration_min: Number(a.duration_min) || tpl?.duration || 60,
          location: (a.location as string) ?? null,
          meeting_url: (a.meeting_url as string) ?? null,
          attendees: people.ids,
          agenda,
        });
        return { meeting_id: m.id, title: m.title, when: M.fmtWhen(m.starts_at, m.duration_min), attendees: m.attendees.length, agenda: m.agenda.map((x) => x.item), not_found: people.unknown, link: `${appUrl()}/events/${eventId}/meetings#${m.id}`, ics_url: `${appUrl()}/api/meetings/${m.id}/ics` };
      }),
  },
  {
    name: "list_meetings",
    description: "An event's meetings with time, place, attendees, whether minutes are written and how many action items are still open.",
    inputSchema: { type: "object", properties: { ...ev, when: { type: "string", enum: ["upcoming", "past", "all"], description: "Default all" } }, required: ["event_id"] },
    run: async (a) => {
      const M = await import("../meetings");
      const eventId = String(a.event_id);
      const [all, names] = await Promise.all([M.listMeetings(eventId), M.teamNames(eventId)]);
      const now = M.nowKL();
      const pick = all.filter((m) => (a.when === "upcoming" ? !M.isPast(m, now) : a.when === "past" ? M.isPast(m, now) : true));
      return pick.map((m) => ({
        meeting_id: m.id,
        title: m.title,
        when: M.fmtWhen(m.starts_at, m.duration_min),
        status: m.status === "scheduled" && M.isPast(m, now) ? "needs_minutes" : m.status,
        where: m.location ?? m.meeting_url,
        attendees: m.attendees.map((x) => names[x] ?? x),
        minutes_done: M.hasMinutes(m),
        decisions: m.decisions.length,
        open_action_items: m.action_items.filter((x) => !x.done).length,
        link: `${appUrl()}/events/${eventId}/meetings#${m.id}`,
      }));
    },
  },
  {
    name: "record_minutes",
    description: "Write up a meeting: minutes (use '## Heading' and '- bullet' lines), decisions, action items with owners and due dates, and who attended. Appends to what is there and marks the meeting done. create_tasks turns each new action item into a task on the event.",
    inputSchema: {
      type: "object",
      properties: {
        meeting_id: str("mtg_... from list_meetings or schedule_meeting"),
        minutes: str("Minutes text"),
        decisions: { type: "array", items: { type: "string" } },
        action_items: { type: "array", items: { type: "object", properties: { text: str("What to do"), owner: str("Name or email on the team"), due_date: str("YYYY-MM-DD") }, required: ["text"] } },
        attended: { type: "array", items: { type: "string" }, description: "Names or emails of who came" },
        create_tasks: { type: "boolean", description: "Also add each new action item to the event's tasks" },
        mark_done: { type: "boolean", description: "Default true" },
        ...runId,
      },
      required: ["meeting_id"],
    },
    run: async (a, u) => {
      const M = await import("../meetings");
      const m = await M.getMeeting(String(a.meeting_id));
      if (!m) throw new Error("Meeting not found");
      await assertMember(u, m.event_id);
      return traced(u, { ...a, event_id: m.event_id }, "Record meeting minutes", "record_minutes", async () => {
        const items = Array.isArray(a.action_items) ? (a.action_items as { text: string; owner?: string; due_date?: string }[]) : [];
        const unknown: string[] = [];
        const actions = [];
        for (const it of items) {
          const who = it.owner ? await resolvePeople(u.society_id ?? "", [it.owner]) : { ids: [], unknown: [] };
          unknown.push(...who.unknown);
          actions.push({ text: String(it.text ?? ""), owner_id: who.ids[0] ?? null, due_date: /^\d{4}-\d{2}-\d{2}$/.test(String(it.due_date ?? "")) ? String(it.due_date) : null });
        }
        const came = Array.isArray(a.attended) && a.attended.length ? await resolvePeople(u.society_id ?? "", a.attended as string[]) : null;
        if (came) unknown.push(...came.unknown);
        const r = await M.recordMinutes(u, m.id, {
          minutes: typeof a.minutes === "string" ? a.minutes : undefined,
          decisions: Array.isArray(a.decisions) ? (a.decisions as string[]) : undefined,
          action_items: actions,
          attended: came?.ids,
          create_tasks: Boolean(a.create_tasks),
          mark_done: a.mark_done !== false,
        });
        const names = await M.teamNames(m.event_id);
        return {
          meeting_id: m.id,
          status: r.meeting?.status,
          decisions: r.meeting?.decisions,
          action_items: r.meeting?.action_items.map((x) => ({ text: x.text, owner: x.owner_id ? names[x.owner_id] ?? x.owner_id : null, due_date: x.due_date, task_id: x.task_id ?? null })),
          tasks_created: r.task_ids.length,
          not_found: unknown,
          link: `${appUrl()}/events/${m.event_id}/meetings#${m.id}`,
          minutes_md: `${appUrl()}/api/meetings/${m.id}/minutes`,
          minutes_pdf: `${appUrl()}/api/meetings/${m.id}/minutes?format=pdf`,
        };
      });
    },
  },
  {
    name: "whoami",
    description: "Returns the Movents user you are acting as, their society, role, and what they may do without approval.",
    inputSchema: { type: "object", properties: {} },
    run: async (_, user) => {
      const soc = await one<{ name: string; university: string }>("SELECT s.name, u.name AS university FROM societies s JOIN universities u ON u.id = s.university_id WHERE s.id = $1", [user.society_id]);
      return { id: user.id, name: user.name, email: user.email, society: soc?.name, university: soc?.university, role: user.role, department: user.department, note: "Outbound actions this user may not do alone are queued for approval automatically." };
    },
  },
  {
    name: "start_run",
    description: "Start a run so every following tool call (with run_id) appears in the Movents live trace the user can watch. Call this first with the user's original request.",
    inputSchema: { type: "object", properties: { prompt: str("The user's original request") }, required: ["prompt"] },
    run: async (a, user) => {
      const r = await Run.start(user, String(a.prompt), classify(String(a.prompt)), "assistant");
      return { run_id: r.id, trace_url: `${appUrl()}/runs/${r.id}` };
    },
  },
  {
    name: "generate_post_event_report",
    description: "Generate the post-event report (registered vs actual, budget vs actual, cost per attendee, NPS, feedback themes, lessons learned) as PDF and Word, and feed lessons back into the SOP knowledge base.",
    inputSchema: { type: "object", properties: { prompt: str('e.g. "Generate the post-event report for the AI talk."') }, required: ["prompt"] },
    run: async (a, user) => {
      const r = await Run.start(user, String(a.prompt), "report", "assistant");
      await execute(r, "report");
      const row = await one<AgentRun>("SELECT * FROM agent_runs WHERE id = $1", [r.id]);
      return { run_id: r.id, status: row?.status, event_id: row?.event_id, trace_url: `${appUrl()}/runs/${r.id}`, steps: row?.steps.map((s) => `${s.status.toUpperCase()} ${s.name}: ${s.summary ?? ""}`), outputs: row?.event_id ? outputs(row.event_id) : {} };
    },
  },
  {
    name: "create_event",
    description: "Parse a one-line goal and create a draft event for the caller's society. The caller becomes the event lead; pass team to add collaborators (only team members can see and edit the event).",
    inputSchema: { type: "object", properties: { prompt: str("One-line event goal"), team: { type: "array", items: { type: "string" }, description: "Names or emails of society members working on this event" }, suppliers: { type: "array", items: { type: "string" }, description: "Supplier names the organiser asked for" }, ...runId }, required: ["prompt"] },
    run: (a, user) =>
      traced(user, a, "Create event", "create_event", async () => {
        const p = parsePrompt(String(a.prompt), today());
        if (Array.isArray(a.team)) p.team = [...p.team, ...(a.team as string[])];
        if (Array.isArray(a.suppliers)) p.suppliers = [...p.suppliers, ...(a.suppliers as string[])];
        const e = await T.createEvent(user, p);
        if (a.run_id) {
          const r = await Run.load(String(a.run_id), user);
          await r?.setEvent(e.id);
        }
        return { event_id: e.id, parsed: p };
      }),
  },
  { name: "read_sop", description: "Read the university's SOP (required proposal sections, lead times, rules) plus lessons learned from past events.", inputSchema: { type: "object", properties: { ...ev, ...runId }, required: ["event_id"] }, run: (a, u) => traced(u, a, "Read university SOP", "read_sop", () => T.readSop(String(a.event_id))) },
  { name: "plan_timeline", description: "Back-calculate the phased task timeline (concept, planning, promotion, execution, post-event) from the event date and SOP lead times.", inputSchema: { type: "object", properties: { ...ev, ...runId }, required: ["event_id"] }, run: (a, u) => traced(u, a, "Back-calculate timeline", "plan_timeline", () => T.planTimeline(String(a.event_id))) },
  { name: "match_venue", description: "Pick the smallest free venue that fits, with clash detection against other bookings that day.", inputSchema: { type: "object", properties: { ...ev, ...runId }, required: ["event_id"] }, run: (a, u) => traced(u, a, "Match venue", "match_venue", async () => { const r = await T.matchVenue(String(a.event_id)); return { chosen: r.chosen?.name ?? null, considered: r.considered.map((c) => ({ venue: c.venue.name, ok: c.ok, reason: c.reason })) }; }) },
  { name: "check_lead_times", description: "Validate the event date against SOP lead times. Returns each check, and the earliest compliant date if any are missed.", inputSchema: { type: "object", properties: { ...ev, ...runId }, required: ["event_id"] }, run: (a, u) => traced(u, a, "Validate lead times", "check_lead_times", () => T.checkLeads(String(a.event_id))) },
  {
    name: "save_speakers",
    description: "Save speakers you found with your own web search (name, headline, profile URL, email if public). Replaces placeholder speakers. If you cannot search the web, skip this step and tell the user to add speakers on the Speakers page.",
    inputSchema: { type: "object", properties: { ...ev, speakers: { type: "array", items: { type: "object", properties: { name: str("Full name"), headline: str("Role / organisation"), source_url: str("Profile or source page"), email: str("Public email, if any"), fit_reason: str("Why they fit") }, required: ["name"] } }, ...runId }, required: ["event_id", "speakers"] },
    run: (a, u) => traced(u, a, "Save speakers from web search", "save_speakers", async () => { const r = await T.saveSpeakers(String(a.event_id), (a.speakers as never[]) ?? []); return { saved: r.length, speakers: r.map((s) => ({ id: s.id, name: s.name })) }; }),
  },
  {
    name: "save_supplier_quotes",
    description: "Save supplier prices you found with your own web search. category: food | tshirt | lanyard | cardholder. unit_price in RM; unit: pax or piece. Always include the source url. If you cannot search the web, skip this: Movents falls back to its supplier registry.",
    inputSchema: { type: "object", properties: { ...ev, quotes: { type: "array", items: { type: "object", properties: { category: str("food | tshirt | lanyard | cardholder"), name: str("Supplier"), url: str("Source page"), unit_price: { type: "number" }, unit: str("pax | piece"), snippet: str("Evidence text with the price") }, required: ["category", "name", "unit_price", "url"] } }, ...runId }, required: ["event_id", "quotes"] },
    run: (a, u) => traced(u, a, "Save supplier quotes from web search", "save_supplier_quotes", async () => {
      const quotes = ((a.quotes as { url?: string }[]) ?? []).filter((q) => /^https?:\/\//i.test(String(q.url ?? "")));
      const r = await T.saveSupplierQuotes(String(a.event_id), quotes as never[]);
      return { saved: r.length };
    }),
  },
  { name: "list_speakers_and_suppliers", description: "Speakers and supplier options currently on the event (after saving, call draft_budget to recompute).", inputSchema: { type: "object", properties: { ...ev, ...runId }, required: ["event_id"] }, run: (a, u) => traced(u, a, "Research on file", "list_speakers_and_suppliers", async () => { const sp = await T.researchSpeakers(String(a.event_id), 3); const su = await T.researchSuppliers(String(a.event_id)); return { speakers: sp.speakers.map((s) => s.name), suppliers: Object.fromEntries(Object.entries(su.suppliers).map(([k, v]) => [k, v.map((x) => `${x.name} RM${x.unit_price}`)])) }; }) },
  { name: "draft_budget", description: "Compose the budget with 10% contingency and run the adapt loop (swap to cheaper vendors, apply cuts) until it fits the cap.", inputSchema: { type: "object", properties: { ...ev, ...runId }, required: ["event_id"] }, run: (a, u) => traced(u, a, "Draft budget & adapt", "draft_budget", async () => { const s = await T.readSop(String(a.event_id)); const r = await T.draftBudget(String(a.event_id), s.signals); return { iterations: r.iterations.map((i) => ({ label: i.label, total: i.total, withinCap: i.withinCap, change: i.change })), final_total: r.final.total, shortfall: r.shortfall }; }) },
  { name: "validate_budget", description: "Check total ≤ cap incl. contingency, contingency present, supplier links present.", inputSchema: { type: "object", properties: { ...ev, ...runId }, required: ["event_id"] }, run: (a, u) => traced(u, a, "Validate budget", "validate_budget", () => T.checkBudget(String(a.event_id))) },
  { name: "generate_risks", description: "Generate the risk register with mitigations and a weather/contingency plan (Open-Meteo data).", inputSchema: { type: "object", properties: { ...ev, ...runId }, required: ["event_id"] }, run: (a, u) => traced(u, a, "Risk register", "generate_risks", () => T.generateRisks(String(a.event_id))) },
  { name: "generate_ops_pack", description: "Generate the 15-minute run sheet, promotion checklist, reminder cadence and volunteer roster.", inputSchema: { type: "object", properties: { ...ev, ...runId }, required: ["event_id"] }, run: (a, u) => traced(u, a, "Ops pack", "generate_ops_pack", () => T.generateOpsPack(String(a.event_id))) },
  { name: "validate_proposal", description: "Check that the generated proposal contains every section the university SOP requires.", inputSchema: { type: "object", properties: { ...ev, ...runId }, required: ["event_id"] }, run: (a, u) => traced(u, a, "Validate proposal", "validate_proposal", () => T.checkProposal(String(a.event_id))) },
  { name: "get_outputs", description: "Links to every generated file for an event (proposal PDF/DOCX, budget XLSX/CSV, risk register, run sheet, timeline ICS, report).", inputSchema: { type: "object", properties: { ...ev }, required: ["event_id"] }, run: async (a) => outputs(String(a.event_id)) },
  { name: "get_event", description: "Summary of an event: status, venue, budget totals, speakers, approvals and flags.", inputSchema: { type: "object", properties: { ...ev }, required: ["event_id"] }, run: async (a) => { const b = await loadBundle(String(a.event_id)); if (!b) throw new Error("Event not found"); const approvals = await query("SELECT id, title, status, approver_role FROM approval_requests WHERE event_id = $1 ORDER BY created_at", [b.event.id]); return { event: b.event, venue: b.venue?.name, budget: budgetTotals(b.lines, b.university?.sop.budget_rules.contingency_pct ?? 10), speakers: b.speakers.map((s) => ({ name: s.name, status: s.status })), approvals, rsvps: b.rsvps.length }; } },
  { name: "send_speaker_outreach", description: "Send invitation emails to found speakers. Role-gated: committee members' emails are queued for Director approval.", inputSchema: { type: "object", properties: { ...ev, ...runId }, required: ["event_id"] }, run: (a, u) => traced(u, a, "Send speaker outreach", "send_speaker_outreach", () => T.outreachSpeakers(u, String(a.event_id), (a.run_id as string) ?? null)) },
  { name: "request_vendor_quotes", description: "Email selected suppliers for written quotes. Role-gated (Logistics Director).", inputSchema: { type: "object", properties: { ...ev, ...runId }, required: ["event_id"] }, run: (a, u) => traced(u, a, "Request supplier quotes", "request_vendor_quotes", () => T.requestVendorQuotes(u, String(a.event_id), (a.run_id as string) ?? null)) },
  { name: "request_budget_approval", description: "Route the budget total for approval (President/VP above the SOP threshold).", inputSchema: { type: "object", properties: { ...ev, ...runId }, required: ["event_id"] }, run: (a, u) => traced(u, a, "Request budget approval", "request_budget_approval", () => T.requestBudgetApproval(u, String(a.event_id), (a.run_id as string) ?? null)) },
  { name: "submit_to_faculty", description: "Email the proposal to the faculty advisor with approve/reject links. Role-gated: needs President/VP approval first.", inputSchema: { type: "object", properties: { ...ev, ...runId }, required: ["event_id"] }, run: (a, u) => traced(u, a, "Submit to faculty", "submit_to_faculty", () => T.submitToFaculty(u, String(a.event_id), (a.run_id as string) ?? null)) },
  { name: "push_calendar", description: "Push the timeline milestones to Google Calendar (or the subscribable .ics feed).", inputSchema: { type: "object", properties: { ...ev, ...runId }, required: ["event_id"] }, run: (a, u) => traced(u, a, "Push to calendar", "push_calendar", () => T.pushToCalendar(u, String(a.event_id), (a.run_id as string) ?? null)) },
  { name: "publish_event", description: "Create the public event page on Luma or Meetup. Role-gated (President/VP).", inputSchema: { type: "object", properties: { ...ev, platform: { type: "string", enum: ["luma", "meetup"] }, ...runId }, required: ["event_id"] }, run: (a, u) => traced(u, a, "Publish event page", `publish_event (${String(a.platform ?? "luma")})`, () => T.publishEvent(u, String(a.event_id), (a.run_id as string) ?? null, (a.platform as "luma" | "meetup") ?? "luma")) },
  { name: "sync_rsvps", description: "Pull RSVPs from Luma or Meetup into the registration list.", inputSchema: { type: "object", properties: { ...ev, platform: { type: "string", enum: ["luma", "meetup"] }, ...runId }, required: ["event_id"] }, run: (a, u) => traced(u, a, "Sync RSVPs", "sync_rsvps", () => T.syncRsvps(String(a.event_id), (a.platform as "luma" | "meetup") ?? "luma")) },
  {
    name: "generate_marketing_kit",
    description: "Create the event's marketing kit: campus poster (4:5), Instagram post (1:1) and story (9:16), LinkedIn image, channel-specific captions and hashtags, plus a 15-second Reels/TikTok storyboard. Each creative includes an image_prompt and a ready-made branded poster. If you have an image generation tool, generate an image from each image_prompt and attach it with attach_creative_media; otherwise the branded posters are used.",
    inputSchema: { type: "object", properties: { ...ev, ...runId }, required: ["event_id"] },
    run: (a, u) =>
      traced(u, a, "Create marketing kit", "generate_marketing_kit", async () => {
        const r = await generateKit(String(a.event_id), { withImages: false });
        return { mode: r.mode, creatives: r.creatives.map((c) => ({ creative_id: c.id, kind: c.kind, channel: c.channel, size: `${c.width}x${c.height}`, caption: c.caption, hashtags: c.hashtags, image_prompt: c.image_prompt, preview: `${appUrl()}${imageHref(c)}` })) };
      }),
  },
  {
    name: "attach_creative_media",
    description: "Attach an image or video you generated to a creative. Pass media_url (a public https link) or media_base64 + mime_type. If the file only exists on the user's computer, pass file_path to get a one-time upload command instead. PNG, JPEG, WebP, GIF, MP4, WebM or MOV; images up to 8 MB, video up to 20 MB.",
    inputSchema: { type: "object", properties: { creative_id: str("crv_..."), media_url: str("https URL of the generated image/video"), media_base64: { type: "string", description: "Base64 data, without the data: prefix", maxLength: 28_000_000 }, mime_type: str("e.g. image/png, image/jpeg, video/mp4"), file_path: str("Path of the file on the user's computer; returns an upload command"), ...runId }, required: ["creative_id"] },
    run: (a, u) =>
      traced(u, a, "Attach generated media", "attach_creative_media", async () => {
        const cid = String(a.creative_id);
        if (!a.media_url && !a.media_base64) {
          if (!a.file_path) throw new Error("Pass media_url, media_base64 or file_path");
          const link = `${appUrl()}/api/creatives/${cid}/upload?t=${signToken(`upload:${cid}`, 1)}`;
          return {
            attached: false,
            upload_needed: true,
            upload_url: link,
            command: `curl -X POST --data-binary "@${String(a.file_path).replace(/"/g, "")}" "${link}"`,
            note: "POST the raw file bytes to upload_url (valid 24 hours, this creative only). If you can run shell commands, run `command`; otherwise ask the user to upload the file on the event's Marketing page.",
          };
        }
        const media = a.media_url ? String(a.media_url) : `data:${String(a.mime_type ?? "image/png")};base64,${String(a.media_base64)}`;
        const c = await setImage(cid, media, "assistant");
        return { creative_id: c?.id, attached: true, preview: c ? `${appUrl()}${imageHref(c)}` : null };
      }),
  },
  {
    name: "update_creative_copy",
    description: "Replace a creative's caption and/or hashtags (e.g. after rewriting them in the society's voice).",
    inputSchema: { type: "object", properties: { creative_id: str("crv_..."), caption: { type: "string", description: "New caption", maxLength: 5000 }, hashtags: { type: "string", description: "New hashtags", maxLength: 1000 } }, required: ["creative_id"] },
    run: async (a) => {
      const c = await updateRow<Creative>("creatives", String(a.creative_id), { caption: a.caption as string | undefined, hashtags: a.hashtags as string | undefined, updated_at: new Date() });
      if (!c) throw new Error("Creative not found");
      return { creative_id: c.id, caption: c.caption, hashtags: c.hashtags };
    },
  },
  { name: "request_social_approval", description: "Send the poster and social posts for approval (President/VP). Approved creatives satisfy the SOP publicity-approval step.", inputSchema: { type: "object", properties: { ...ev, ...runId }, required: ["event_id"] }, run: (a, u) => traced(u, a, "Request poster & social approval", "request_social_approval", () => T.requestSocialApproval(u, String(a.event_id), (a.run_id as string) ?? null)) },
  { name: "list_creatives", description: "List the event's marketing creatives with status, preview links, image_prompt and size. needs_image = still the branded placeholder; if you can generate images, make one from image_prompt and attach_creative_media.", inputSchema: { type: "object", properties: { ...ev }, required: ["event_id"] }, run: async (a) => (await refreshPrompts(String(a.event_id))).map((c) => ({ creative_id: c.id, kind: c.kind, status: c.status, image_source: c.image_source, needs_image: needsImage(c), image_prompt: c.image_prompt, width: c.width, height: c.height, preview: `${appUrl()}${imageHref(c)}` })) },
  {
    name: "list_approvals",
    description: "Approval requests in the user's society (default: pending), with who must approve each.",
    inputSchema: { type: "object", properties: { status: { type: "string", enum: ["pending", "approved", "executed", "rejected", "failed", "awaiting_faculty", "all"] } } },
    run: async (a, u) =>
      query(
        `SELECT a.id, a.event_id, a.action_type, a.title, a.approver_role, a.approver_department, a.status, a.created_at FROM approval_requests a
         LEFT JOIN events e ON e.id = a.event_id
         WHERE a.society_id = $1 AND ($2 = 'all' OR a.status = $2)
           AND ($3 OR a.requested_by = $4 OR (e.id IS NOT NULL AND ${visibleSql(u, 4)}))
         ORDER BY a.created_at DESC LIMIT 100`,
        [u.society_id, String(a.status ?? "pending"), u.role !== "committee", u.id],
      ),
  },
  { name: "decide_approval", description: "Approve or reject a pending request. Only works if the user has the authority (role check enforced). Always confirm with the user before approving.", inputSchema: { type: "object", properties: { approval_id: str("apr_..."), decision: { type: "string", enum: ["approve", "reject"] }, note: str("Optional note") }, required: ["approval_id", "decision"] }, run: (a, u) => decideApproval(u, String(a.approval_id), a.decision as "approve" | "reject", a.note as string | undefined) },
  {
    name: "run_scheduler",
    description: "Run the society's daily automations now (President/VP): speaker follow-ups, vendor reminders, attendee reminders, 90% spend alerts, feedback surveys. They also run automatically every morning.",
    inputSchema: { type: "object", properties: {} },
    run: async (_, u) => {
      if (!isFinal(u)) throw new Error("Only the President/VP can run the automations manually");
      return runScheduler({ societyId: u.society_id! });
    },
  },
  {
    name: "log_step",
    description: "Record a step you performed outside Movents (e.g. wrote the slide deck, generated a poster) so it appears in the live trace.",
    inputSchema: { type: "object", properties: { run_id: str("Run id"), name: { type: "string", description: "Step name", maxLength: 200 }, tool: { type: "string", description: "Tool used", maxLength: 100 }, status: { type: "string", enum: ["ok", "warn", "fail", "blocked"] }, summary: { type: "string", description: "What happened / result", maxLength: 2000 }, output_url: str("Optional https link to a produced file") }, required: ["run_id", "name", "summary"] },
    run: async (a, user) => {
      const r = await Run.load(String(a.run_id), user);
      if (!r) throw new Error("Run not found");
      const s = await r.record({ name: String(a.name), tool: `assistant → ${String(a.tool ?? "assistant")}`, status: (a.status as StepStatus) ?? "ok", summary: String(a.summary) });
      if (a.output_url && /^https:\/\//i.test(String(a.output_url))) await r.output(String(a.name), String(a.output_url), "external");
      return { recorded: s.id };
    },
  },
  {
    name: "finish_run",
    description: "Mark a run as finished and attach the event's output links to it.",
    inputSchema: { type: "object", properties: { run_id: str("Run id"), summary: str("One-paragraph run summary") }, required: ["run_id"] },
    run: async (a, user) => {
      const r = await Run.load(String(a.run_id), user);
      if (!r) throw new Error("Run not found");
      if (r.eventId) for (const [k, v] of Object.entries(outputs(r.eventId))) await r.output(k.replace(/_/g, " ").replace(/^[a-z]/, (c) => c.toUpperCase()).replace(/ (pdf|docx|xlsx|csv|ics)$/, " (.$1)"), v.replace(appUrl(), "").replace(/\?t=.*$/, ""), k.split("_").pop() ?? "page");
      await r.finish({ summary: a.summary ?? "", event_id: r.eventId });
      return { done: true, trace_url: `${appUrl()}/runs/${r.id}` };
    },
  },
];

/** What AI assistants see: the assistant plans the event itself, calling each tool in turn. */
export const TOOLS = ALL_TOOLS;

const READ_ONLY = new Set([
  "review_brief", "list_society_members", "list_my_events", "list_event_emails", "list_sponsors", "list_meetings", "whoami", "read_sop",
  "check_lead_times", "list_speakers_and_suppliers", "validate_budget", "validate_proposal", "get_outputs", "get_event", "list_creatives", "list_approvals",
]);
/** Tools that reach people or services outside Movents (email, Luma/Meetup, calendars). */
const OPEN_WORLD = new Set([
  "send_sponsor_outreach", "send_speaker_outreach", "request_vendor_quotes", "submit_to_faculty", "push_calendar", "publish_event", "sync_rsvps",
  "decide_approval", "run_scheduler", "attach_creative_media", "request_budget_approval", "request_social_approval",
]);
const DESTRUCTIVE = new Set(["event_team", "draft_budget", "plan_timeline", "generate_risks", "generate_ops_pack", "generate_marketing_kit", "decide_approval"]);

export function annotationsFor(name: string): ToolAnnotations {
  const title = name.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
  const ro = READ_ONLY.has(name);
  return { title, readOnlyHint: ro, destructiveHint: !ro && DESTRUCTIVE.has(name), idempotentHint: ro, openWorldHint: OPEN_WORLD.has(name) };
}

/**
 * The callable version of a tool: arguments are validated against its
 * schema, then every id the caller passes is checked against what they may
 * touch (event team membership, which also scopes to their society).
 */
export function findTool(name: string): Tool | undefined {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) return undefined;
  return {
    ...tool,
    run: async (raw: Args, u: User) => {
      if (!u.society_id) throw new Error("Join or create a society in Movents first");
      const a = validateArgs(tool.inputSchema as Parameters<typeof validateArgs>[0], raw);
      if (a.event_id) await assertMember(u, String(a.event_id));
      if (a.creative_id) await assertMemberOf(u, "creatives", String(a.creative_id));
      if (a.sponsor_id) await assertMemberOf(u, "sponsors", String(a.sponsor_id));
      if (a.meeting_id) await assertMemberOf(u, "meetings", String(a.meeting_id));
      if (Array.isArray(a.sponsor_ids)) for (const sid of a.sponsor_ids) await assertMemberOf(u, "sponsors", String(sid));
      if (a.run_id && !(await Run.load(String(a.run_id), u))) throw new Error("Run not found");
      return tool.run(a, u);
    },
  };
}
