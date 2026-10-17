import "server-only";
import { gemini, type Content } from "../../ai/gemini";
import { fmtDate, fmtRM, today } from "../../appurl";
import { one } from "../../db";
import { findTool, TOOLS } from "../registry";
import { recordName } from "../edits";
import { withAgent } from "../context";
import { Run } from "../run";
import { compact, declaration } from "./loop";
import type { EventRow, User } from "../../types";

/**
 * Movi, the Movents pet: change an existing event by asking ("move it to
 * 5 Dec and raise the budget to RM5,000"). Gemini may read anything about the
 * event, but every change it wants is held back as a proposal the user
 * accepts, edits or refines. Nothing changes until they press Accept.
 */

/** Tools Movi runs straight away: they only read. */
const READ = ["get_event", "list_records", "list_speakers_and_suppliers", "list_sponsors", "list_creatives", "list_meetings", "read_sop", "validate_budget", "validate_proposal", "check_lead_times", "event_team"];
/** Tools Movi may only propose. */
export const WRITE = [
  "update_event",
  "edit_record",
  "add_record",
  "remove_record",
  "draft_budget",
  "plan_timeline",
  "match_venue",
  "generate_risks",
  "add_risks",
  "generate_ops_pack",
  "write_proposal_sections",
  "save_speakers",
  "save_sponsors",
  "update_creative_copy",
  "generate_marketing_kit",
  "schedule_meeting",
  "send_speaker_outreach",
  "send_sponsor_outreach",
  "request_vendor_quotes",
  "request_budget_approval",
  "submit_to_faculty",
];

export type Proposal = { tool: string; args: Record<string, unknown>; label: string; detail?: string };
export type ChatTurn = { role: "user" | "assistant"; text: string };

const SYSTEM = (ev: EventRow, venue: string | null) => `You are Movi, the friendly helper inside Movents, an event planner for university society committees in Malaysia.
You help change ONE existing event: ${ev.title} (${ev.topic ?? ""}), ${ev.date} ${ev.start_time} to ${ev.end_time}, ${ev.pax} pax, budget cap RM${ev.budget_cap}, venue ${venue ?? "not booked"}. Today is ${today()}.
- Read with your tools when you need facts. Never invent people, prices or emails.
- To change anything, call the change tools. They are NOT applied: they become proposals the user accepts. Propose the full set a change needs, in order (for example update_event, then draft_budget after a budget or headcount change; update_event, then plan_timeline and check_lead_times after a date change).
- For one item (a budget line's price or quantity, a supplier's quote, a speaker's email, a risk, a checklist item, an attendee, a task), call list_records to get its id, then edit_record, add_record or remove_record. Prefer these small edits over rebuilding a whole tab, and do not redraft the budget after them unless asked: edited and added lines already count.
- Reply in one to three short, warm sentences: what you propose and why. Plain English, RM for money. If the request is unclear, ask one short question instead of proposing.`;

function label(tool: string, args: Record<string, unknown>, ev: EventRow): { label: string; detail?: string } {
  const title = TOOLS.find((t) => t.name === tool)?.name.replace(/_/g, " ") ?? tool;
  if (tool === "update_event") {
    const fmt = (k: string, v: unknown) => (k === "budget_cap" ? fmtRM(Number(v)) : k === "date" ? fmtDate(String(v)) : String(v));
    const names: Record<string, string> = { budget_cap: "Budget cap", date: "Date", start_time: "Start", end_time: "End", pax: "Expected attendance", title: "Title", topic: "Topic" };
    const rows = Object.keys(names)
      .filter((k) => args[k] != null && args[k] !== "")
      .map((k) => `${names[k]}: ${fmt(k, (ev as unknown as Record<string, unknown>)[k])} → ${fmt(k, args[k])}`);
    return { label: rows.length ? rows.join(" · ") : "Update event details" };
  }
  const short: Record<string, string> = {
    draft_budget: "Redraft the budget to fit the cap",
    plan_timeline: "Re-plan the task timeline from the event date",
    match_venue: "Pick the best free venue again",
    generate_risks: "Rebuild the risk register",
    generate_ops_pack: "Rebuild the run of show and roster",
    generate_marketing_kit: "Regenerate the marketing kit",
    send_speaker_outreach: "Draft speaker invites for you to send",
    send_sponsor_outreach: "Draft sponsor emails for you to send",
    request_vendor_quotes: "Draft supplier quote requests",
    request_budget_approval: "Send the budget for sign-off",
    submit_to_faculty: "Send the proposal to the faculty advisor (after sign-off)",
  };
  if (short[tool]) return { label: short[tool] };
  if (tool === "add_risks") {
    const list = (args.risks as { category?: string; description?: string }[]) ?? [];
    return { label: `Add ${list.length} risk(s)`, detail: list.map((r) => `${r.category}: ${r.description}`).join("\n") };
  }
  if (tool === "write_proposal_sections") {
    const parts = ["overview", "objectives", "outcomes", "audience"].filter((k) => args[k]);
    return { label: `Rewrite the proposal: ${parts.join(", ")}`, detail: parts.map((k) => `${k}: ${Array.isArray(args[k]) ? (args[k] as string[]).join("; ") : String(args[k])}`).join("\n") };
  }
  if (tool === "edit_record" || tool === "add_record" || tool === "remove_record") {
    const what = String(args.kind ?? "item").replace("_", " ");
    const f = (args.fields as Record<string, unknown>) ?? {};
    const rows = Object.entries(f).map(([k, v]) => `${k.replace(/_/g, " ")}: ${["unit_cost", "quote", "unit_price", "offer_amount"].includes(k) ? fmtRM(Number(v)) : String(v)}`);
    const verb = tool === "edit_record" ? "Change" : tool === "add_record" ? "Add" : "Remove";
    const name = String(f.description ?? f.name ?? f.title ?? f.company ?? "");
    return { label: `${verb} ${what}${name && tool !== "edit_record" ? `: ${name}` : ""}`, detail: rows.join("\n") || undefined };
  }
  if (tool === "update_creative_copy") return { label: "Rewrite a post caption", detail: String(args.caption ?? "") };
  if (tool === "schedule_meeting") return { label: `Book "${String(args.title ?? "Team meeting")}" on ${String(args.starts_at ?? "")}` };
  if (tool === "save_speakers") return { label: `Add speaker(s): ${((args.speakers as { name: string }[]) ?? []).map((s) => s.name).join(", ")}` };
  if (tool === "save_sponsors") return { label: `Add sponsor(s): ${((args.sponsors as { company: string }[]) ?? []).map((s) => s.company).join(", ")}` };
  return { label: title[0].toUpperCase() + title.slice(1) };
}

