import "server-only";
import { gemini, geminiJson } from "../../ai/gemini";
import { fmtDate, fmtRM } from "../../appurl";
import { id, insert, one } from "../../db";
import { audit } from "../../audit";
import { budgetTotals, loadBundle, proposalText, reportData } from "../../docs/builders";
import { docxText } from "../../docs/extract";
import type { Block, DocModel } from "../../docs/render";
import type { User } from "../../types";

/**
 * A society's own templates (pre-event proposal, post-event report, speaker
 * profile, risk list...). Upload once; Gemini fills a copy for any event from
 * what Movents knows, keeps the template's headings and order, and marks
 * whatever only a human can supply as "[To fill in: ...]".
 */

export const TEMPLATE_KINDS: Record<string, string> = {
  pre_event: "Pre-event proposal",
  post_event: "Post-event report",
  speaker_profile: "Speaker profile",
  risk: "Risk and mitigation list",
  other: "Other form",
};

const MAX_BYTES = 5 * 1024 * 1024;

/** Typical society forms, so the feature can be tried without a file of your own. */
export const SAMPLE_TEMPLATES: Record<string, { name: string; kind: string; text: string }> = {
  pre_event: {
    name: "Pre-Event Proposal Form (sample)",
    kind: "pre_event",
    text: `STUDENT ACTIVITY PRE-EVENT PROPOSAL FORM
Section A: Event Details
Name of Society:
Event Title:
Date / Time:
Venue:
Expected Number of Participants:
Section B: Event Background and Objectives
Background (why this event, why now):
Objectives (at least three, measurable):
Expected Outcomes for Participants:
Section C: Programme Tentative
Time | Activity | Person in Charge
Section D: External Speakers / Guests
Name | Organisation | Topic | Declaration submitted (Yes/No)
Section E: Budget
Item | Quantity | Unit Price (RM) | Total (RM) | Source of Funds
Total Estimated Expenditure (RM):
Section F: Risk Assessment
Risk | Likelihood | Impact | Mitigation
Section G: Organising Committee
Position | Name | Contact Number
Section H: Endorsement
Prepared by (Name, Signature, Date):
President (Name, Signature, Date):
Faculty Advisor (Name, Signature, Date):`,
  },
  post_event: {
    name: "Post-Event Report Form (sample)",
    kind: "post_event",
    text: `POST-EVENT REPORT
1. Event Summary (title, date, venue, organiser)
2. Attendance: registered vs actual, show rate
3. Programme as delivered (changes from the plan)
4. Financial Report
Item | Budgeted (RM) | Actual (RM) | Variance (RM)
5. Participant Feedback (satisfaction score, main comments)
6. Issues Faced and How They Were Handled
7. Lessons Learned and Recommendations for Next Time
8. Claims and Receipts Submitted (Yes/No, date)
9. Photos / Evidence (attach)
Prepared by (Name, Signature, Date):
Verified by Faculty Advisor (Name, Signature, Date):`,
  },
};

/** Turn an upload into the template's text: Word and text files are read here; PDFs are read by Gemini. */
export async function importTemplate(user: User, file: { name: string; type: string; bytes: Buffer }, kind: string, name?: string) {
  if (!user.society_id) throw new Error("Join a society first");
  if (file.bytes.length > MAX_BYTES) throw new Error("Templates can be up to 5 MB");
  const lower = file.name.toLowerCase();
  let text: string;
  if (lower.endsWith(".docx")) text = docxText(file.bytes);
  else if (lower.endsWith(".txt") || lower.endsWith(".md")) text = file.bytes.toString("utf8");
  else if (lower.endsWith(".pdf") || file.type === "application/pdf") {
    const r = await gemini({
      contents: [
        {
          role: "user",
          parts: [
            { inlineData: { mimeType: "application/pdf", data: file.bytes.toString("base64") } },
            { text: "This is a blank or example form a student society must fill in. Write out its structure as plain text: every heading, field label, table header and instruction, in order, one per line. Keep any example wording. No commentary." },
          ],
        },
      ],
      temperature: 0,
    });
    text = r.text;
  } else throw new Error("Upload a Word (.docx), PDF or text file");
  text = text.trim().slice(0, 30_000);
  if (text.length < 20) throw new Error("That file looks empty, nothing to fill in");
  const row = await insert<{ id: string; name: string; kind: string }>("society_templates", {
    id: id("tpl"),
    society_id: user.society_id,
    kind: TEMPLATE_KINDS[kind] ? kind : "other",
    name: (name?.trim() || file.name.replace(/\.[a-z0-9]+$/i, "")).slice(0, 120),
    filename: file.name.slice(0, 200),
    text,
    uploaded_by: user.id,
  });
  await audit(user, "template.uploaded", { name: row.name, kind: row.kind });
  return row;
}

