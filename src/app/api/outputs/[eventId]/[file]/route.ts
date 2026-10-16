import { NextResponse } from "next/server";
import { loadBundle, proposalDoc, reportDoc, riskDoc, runsheetDoc, speakerDoc } from "@/lib/docs/builders";
import { renderDocx, renderPdf } from "@/lib/docs/render";
import { budgetCsv, budgetXlsx, riskXlsx } from "@/lib/docs/xlsx";
import { icsForEvent } from "@/lib/actions";
import { verifyToken } from "@/lib/appurl";
import { currentUser } from "@/lib/session";
import { isMember } from "@/lib/members";

export const dynamic = "force-dynamic";

const TYPES: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: "text/csv; charset=utf-8",
  ics: "text/calendar; charset=utf-8",
};

/**
 * Every output is rendered on request from the live database, so a link in an
 * email or in the agent trace always opens the current version.
 * Readable by the event's team, or with a signed link (faculty advisors,
 * sponsors and calendar subscriptions open them without an account).
 */
export async function GET(req: Request, { params }: { params: Promise<{ eventId: string; file: string }> }) {
  const { eventId, file } = await params;
  // A signed link opens exactly the file it was made for.
  const signed = verifyToken(`outputs:${eventId}:${file}`, new URL(req.url).searchParams.get("t"));
  if (!signed) {
    const user = await currentUser();
    if (!user || !(await isMember(user, eventId))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const [name, ext] = file.split(".");
  if (name === "timeline" && ext === "ics") {
    const ics = await icsForEvent(eventId);
    if (!ics) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return new NextResponse(ics, { headers: { "content-type": TYPES.ics, "content-disposition": `inline; filename="${eventId}-timeline.ics"` } });
  }
  const b = await loadBundle(eventId);
  if (!b) return NextResponse.json({ error: "Event not found" }, { status: 404 });
  let body: Buffer | string | null = null;
  if (name === "proposal" && ext === "pdf") body = await renderPdf(proposalDoc(b));
  if (name === "proposal" && ext === "docx") body = await renderDocx(proposalDoc(b));
  if (name === "report" && ext === "pdf") body = await renderPdf(reportDoc(b));
  if (name === "report" && ext === "docx") body = await renderDocx(reportDoc(b));
  if (name === "risks" && ext === "pdf") body = await renderPdf(riskDoc(b));
  if (name === "risks" && ext === "xlsx") body = await riskXlsx(b);
  if (name === "runsheet" && ext === "pdf") body = await renderPdf(runsheetDoc(b));
  if (name === "runsheet" && ext === "docx") body = await renderDocx(runsheetDoc(b));
  if (name === "budget" && ext === "xlsx") body = await budgetXlsx(b);
  if (name === "budget" && ext === "csv") body = budgetCsv(b);
  if (name.startsWith("speaker-")) {
    const doc = speakerDoc(b, name.slice(8));
    if (doc) body = ext === "docx" ? await renderDocx(doc) : await renderPdf(doc);
  }
  if (body === null) return NextResponse.json({ error: `Unknown output ${file}` }, { status: 404 });
  const slug = b.event.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const download = new URL(req.url).searchParams.has("download");
  return new NextResponse(typeof body === "string" ? body : new Uint8Array(body), {
    headers: {
      "content-type": TYPES[ext] ?? "application/octet-stream",
      "content-disposition": `${download || ext === "docx" || ext === "xlsx" ? "attachment" : "inline"}; filename="${slug}-${name}.${ext}"`,
      "cache-control": "no-store",
    },
  });
}
