import { requireUser } from "@/lib/session";
import { handle } from "@/lib/server/http";
import { rateLimit } from "@/lib/ratelimit";
import { importTemplate, SAMPLE_TEMPLATES } from "@/lib/agent/gemini/templates";

export const maxDuration = 120;

/** Upload one of the society's templates (multipart: file, kind, name). */
export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser();
    await rateLimit(`template-upload:${user.id}`, 30, 3600);
    const form = await req.formData();
    const sample = SAMPLE_TEMPLATES[String(form.get("sample") ?? "")];
    if (sample) {
      const row = await importTemplate(user, { name: `${sample.name}.txt`, type: "text/plain", bytes: Buffer.from(sample.text) }, sample.kind, sample.name);
      return { id: row.id, name: row.name, kind: row.kind };
    }
    const file = form.get("file");
    if (!(file instanceof File)) throw new Error("Choose a file to upload");
    const row = await importTemplate(user, { name: file.name, type: file.type, bytes: Buffer.from(await file.arrayBuffer()) }, String(form.get("kind") ?? "other"), String(form.get("name") ?? ""));
    return { id: row.id, name: row.name, kind: row.kind };
  });
}
