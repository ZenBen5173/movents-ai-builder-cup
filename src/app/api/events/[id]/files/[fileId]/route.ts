import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { one, query } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { assertMember } from "@/lib/members";
import { audit } from "@/lib/audit";
import { handle } from "@/lib/server/http";

type Row = { name: string; mime: string; data: Uint8Array };
// Shown in the browser; anything else downloads. Never HTML or SVG inline (they could run script).
const INLINE = /^(application\/pdf|image\/(png|jpeg|gif|webp)|text\/plain)$/;

/** Open or download an uploaded file. Only people on the event can. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; fileId: string }> }) {
  const { id: eventId, fileId } = await params;
  try {
    const user = await requireUser();
    await assertMember(user, eventId);
  } catch {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }
  const f = await one<Row>("SELECT name, mime, data FROM event_files WHERE id = $1 AND event_id = $2", [fileId, eventId]);
  if (!f) return NextResponse.json({ error: "File not found" }, { status: 404 });
  const inline = INLINE.test(f.mime);
  return new NextResponse(Buffer.from(f.data), {
    headers: {
      "content-type": inline ? f.mime : "application/octet-stream",
      "content-disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(f.name)}`,
      "x-content-type-options": "nosniff",
      "cache-control": "private, no-store",
    },
  });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; fileId: string }> }) {
  return handle(async () => {
    const { id: eventId, fileId } = await params;
    const user = await requireUser();
    await assertMember(user, eventId);
    const f = await one<{ name: string }>("SELECT name FROM event_files WHERE id = $1 AND event_id = $2", [fileId, eventId]);
    if (!f) throw new Error("File not found");
    await query("DELETE FROM event_files WHERE id = $1", [fileId]);
    await audit(user, "file.deleted", { name: f.name }, { eventId });
    revalidatePath(`/events/${eventId}/outputs`);
    return { ok: true };
  });
}
