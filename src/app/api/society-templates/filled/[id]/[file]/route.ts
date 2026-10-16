import { NextResponse } from "next/server";
import { one } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { isMember } from "@/lib/members";
import { renderDocx, renderPdf, type DocModel } from "@/lib/docs/render";

export const dynamic = "force-dynamic";

/** A filled template as Word (doc.docx) or PDF (doc.pdf), for the event's team. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; file: string }> }) {
  const { id, file } = await params;
  const user = await currentUser();
  const row = await one<{ event_id: string; doc: DocModel }>("SELECT event_id, doc FROM filled_templates WHERE id = $1", [id]);
  if (!user || !row || !(await isMember(user, row.event_id))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const ext = file.split(".").pop();
  if (ext !== "docx" && ext !== "pdf") return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = ext === "docx" ? await renderDocx(row.doc) : await renderPdf(row.doc);
  const slug = row.doc.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "filled";
  return new NextResponse(new Uint8Array(body), {
    headers: {
      "content-type": ext === "docx" ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" : "application/pdf",
      "content-disposition": `${ext === "pdf" ? "inline" : "attachment"}; filename="${slug}.${ext}"`,
      "cache-control": "private, no-store",
    },
  });
}
