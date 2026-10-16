"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown, Plus } from "lucide-react";
import { toast } from "sonner";
import { Dropzone, DropzoneContent, DropzoneEmptyState } from "@/components/kibo-ui/dropzone";
import { uploadSop } from "@/app/actions";
import { cn } from "@/lib/utils";
import { ROLE_LABEL, type University } from "@/lib/types";
import { Pill } from "./ui";
import { TemplateList } from "./template-list";
import { templatesOf } from "@/lib/templates";

type Doc = { id: string; title: string; kind: string; content: string; created_at: string; by: string | null };

function Section({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="grid gap-4 border-t-[1.5px] border-ink py-6 md:grid-cols-[200px_1fr]">
      <div>
        <span className="font-mono text-xs text-muted-foreground">{n}</span>
        <h2 className="font-display text-xl font-bold">{title}</h2>
      </div>
      <div className="min-w-0">{children}</div>
    </motion.section>
  );
}

function DocRow({ d }: { d: Doc }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="border-b border-border">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-3 py-2.5 text-left">
        <Pill status={d.kind === "lessons" ? "warn" : "draft"} label={d.kind === "lessons" ? "lessons" : "sop"} />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{d.title}</span>
        <span className="font-mono text-xs text-muted-foreground">{new Date(d.created_at).toLocaleDateString("en-GB", { timeZone: "Asia/Kuala_Lumpur" })}</span>
        <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.pre initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden whitespace-pre-wrap pb-4 font-sans text-xs leading-relaxed text-muted-foreground">
            {d.content.replace(/```signals[\s\S]*?```/, "")}
          </motion.pre>
        )}
      </AnimatePresence>
    </li>
  );
}