/** What Movents knows about the event, compact enough for one prompt. */
async function facts(eventId: string) {
  const b = await loadBundle(eventId);
  if (!b) throw new Error("Event not found");
  const t = budgetTotals(b.lines, b.university?.sop.budget_rules.contingency_pct ?? 10);
  const written = proposalText(b.event);
  const report = b.rsvps.length || b.feedback.length ? reportData(b) : null;
  return {
    event: { title: b.event.title, topic: b.event.topic, date: fmtDate(b.event.date), time: `${b.event.start_time} to ${b.event.end_time}`, expected_attendance: b.event.pax, budget_cap: fmtRM(b.event.budget_cap), status: b.event.status },
    organiser: { society: b.society?.name, university: b.university?.name },
    venue: b.venue ? { name: b.venue.name, location: b.venue.location, capacity: b.venue.capacity } : null,
    proposal_text: written,
    committee: b.users.filter((u) => u.role !== "faculty_advisor").map((u) => ({ name: u.name, role: u.role, department: u.department, phone: u.phone })),
    faculty_advisor: b.users.find((u) => u.role === "faculty_advisor")?.name ?? null,
    speakers: b.speakers.map((s) => ({ name: s.name, headline: s.headline, source: s.source_url, status: s.status, email: s.email, sample: s.source === "sample" })),
    budget: { lines: b.lines.map((l) => ({ category: l.category, item: l.description, qty: l.qty, unit_rm: l.unit_cost, estimate_rm: l.estimated, funding: l.funding_source })), subtotal: t.subtotal, contingency: t.contingency, total: t.total },
    risks: b.risks.slice(0, 15).map((r) => ({ category: r.category, risk: r.description, likelihood: r.likelihood, impact: r.impact, mitigation: r.mitigation, contingency: r.contingency })),
    programme: b.runsheet.map((r) => `${r.start_time}-${r.end_time} ${r.activity} (${r.owner})`).filter((x, i, a) => a.indexOf(x) === i).slice(0, 40),
    milestones: b.tasks.filter((x) => x.sop_ref || x.phase !== "concept").slice(0, 20).map((x) => `${fmtDate(x.due_date)} ${x.title}`),
    publicity: b.promo.map((p) => `${p.channel}: ${p.title} (due ${fmtDate(p.due_date)})`),
    attendance_and_feedback: report,
  };
}

const BLOCK = {
  type: "object",
  properties: {
    type: { type: "string", enum: ["p", "bullets", "table"] },
    text: { type: "string" },
    items: { type: "array", items: { type: "string" } },
    head: { type: "array", items: { type: "string" } },
    rows: { type: "array", items: { type: "array", items: { type: "string" } } },
  },
  required: ["type"],
};
const SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    sections: { type: "array", items: { type: "object", properties: { title: { type: "string" }, blocks: { type: "array", items: BLOCK } }, required: ["title", "blocks"] } },
    gaps: { type: "array", items: { type: "string" }, description: "What a human still has to fill in" },
  },
  required: ["title", "sections", "gaps"],
};

type Filled = { title: string; sections: { title: string; blocks: { type: string; text?: string; items?: string[]; head?: string[]; rows?: string[][] }[] }[]; gaps: string[] };

/** Fill one template for one event. Returns the saved copy's id and the gaps left for a human. */
export async function fillTemplate(user: User, templateId: string, eventId: string) {
  const tpl = await one<{ id: string; society_id: string; kind: string; name: string; text: string }>("SELECT * FROM society_templates WHERE id = $1", [templateId]);
  if (!tpl || tpl.society_id !== user.society_id) throw new Error("Template not found");
  const known = await facts(eventId);
  const { data } = await geminiJson<Filled>({
    system: `You fill in a student society's own ${TEMPLATE_KINDS[tpl.kind] ?? "form"} for one event, as the committee would.
- Keep the template's headings, field labels, tables and order exactly; fill each part.
- Use ONLY the facts given. Never invent names, numbers, quotes, signatures or dates.
- The event block is the current truth: if older proposal text disagrees (a budget, date or headcount that has since changed), use the event block.
- Keep each field label from the template (e.g. "Objectives:") and put the answer under it.
- Where the facts do not cover something (a signature, a bank account, actual attendance before the event, a speaker's bio you were not given), write "[To fill in: what is needed]" in that spot and list it in gaps.
- Speakers marked sample are placeholders: say "[To fill in: confirmed speaker]" instead of using their names.
- Plain British English, RM for money, short paragraphs. Use a table where the template has one.`,
    prompt: `TEMPLATE (structure to keep):\n"""\n${tpl.text}\n"""\n\nFACTS ABOUT THE EVENT (JSON):\n${JSON.stringify(known)}`,
    schema: SCHEMA,
    temperature: 0.2,
  });
  const doc: DocModel = {
    title: data.title || `${tpl.name}, ${known.event.title}`,
    subtitle: `${known.organiser.society ?? ""} · ${known.event.date} · filled by Gemini from Movents, check every "[To fill in]" before submitting`,
    sections: (data.sections ?? []).slice(0, 40).map((s) => ({ title: String(s.title ?? "").slice(0, 200), blocks: (s.blocks ?? []).map(toBlock).filter((b): b is Block => b !== null) })),
    footer: `Template: ${tpl.name}. Generated ${new Date().toISOString().slice(0, 10)}.`,
  };
  const gaps = (data.gaps ?? []).map((g) => String(g).slice(0, 300)).slice(0, 30);
  const row = await insert<{ id: string }>("filled_templates", { id: id("fil"), event_id: eventId, template_id: tpl.id, doc, gaps, created_by: user.id });
  await audit(user, "template.filled", { template: tpl.name, gaps: gaps.length }, { eventId });
  return { id: row.id, gaps, sections: doc.sections.length };
}

function toBlock(b: Filled["sections"][number]["blocks"][number]): Block | null {
  if (b.type === "bullets" && b.items?.length) return { type: "bullets", items: b.items.map(String) };
  if (b.type === "table" && b.head?.length) {
    const cols = b.head.length;
    return { type: "table", head: b.head.map(String), rows: (b.rows ?? []).map((r) => Array.from({ length: cols }, (_, i) => String(r[i] ?? ""))) };
  }
  if (b.text?.trim()) return { type: "p", text: b.text.trim() };
  return null;
}