export async function askMovi(user: User, eventId: string, history: ChatTurn[], message: string) {
  const ev = await one<EventRow>("SELECT * FROM events WHERE id = $1", [eventId]);
  if (!ev) throw new Error("Event not found");
  const venue = ev.venue_id ? (await one<{ name: string }>("SELECT name FROM venues WHERE id = $1", [ev.venue_id]))?.name ?? null : null;
  const functions = [...READ, ...WRITE].map(declaration);
  const contents: Content[] = [
    ...history.slice(-8).map((t) => ({ role: t.role === "user" ? ("user" as const) : ("model" as const), parts: [{ text: t.text.slice(0, 2000) }] })),
    { role: "user", parts: [{ text: message.slice(0, 2000) }] },
  ];
  const proposals: Proposal[] = [];
  let model: string | undefined;
  for (let turn = 0; turn < 6; turn++) {
    const r = await gemini({ system: SYSTEM(ev, venue), contents, functions, model, temperature: 0.3 });
    model = r.model;
    contents.push(r.content);
    if (!r.calls.length) return { reply: r.text.trim() || (proposals.length ? "Here is what I would change." : "Sorry, I am not sure what to change."), proposals };
    const replies = [];
    for (const call of r.calls) {
      let response: Record<string, unknown>;
      if (WRITE.includes(call.name)) {
        const p: Proposal = { tool: call.name, args: call.args, ...label(call.name, call.args, ev) };
        if ((call.name === "edit_record" || call.name === "remove_record") && call.args.id) {
          const name = await recordName(call.args.kind, String(call.args.id)).catch(() => null);
          if (name) p.label = `${p.label}: ${name}`;
        }
        proposals.push(p);
        response = { result: "Proposed. It will run if the user accepts. Do not call it again." };
      } else if (READ.includes(call.name)) {
        try {
          response = { result: await findTool(call.name)!.run({ ...call.args, event_id: eventId }, user) };
        } catch (err) {
          response = { error: err instanceof Error ? err.message : String(err) };
        }
      } else response = { error: `Tool ${call.name} is not available` };
      replies.push({ functionResponse: { ...(call.id ? { id: call.id } : {}), name: call.name, response: compact(response) as Record<string, unknown> } });
    }
    contents.push({ role: "user", parts: replies });
  }
  return { reply: "Here is what I would change.", proposals };
}

/**
 * Run the proposals the user accepted, in order, as the user, with the usual
 * membership and role checks. Outreach becomes drafts and money waits for
 * sign-off, as with every AI action. Recorded as a run, so it shows in the trace.
 */
export async function applyProposals(user: User, eventId: string, accepted: Proposal[], request: string) {
  const list = accepted.filter((p) => WRITE.includes(p.tool)).slice(0, 12);
  if (!list.length) throw new Error("Nothing to apply");
  const run = await Run.start(user, `Movi: ${request}`.slice(0, 400), "custom", "gemini");
  await run.setEvent(eventId);
  const results: { label: string; ok: boolean; detail?: string }[] = [];
  await withAgent({ run, label: "Gemini · Movi", requireApproval: true }, async () => {
    for (const p of list) {
      try {
        await findTool(p.tool)!.run({ ...p.args, event_id: eventId, run_id: run.id }, user);
        results.push({ label: p.label, ok: true });
      } catch (err) {
        results.push({ label: p.label, ok: false, detail: err instanceof Error ? err.message : String(err) });
      }
    }
  });
  await run.finish({ event_id: eventId, summary: `Applied ${results.filter((r) => r.ok).length} of ${results.length} change(s) from Movi`, applied: results });
  return { run_id: run.id, results };
}
