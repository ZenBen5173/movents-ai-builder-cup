import { NextResponse } from "next/server";
import { one } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { isMember } from "@/lib/members";
import { renderPdf, type Block, type DocModel } from "@/lib/docs/render";
import { fmtWhen, getMeeting, minutesMarkdown, teamNames, type Meeting } from "@/lib/meetings";

export const dynamic = "force-dynamic";

/** "## Heading" and "- bullet" lines from the minutes editor, as document blocks. */
function minutesBlocks(text: string): Block[] {
  const out: Block[] = [];
  let bullets: string[] = [];
  const flush = () => {
    if (bullets.length) out.push({ type: "bullets", items: bullets });
    bullets = [];
  };
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) {
      flush();
      continue;
    }
    if (/^[-*]\s+/.test(line)) {
      bullets.push(line.replace(/^[-*]\s+/, ""));
      continue;
    }
    flush();
    if (/^#{1,6}\s+/.test(line)) out.push({ type: "p", text: line.replace(/^#{1,6}\s+/, ""), bold: true });
    else out.push({ type: "p", text: line });
  }
  flush();
  return out;
}

function minutesDoc(m: Meeting, eventTitle: string, names: Record<string, string>): DocModel {
  const name = (x: string | null | undefined) => (x ? names[x] ?? x : "");
  const came = m.attended.length ? m.attendees.filter((a) => m.attended.includes(a)) : m.attendees;
  const away = m.attended.length ? m.attendees.filter((a) => !m.attended.includes(a)) : [];
  const sections: DocModel["sections"] = [];
  if (m.agenda.length) sections.push({ title: "Agenda", blocks: [{ type: "table", head: ["Item", "Owner", "Min", "Covered"], rows: m.agenda.map((a) => [a.item, name(a.owner), a.minutes ?? "", a.done ? "Yes" : ""]) }] });
  if (m.minutes?.trim()) sections.push({ title: "Minutes", blocks: minutesBlocks(m.minutes) });
  if (m.decisions.length) sections.push({ title: "Decisions", blocks: [{ type: "bullets", items: m.decisions }] });
  if (m.action_items.length) sections.push({ title: "Action items", blocks: [{ type: "table", head: ["Action", "Owner", "Due", "Status"], rows: m.action_items.map((a) => [a.text, name(a.owner_id), a.due_date ?? "", a.done ? "Done" : a.task_id ? "Task" : "Open"]) }] });
  return {
    title: m.title,
    subtitle: eventTitle,
    meta: [
      ["When", fmtWhen(m.starts_at, m.duration_min)],
      ["Where", m.location || m.meeting_url || "TBC"],
      ["Present", came.map(name).join(", ") || "Not recorded"],
      ...(away.length ? ([["Absent", away.map(name).join(", ")]] as [string, string][]) : []),
    ],
    sections,
    footer: "Minutes from Movents",
  };
}

/** Minutes as Markdown (?format=md, default) or PDF (?format=pdf). Team only. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const m = await getMeeting(id);
  if (!m || !(await isMember(user, m.event_id))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const ev = await one<{ title: string }>("SELECT title FROM events WHERE id = $1", [m.event_id]);
  const names = await teamNames(m.event_id);
  const slug = `${m.title}-minutes`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  if (new URL(req.url).searchParams.get("format") === "pdf") {
    const pdf = await renderPdf(minutesDoc(m, ev?.title ?? "", names));
    return new NextResponse(new Uint8Array(pdf), { headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="${slug}.pdf"`, "cache-control": "no-store" } });
  }
  const md = minutesMarkdown(m, { eventTitle: ev?.title, names });
  return new NextResponse(md, { headers: { "content-type": "text/markdown; charset=utf-8", "content-disposition": `attachment; filename="${slug}.md"`, "cache-control": "no-store" } });
}
