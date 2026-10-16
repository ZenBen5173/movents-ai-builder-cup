"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown, FileText, FileType, Loader2, Sparkles, Upload, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/**
 * Your society's own forms. Upload a template once (Word, PDF or text);
 * Gemini fills a copy for this event from everything Movents knows and marks
 * what you still have to add.
 */

export type TemplateRow = { id: string; name: string; kind: string };
export type FilledRow = { id: string; template: string; gaps: string[]; created_at: string };

const KINDS: [string, string][] = [
  ["pre_event", "Pre-event proposal"],
  ["post_event", "Post-event report"],
  ["speaker_profile", "Speaker profile"],
  ["risk", "Risk and mitigation list"],
  ["other", "Other form"],
];
const KIND_LABEL = Object.fromEntries(KINDS);

export function TemplatesPanel({ eventId, templates, filled }: { eventId: string; templates: TemplateRow[]; filled: FilledRow[] }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState("pre_event");
  const [drag, setDrag] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [filling, setFilling] = useState<string | null>(null);
  const [openGaps, setOpenGaps] = useState<string | null>(filled[0]?.id ?? null);

  async function upload(body: FormData) {
    setUploading(true);
    try {
      const res = await fetch("/api/society-templates", { method: "POST", body });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Upload failed");
      toast.success(`${json.name} saved to your society's templates`);
      router.refresh();
      return json.id as string;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
      return null;
    } finally {
      setUploading(false);
    }
  }

  async function uploadFile(file: File) {
    const f = new FormData();
    f.set("file", file);
    f.set("kind", kind);
    await upload(f);
  }

  async function trySample(sample: "pre_event" | "post_event") {
    const f = new FormData();
    f.set("sample", sample);
    const id = await upload(f);
    if (id) await fill(id);
  }

  async function fill(templateId: string) {
    setFilling(templateId);
    try {
      const res = await fetch("/api/society-templates/fill", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ template_id: templateId, event_id: eventId }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not fill the template");
      toast.success(json.gaps.length ? `Filled. ${json.gaps.length} thing(s) left for you to add.` : "Filled, nothing left to add.");
      setOpenGaps(json.id);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not fill the template");
    } finally {
      setFilling(null);
    }
  }

  return (
    <section className="mb-8">
      <div className="mb-3 flex items-end justify-between border-b-[1.5px] border-ink pb-2">
        <h2 className="flex items-center gap-2 font-display text-xl font-bold">
          <Wand2 className="size-4 text-tomato" /> Your society&apos;s forms
        </h2>
        <span className="mono-label text-[10px] text-muted-foreground">Gemini fills them from this event</span>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <div>
          <motion.div
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              const f = e.dataTransfer.files?.[0];
              if (f) uploadFile(f);
            }}
            animate={{ scale: drag ? 1.01 : 1 }}
            className={cn("rounded-xl border-[1.5px] border-dashed p-4 transition-colors", drag ? "border-tomato bg-peach/40" : "border-ink/25 bg-card")}
          >
            <div className="flex flex-wrap items-center gap-2">
              <select value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Template type" className="h-9 rounded-lg border-[1.5px] border-ink/20 bg-background px-2 text-sm outline-none focus:border-ink">
                {KINDS.map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
              <motion.button
                type="button"
                whileTap={{ scale: 0.95 }}
                whileHover={{ y: -1 }}
                disabled={uploading}
                onClick={() => input.current?.click()}
                className="flex h-9 items-center gap-1.5 rounded-lg border-[1.5px] border-ink bg-tomato px-3 text-sm font-semibold shadow-[2px_2px_0_0_#161514] disabled:opacity-40"
              >
                {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />} Upload template
              </motion.button>
              <input
                ref={input}
                type="file"
                accept=".docx,.pdf,.txt,.md"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) uploadFile(f);
                  e.target.value = "";
                }}
              />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">Drop a Word, PDF or text form here. Upload once; use it for every event.</p>
            <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
              <span className="text-muted-foreground">No template to hand? Try:</span>
              {(["pre_event", "post_event"] as const).map((s) => (
                <button key={s} type="button" disabled={uploading || Boolean(filling)} onClick={() => trySample(s)} className="rounded-full border-[1.5px] border-ink/20 px-2.5 py-0.5 text-ink/70 transition-colors hover:border-ink hover:text-ink disabled:opacity-40">
                  Sample {s === "pre_event" ? "pre-event proposal" : "post-event report"}
                </button>
              ))}
            </div>
          </motion.div>

          {templates.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {templates.map((t, i) => (
                <motion.li key={t.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0, transition: { delay: i * 0.03 } }} className="group flex items-center gap-2 rounded-xl border-[1.5px] border-ink/15 bg-card px-3 py-2 transition-colors hover:border-ink">
                  <FileText className="size-4 shrink-0 text-ink/50" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{t.name}</span>
                    <span className="text-[11px] text-muted-foreground">{KIND_LABEL[t.kind] ?? t.kind}</span>
                  </span>
                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.95 }}
                    disabled={Boolean(filling)}
                    onClick={() => fill(t.id)}
                    className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg border-[1.5px] border-ink px-2.5 text-xs font-semibold transition-colors hover:bg-ink hover:text-white disabled:opacity-40"
                  >
                    {filling === t.id ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
                    {filling === t.id ? "Filling…" : "Fill for this event"}
                  </motion.button>
                </motion.li>
              ))}
            </ul>
          )}
        </div>

        <div>
          {filled.length === 0 ? (
            <div className="grid h-full min-h-[120px] place-items-center rounded-xl border-[1.5px] border-ink/10 bg-sand/30 p-4 text-center text-sm text-muted-foreground">
              Filled forms appear here, ready to download as Word or PDF.
            </div>
          ) : (
            <ul className="space-y-2">
              <AnimatePresence initial={false}>
                {filled.map((f) => (
                  <motion.li key={f.id} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="rounded-xl border-[1.5px] border-ink bg-card p-3">
                    <div className="flex items-center gap-2">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{f.template}</span>
                        <span className="text-[11px] text-muted-foreground">Filled {new Date(f.created_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                      </span>
                      <a href={`/api/society-templates/filled/${f.id}/doc.docx`} className="flex h-8 items-center gap-1 rounded-lg border-[1.5px] border-ink/20 px-2 text-xs font-medium transition-colors hover:border-ink">
                        <FileType className="size-3.5" /> Word
                      </a>
                      <a href={`/api/society-templates/filled/${f.id}/doc.pdf`} target="_blank" className="flex h-8 items-center gap-1 rounded-lg border-[1.5px] border-ink/20 px-2 text-xs font-medium transition-colors hover:border-ink">
                        <FileText className="size-3.5" /> PDF
                      </a>
                    </div>
                    {f.gaps.length > 0 && (
                      <div className="mt-2">
                        <button type="button" onClick={() => setOpenGaps(openGaps === f.id ? null : f.id)} className="flex items-center gap-1 text-xs font-semibold text-tomato-ink">
                          {f.gaps.length} thing(s) for you to fill in
                          <ChevronDown className={cn("size-3.5 transition-transform", openGaps === f.id && "rotate-180")} />
                        </button>
                        <AnimatePresence initial={false}>
                          {openGaps === f.id && (
                            <motion.ul initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="mt-1 list-disc space-y-0.5 overflow-hidden pl-5 text-xs text-ink/75">
                              {f.gaps.map((g) => (
                                <li key={g}>{g}</li>
                              ))}
                            </motion.ul>
                          )}
                        </AnimatePresence>
                      </div>
                    )}
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
