import { NextResponse } from "next/server";
import { one } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { blankTemplateDoc } from "@/lib/docs/builders";
import { renderDocx, renderPdf } from "@/lib/docs/render";
import { templatesOf } from "@/lib/templates";
import type { University } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Blank university template as Word or PDF: /api/templates/<uniId>/<templateKey>.docx */
export async function GET(_: Request, { params }: { params: Promise<{ uniId: string; file: string }> }) {
  if (!(await currentUser())) return NextResponse.json({ error: "Sign in to download templates" }, { status: 401 });
  const { uniId, file } = await params;
  const [key, ext] = file.split(".");
  const uni = await one<University>("SELECT * FROM universities WHERE id = $1", [uniId]);
  const tpl = uni ? templatesOf(uni.sop).find((t) => t.key === key) : null;
  if (!uni || !tpl) return NextResponse.json({ error: "Template not found" }, { status: 404 });
  const doc = blankTemplateDoc(uni.name, tpl);
  const body = ext === "pdf" ? await renderPdf(doc) : await renderDocx(doc);
  const type = ext === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  return new NextResponse(new Uint8Array(body), { headers: { "content-type": type, "content-disposition": `${ext === "pdf" ? "inline" : "attachment"}; filename="${uni.short_name.replace(/[^\w-]+/g, "_")}-${key.replace(/[^\w-]+/g, "_")}.${ext === "pdf" ? "pdf" : "docx"}"` } });
}
