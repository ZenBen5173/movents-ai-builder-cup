import { revalidatePath } from "next/cache";
import { id as newId, query } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { assertMember } from "@/lib/members";
import { audit } from "@/lib/audit";
import { rateLimit } from "@/lib/ratelimit";
import { handle } from "@/lib/server/http";

const MAX_BYTES = 10 * 1024 * 1024;

/** Upload a document to the event's Files tab (multipart: file). Everyone on the event can open it. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id: eventId } = await params;
    const user = await requireUser();
    await assertMember(user, eventId);
    await rateLimit(`event-file:${user.id}`, 60, 3600);
    const file = (await req.formData()).get("file");
    if (!(file instanceof File) || !file.size) throw new Error("Choose a file to upload");
    if (file.size > MAX_BYTES) throw new Error("Files can be up to 10 MB");
    const name = file.name.replace(/[\\/\0]/g, "_").slice(0, 160) || "file";
    const fileId = newId("fil");
    await query("INSERT INTO event_files (id, event_id, name, mime, size, data, uploaded_by) VALUES ($1, $2, $3, $4, $5, $6, $7)", [
      fileId, eventId, name, file.type || "application/octet-stream", file.size, Buffer.from(await file.arrayBuffer()), user.id,
    ]);
    await audit(user, "file.uploaded", { name, size: file.size }, { eventId });
    revalidatePath(`/events/${eventId}/outputs`);
    return { id: fileId, name };
  });
}
