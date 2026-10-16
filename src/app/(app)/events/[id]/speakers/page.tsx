import { Mail, Phone, Search, ThumbsDown, UserCheck } from "lucide-react";
import { loadBundle } from "@/lib/docs/builders";
import { Card } from "@/components/app/ui";
import { ActionButton } from "@/components/app/action-button";
import { AddSpeakerForm } from "@/components/app/people-forms";
import { Pass, Stamp } from "@/components/ep/kit";
import { DocModal } from "@/components/app/doc-modal";
import { findMoreSpeakers, speakerAction } from "@/app/actions";
import type { Speaker } from "@/lib/types";
import { canViewEvent } from "@/lib/guard";

export const dynamic = "force-dynamic";

const TONE: Record<Speaker["status"], "tomato" | "blue" | "sun" | "sand"> = {
  confirmed: "tomato",
  replied: "blue",
  contacted: "sun",
  followed_up: "sun",
  pending_approval: "sand",
  found: "sand",
  declined: "sand",
};
const LABEL: Record<Speaker["status"], string> = {
  confirmed: "Confirmed",
  replied: "Replied",
  contacted: "Invited",
  followed_up: "Followed up",
  pending_approval: "Awaiting OK",
  found: "Shortlist",
  declined: "Declined",
};

const initials = (n: string) => n.replace(/^Dr\.?\s+/, "").split(/\s+/).slice(0, 2).map((w) => w[0]).join("");

export default async function SpeakersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await canViewEvent(id))) return null;
  const b = (await loadBundle(id))!;
  return (
    <Card title="Speakers" actions={<ActionButton action={findMoreSpeakers.bind(null, id)} size="xs" icon={<Search className="size-3.5" />}>Find more</ActionButton>}>
      <div className="grid gap-x-8 gap-y-4 pt-2 sm:grid-cols-2 xl:grid-cols-3">
        {b.speakers.map((s, i) => (
          <Pass key={s.id} header={LABEL[s.status]} tone={TONE[s.status]} swing={i % 2 === 0} number={s.id.slice(-8).toUpperCase()} className={s.status === "declined" ? "opacity-50" : ""}>
            <div className="group relative">
              <DocModal href={`/api/outputs/${id}/speaker-${s.id}.pdf`} title={s.name} className="flex w-full items-center gap-3 rounded-xl text-left transition-colors hover:bg-sand/50">
                {s.photo_url ? (
                   
                  <img src={s.photo_url} alt={s.name} className="size-16 shrink-0 rounded-xl border-[1.5px] border-ink object-cover transition-transform duration-300 group-hover:scale-105" />
                ) : (
                  <span className="grid size-16 shrink-0 place-items-center rounded-xl border-[1.5px] border-ink bg-sand font-display text-xl font-bold">{initials(s.name)}</span>
                )}
                <div className="min-w-0">
                  <p className="font-display text-lg font-bold leading-tight">{s.name}</p>
                  <p className="line-clamp-2 text-xs text-muted-foreground">{s.headline}</p>
                </div>
              </DocModal>
              {s.talk_title && <p className="mt-3 font-hand text-xl leading-tight text-tomato-ink">&ldquo;{s.talk_title}&rdquo;</p>}
              {s.bio && <p title={s.bio} className="mt-2 line-clamp-3 text-[13px] leading-snug text-ink/80">{s.bio}</p>}
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] text-muted-foreground">
                {s.email && <a href={`mailto:${s.email}`} className="flex items-center gap-1 hover:text-ink"><Mail className="size-3" />{s.email}</a>}
                {s.phone && <span className="flex items-center gap-1"><Phone className="size-3" />{s.phone}</span>}
              </div>
              {s.status === "confirmed" && <Stamp tone="green" className="absolute -right-2 -top-1 rotate-12 text-[11px]">Booked</Stamp>}
              <div className="mt-3 flex flex-wrap gap-1.5">
                <DocModal href={`/api/outputs/${id}/speaker-${s.id}.pdf`} title={s.name} className="inline-flex h-7 items-center rounded-lg border border-ink/20 px-2 text-xs transition-colors hover:border-ink">Profile</DocModal>
                {s.status === "found" && <ActionButton action={speakerAction.bind(null, s.id, "outreach")} size="xs" variant="primary" icon={<Mail className="size-3.5" />}>Invite</ActionButton>}
                {["contacted", "followed_up"].includes(s.status) && <ActionButton action={speakerAction.bind(null, s.id, "replied")} size="xs">Replied</ActionButton>}
                {["contacted", "followed_up", "replied"].includes(s.status) && <ActionButton action={speakerAction.bind(null, s.id, "confirm")} size="xs" variant="success" icon={<UserCheck className="size-3.5" />}>Confirm</ActionButton>}
                {!["declined", "confirmed"].includes(s.status) && <ActionButton action={speakerAction.bind(null, s.id, "declined")} size="xs" variant="ghost" icon={<ThumbsDown className="size-3.5" />}>Declined</ActionButton>}
              </div>
            </div>
          </Pass>
        ))}
      </div>
      <div className="mt-6"><AddSpeakerForm eventId={id} /></div>
    </Card>
  );
}