export function SopView({ university, docs, canEdit }: { university: University; docs: Doc[]; canEdit: boolean }) {
  const sop = university.sop;
  const [files, setFiles] = useState<File[] | undefined>();
  const [text, setText] = useState("");
  const [title, setTitle] = useState("");
  const [apply, setApply] = useState(true);
  const [upload, setUpload] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();

  const save = () =>
    start(async () => {
      const r = await uploadSop(university.id, title || files?.[0]?.name || "Uploaded SOP", text, apply);
      if (r.ok) {
        toast.success(r.message ?? "Saved");
        setText("");
        setFiles(undefined);
        setTitle("");
        setUpload(false);
        router.refresh();
      } else toast.error(r.error);
    });

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="font-mono text-xs text-muted-foreground">v{sop.version}</span>
        {canEdit && (
          <button onClick={() => setUpload((u) => !u)} className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-ink px-3.5 text-sm font-medium text-white shadow-[2px_2px_0_0_#ff5a36]">
            <Plus className={cn("size-4 transition-transform", upload && "rotate-45")} /> Upload SOP
          </button>
        )}
      </div>

      <AnimatePresence>
        {upload && canEdit && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="mb-6 space-y-2 rounded-2xl border-[1.5px] border-ink bg-card p-4">
              <Dropzone
                accept={{ "text/markdown": [".md"], "text/plain": [".txt"] }}
                maxFiles={1}
                src={files}
                onDrop={async (accepted) => {
                  setFiles(accepted);
                  if (accepted[0]) {
                    setText(await accepted[0].text());
                    setTitle(accepted[0].name.replace(/\.(md|txt)$/, ""));
                  }
                }}
                onError={(e) => toast.error(e.message)}
              >
                <DropzoneEmptyState />
                <DropzoneContent />
              </Dropzone>
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" className="h-9 w-full rounded-lg border-[1.5px] border-ink/20 bg-card px-2.5 text-sm outline-none focus:border-ink" />
              <textarea value={text} onChange={(e) => setText(e.target.value)} rows={6} placeholder="…or paste" className="w-full rounded-lg border-[1.5px] border-ink/20 bg-card p-2.5 font-mono text-xs outline-none focus:border-ink" />
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={apply} onChange={(e) => setApply(e.target.checked)} className="accent-[#ff5a36]" />Apply</label>
                <button disabled={pending || !text.trim()} onClick={save} className="h-9 rounded-xl bg-tomato px-4 text-sm font-semibold disabled:opacity-50">{pending ? "Saving…" : "Save"}</button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <Section n="01" title="Approval chain">
        <ol className="relative">
          {sop.approval_chain.map((s, i) => (
            <li key={s.step} className="relative flex items-center gap-4 pb-4 last:pb-0">
              {i < sop.approval_chain.length - 1 && <span aria-hidden className="absolute left-[15px] top-8 h-[calc(100%-24px)] w-[1.5px] bg-ink" />}
              <span className={cn("relative z-10 grid size-8 shrink-0 place-items-center rounded-full border-[1.5px] border-ink font-mono text-xs font-bold", i === sop.approval_chain.length - 1 ? "bg-tomato" : "bg-card")}>{s.step}</span>
              <span className="text-[15px]">{s.label}</span>
            </li>
          ))}
        </ol>
      </Section>

      <Section n="02" title="Lead times">
        <ul>
          {sop.lead_times.map((l) => (
            <li key={l.key} className="grid grid-cols-[70px_1fr_auto] items-center gap-3 border-b border-border py-2.5">
              <span className="font-display text-2xl font-bold">{l.weeks_before}<span className="text-sm font-medium text-muted-foreground"> wk</span></span>
              <span className="text-[15px]">{l.label}</span>
              <span className="text-xs text-muted-foreground">{ROLE_LABEL[l.owner_role]}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section n="03" title="Templates">
        <TemplateList uniId={university.id} uniName={university.name} templates={templatesOf(sop)} canEdit={canEdit} />
      </Section>

      <Section n="04" title="Budget">
        <div className="grid grid-cols-2 gap-6 sm:grid-cols-5">
          {[
            ["Contingency", `${sop.budget_rules.contingency_pct}%`, `Keep ${sop.budget_rules.contingency_pct}% of the budget unspent for surprises. It sits inside the cap, not on top.`],
            ["President signs above", `RM${sop.budget_rules.president_threshold.toLocaleString("en-MY")}`, `Any single spend over RM${sop.budget_rules.president_threshold.toLocaleString("en-MY")} needs the President or VP to approve it first. Directors can approve smaller amounts.`],
            ["Spend alert", `${sop.budget_rules.alert_pct}%`, `When money spent reaches ${sop.budget_rules.alert_pct}% of the approved budget, Movents warns the President and the event team.`],
            ["Claim deadline", `${sop.budget_rules.claims_days_after} days`, `Hand original receipts to the society treasurer within ${sop.budget_rules.claims_days_after} days after the event. The treasurer files the claim with Student LIFE (SLE).`],
            ["Food buffer", `${sop.budget_rules.food_buffer_pct}%`, `Order food for ${sop.budget_rules.food_buffer_pct}% more people than expected attendance.`],
          ].map(([k, v, tip]) => (
            <div key={k} className="group relative cursor-help border-l-[1.5px] border-ink pl-3">
              <p className="mono-label text-[9.5px] text-muted-foreground underline decoration-dotted underline-offset-2">{k}</p>
              <p className="font-display text-2xl font-bold transition-colors group-hover:text-tomato-ink">{v}</p>
              <span className="pointer-events-none absolute left-3 top-full z-20 mt-2 w-64 translate-y-1 rounded-lg border-[1.5px] border-ink bg-card px-2.5 py-1.5 text-xs leading-snug opacity-0 shadow-[2px_2px_0_0_#161514] transition-all group-hover:translate-y-0 group-hover:opacity-100">{tip}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section n="05" title="Rules">
        <ul className="space-y-2">
          {sop.rules.map((r) => (
            <li key={r} className="flex gap-3 text-[15px]"><span className="mt-2 size-1.5 shrink-0 rounded-full bg-tomato" />{r}</li>
          ))}
        </ul>
      </Section>

      <Section n="06" title="Documents">
        <ul>{docs.map((d) => <DocRow key={d.id} d={d} />)}</ul>
      </Section>
    </div>
  );
}
