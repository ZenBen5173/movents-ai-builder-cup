"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown, FileDown, Plus } from "lucide-react";
import { toast } from "sonner";
import { saveTemplate } from "@/app/actions";
import { KIND_LABEL, parseSections, type SopTemplate } from "@/lib/templates";
import { DocPreview } from "./doc-preview";
import { cn } from "@/lib/utils";
import { Pill } from "./ui";

const asText = (t: SopTemplate) => t.sections.map((s) => (s.hint ? `${s.title}: ${s.hint}` : s.title)).join("\n");

function TemplateRow({ t, uniId, uniName, canEdit }: { t: SopTemplate; uniId: string; uniName: string; canEdit: boolean }) {
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState(false);
  const [text, setText] = useState(asText(t));
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <li className="border-b border-border">
      <div className="flex items-center gap-3 py-3">
        <button onClick={() => setOpen((o) => !o)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
          <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
          <span className="truncate font-medium">{t.title}</span>
          {t.title.toLowerCase() !== KIND_LABEL[t.kind].toLowerCase() && <Pill status={t.kind === "pre_event" ? "pending_approval" : t.kind === "post_event" ? "completed" : t.kind === "speaker_profile" ? "contacted" : "draft"} label={KIND_LABEL[t.kind]} />}
          <span className="font-mono text-xs text-muted-foreground">{t.sections.length}</span>
        </button>
        <a href={`/api/templates/${uniId}/${t.key}.docx`} className="inline-flex h-8 items-center gap-1 rounded-lg border-[1.5px] border-ink/20 px-2.5 text-xs hover:border-ink"><FileDown className="size-3.5" />.docx</a>
        <a href={`/api/templates/${uniId}/${t.key}.pdf`} target="_blank" className="inline-flex h-8 items-center rounded-lg border-[1.5px] border-ink/20 px-2.5 text-xs hover:border-ink">.pdf</a>
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="grid gap-6 pb-6 pl-7 md:grid-cols-[1fr_300px]">
              <div>
              {edit ? (
                <div className="space-y-2">
                  <textarea value={text} onChange={(e) => setText(e.target.value)} rows={Math.max(6, t.sections.length + 1)} className="w-full rounded-lg border-[1.5px] border-ink/20 bg-card p-2.5 font-mono text-xs outline-none focus:border-ink" />
                  <div className="flex gap-2">
                    <button
                      disabled={pending}
                      onClick={() =>
                        start(async () => {
                          const r = await saveTemplate(uniId, t.kind, t.title, text, t.key);
                          if (!r.ok) return void toast.error(r.error);
                          toast.success("Saved");
                          setEdit(false);
                          router.refresh();
                        })
                      }
                      className="h-8 rounded-lg bg-tomato px-3 text-xs font-semibold"
                    >
                      Save
                    </button>
                    <button onClick={() => { setText(asText(t)); setEdit(false); }} className="h-8 rounded-lg px-3 text-xs hover:bg-sand">Cancel</button>
                  </div>
                </div>
              ) : (
                <>
                  <ol className="space-y-1">
                    {t.sections.map((s, i) => (
                      <li key={s.key + i} className="flex gap-3 text-sm">
                        <span className="w-5 text-right font-mono text-xs leading-5 text-muted-foreground">{i + 1}</span>
                        {s.title}
                      </li>
                    ))}
                  </ol>
                  {canEdit && <button onClick={() => setEdit(true)} className="mt-3 text-xs font-semibold text-tomato-ink hover:underline">Edit sections</button>}
                </>
              )}
              </div>
              <DocPreview tpl={edit ? { ...t, sections: parseSections(text) } : t} uniName={uniName} href={`/api/templates/${uniId}/${t.key}.pdf`} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  );
}

export function TemplateList({ uniId, uniName, templates, canEdit }: { uniId: string; uniName: string; templates: SopTemplate[]; canEdit: boolean }) {
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <div>
      <ul>{templates.map((t) => <TemplateRow key={t.key} t={t} uniId={uniId} uniName={uniName} canEdit={canEdit} />)}</ul>
      {canEdit && (
        <div className="mt-3">
          <button onClick={() => setAdding((a) => !a)} className="inline-flex items-center gap-1 text-xs font-semibold text-tomato-ink hover:underline">
            <Plus className={cn("size-3.5 transition-transform", adding && "rotate-45")} /> Template
          </button>
          <AnimatePresence>
            {adding && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                <div className="mt-2 space-y-2">
                  <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title (e.g. Sponsorship letter)" className="h-9 w-full rounded-lg border-[1.5px] border-ink/20 bg-card px-2.5 text-sm outline-none focus:border-ink" />
                  <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} placeholder={"One section per line\nSection, hint"} className="w-full rounded-lg border-[1.5px] border-ink/20 bg-card p-2.5 font-mono text-xs outline-none focus:border-ink" />
                  <button
                    disabled={pending || !title.trim() || !text.trim()}
                    onClick={() =>
                      start(async () => {
                        const r = await saveTemplate(uniId, "custom", title, text);
                        if (!r.ok) return void toast.error(r.error);
                        setAdding(false);
                        setTitle("");
                        setText("");
                        router.refresh();
                      })
                    }
                    className="h-9 rounded-lg bg-tomato px-4 text-sm font-semibold disabled:opacity-50"
                  >
                    Add
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
