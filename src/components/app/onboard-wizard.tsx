"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Building2, FileText, Landmark } from "lucide-react";
import { toast } from "sonner";
import AnimatedStepper from "@/components/smoothui/animated-stepper";
import { Dropzone, DropzoneContent, DropzoneEmptyState } from "@/components/kibo-ui/dropzone";
import { onboardUniversity } from "@/app/actions";
import { parseSopText } from "@/lib/sop-parse";
import { SUNWAY_SOP } from "@/lib/sop-default";

const input = "h-10 w-full rounded-lg border border-input bg-card px-3 text-sm outline-none transition-shadow focus:ring-2 focus:ring-ring";

const SAMPLE = `# Event SOP, version 1.0

## Approval chain
1. Committee drafts proposal
2. Society president endorses
3. Faculty advisor approves
4. Student Affairs (HEP) final approval

## Lead times
- Venue booking: at least 4 weeks before
- Proposal submission to HEP: at least 3 weeks before
- Publicity approval: at least 2 weeks before

## Proposal format
1. Event Overview: name, date, venue
2. Objectives: learning outcomes
3. Programme Itinerary: schedule
4. Budget: itemised with 10% contingency
5. Risk Assessment: risks and mitigations
6. Endorsement: signatures

## Rules
- Spending above RM800 needs President approval.
- Claims must be submitted within 10 days after the event.
`;

export function OnboardWizard() {
  const [step, setStep] = useState(0);
  const [f, setF] = useState({ name: "", short_name: "", sopText: "" });
  const [venues, setVenues] = useState([{ name: "Main Hall", capacity: 300, booking_lead_weeks: 4 }, { name: "Lecture Theatre A", capacity: 150, booking_lead_weeks: 2 }]);
  const [files, setFiles] = useState<File[] | undefined>();
  const [pending, start] = useTransition();
  const router = useRouter();
  const parsed = useMemo(() => parseSopText(f.sopText, { ...SUNWAY_SOP, version: "1.0" }), [f.sopText]);

  const steps = [
    {
      label: "University",
      description: "Name",
      icon: <Landmark className="size-4" />,
      content: (
        <div className="grid gap-3 sm:grid-cols-2">
          <input placeholder="University name, e.g. Taylor's University" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className={`${input} sm:col-span-2`} />
          <input placeholder="Short name, e.g. Taylor's" value={f.short_name} onChange={(e) => setF({ ...f, short_name: e.target.value })} className={input} />
        </div>
      ),
    },
    {
      label: "SOP",
      description: "Upload or paste",
      icon: <FileText className="size-4" />,
      content: (
        <div className="space-y-3">
          <Dropzone accept={{ "text/markdown": [".md"], "text/plain": [".txt"] }} maxFiles={1} src={files} onDrop={async (a) => { setFiles(a); if (a[0]) setF({ ...f, sopText: await a[0].text() }); }} onError={(e) => toast.error(e.message)}>
            <DropzoneEmptyState />
            <DropzoneContent />
          </Dropzone>
          <textarea value={f.sopText} onChange={(e) => setF({ ...f, sopText: e.target.value })} rows={9} placeholder="…or paste the SOP text" className="w-full rounded-lg border border-input bg-card p-3 font-mono text-xs outline-none focus:ring-2 focus:ring-ring" />
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>Detected: <b className="text-foreground">{parsed.found.sections}</b> sections · <b className="text-foreground">{parsed.found.leadTimes}</b> lead times · <b className="text-foreground">{parsed.found.approvalSteps}</b> approval steps · <b className="text-foreground">{parsed.found.rules}</b> rules · contingency {parsed.sop.budget_rules.contingency_pct}% · threshold RM{parsed.sop.budget_rules.president_threshold}</span>
            <button onClick={() => setF({ ...f, sopText: SAMPLE })} className="text-primary hover:underline">Use sample SOP</button>
          </div>
        </div>
      ),
    },
    {
      label: "Venues",
      description: "Capacity & lead time",
      icon: <Building2 className="size-4" />,
      content: (
        <div className="space-y-2">
          {venues.map((v, i) => (
            <div key={i} className="grid grid-cols-[1fr_100px_120px] gap-2">
              <input placeholder="Venue" value={v.name} onChange={(e) => setVenues(venues.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} className={input} />
              <input placeholder="Capacity" inputMode="numeric" value={v.capacity} onChange={(e) => setVenues(venues.map((x, j) => (j === i ? { ...x, capacity: Number(e.target.value) || 0 } : x)))} className={input} />
              <input placeholder="Lead wks" inputMode="numeric" value={v.booking_lead_weeks} onChange={(e) => setVenues(venues.map((x, j) => (j === i ? { ...x, booking_lead_weeks: Number(e.target.value) || 0 } : x)))} className={input} />
            </div>
          ))}
          <button onClick={() => setVenues([...venues, { name: "", capacity: 100, booking_lead_weeks: 2 }])} className="text-xs text-primary hover:underline">+ add venue</button>
        </div>
      ),
    },
  ];

  const canNext = step === 0 ? f.name.trim() && f.short_name.trim() : true;
  return (
    <div className="rounded-2xl border-[1.5px] border-ink bg-card p-5 shadow-pop">
      <AnimatedStepper steps={steps} currentStep={step} onStepChange={setStep} allowClickNavigation variant="horizontal" />
      <div className="mt-6 flex justify-between">
        <button disabled={step === 0} onClick={() => setStep(step - 1)} className="h-9 rounded-lg border border-border px-4 text-sm disabled:opacity-40">Back</button>
        {step < steps.length - 1 ? (
          <button disabled={!canNext} onClick={() => setStep(step + 1)} className="h-9 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-40">Next</button>
        ) : (
          <button
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await onboardUniversity({ ...f, venues });
                if (!r.ok) return void toast.error(r.error);
                toast.success(r.message ?? "University added");
                router.push(`/universities/${(r.data as { id: string }).id}`);
              })
            }
            className="h-9 rounded-lg bg-[var(--grass-9)] px-4 text-sm font-medium text-white"
          >
            {pending ? "Creating…" : "Create university"}
          </button>
        )}
      </div>
    </div>
  );
}
