import Link from "next/link";
import QRCode from "qrcode";
import { RefreshCw, Rocket, ArrowUpFromLine, QrCode, ScanLine } from "lucide-react";
import { loadBundle } from "@/lib/docs/builders";
import { query } from "@/lib/db";
import { appUrl, fmtDate } from "@/lib/appurl";
import { predictAttendance, parseSignals } from "@/lib/planning";
import { lumaMode, meetupMode } from "@/lib/integrations/ticketing";
import { Stat } from "@/components/app/ui";
import { ActionButton } from "@/components/app/action-button";
import { RsvpTable } from "@/components/app/rsvp-table";
import { promoteWaitlist, publish, sync } from "@/app/actions";
import { canViewEvent } from "@/lib/guard";

export const dynamic = "force-dynamic";

export default async function RegistrationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await canViewEvent(id))) return null;
  const b = (await loadBundle(id))!;
  const reminders = await query<{ id: string; label: string; scheduled_for: string; status: string }>("SELECT * FROM reminders WHERE event_id = $1 ORDER BY scheduled_for", [id]);
  const lessons = await query<{ content: string }>("SELECT content FROM sop_documents WHERE university_id = $1 AND kind = 'lessons' ORDER BY created_at DESC", [b.university!.id]);
  const showRate = lessons.map((l) => parseSignals(l.content).show_rate).find((x) => x != null) ?? 0.75;
  const going = b.rsvps.filter((r) => r.status === "going");
  const waitlist = b.rsvps.filter((r) => r.status === "waitlist");
  const checked = b.rsvps.filter((r) => r.checked_in).length;
  const cap = b.venue?.capacity ?? b.event.pax;
  const pred = predictAttendance(going.length, waitlist.length, showRate, cap);
  const food = Math.ceil(pred.predicted * (1 + b.university!.sop.budget_rules.food_buffer_pct / 100));
  const venues = await query<{ name: string; capacity: number }>("SELECT name, capacity FROM venues WHERE university_id = $1 AND capacity >= $2 ORDER BY capacity LIMIT 1", [b.university!.id, Math.ceil(pred.high * 1.1)]);
  const publicUrl = `${appUrl()}/e/${id}`;
  const qr = await QRCode.toDataURL(publicUrl, { margin: 1, width: 220 });
  const count = (key: "dietary" | "accessibility") => {
    const m = new Map<string, number>();
    for (const r of going) if (r[key]) m.set(r[key]!, (m.get(r[key]!) ?? 0) + 1);
    return [...m.entries()].sort((a, c) => c[1] - a[1]);
  };
  const platforms = [
    { key: "luma" as const, name: "Luma", data: b.event.luma, mode: lumaMode() },
    { key: "meetup" as const, name: "Meetup", data: b.event.meetup, mode: meetupMode() },
  ];

  const tip = "pointer-events-none absolute left-0 top-full z-30 mt-2 w-max max-w-72 rounded-lg border-[1.5px] border-ink bg-card px-2 py-1 text-xs opacity-0 shadow-[2px_2px_0_0_#161514] transition-opacity group-hover:opacity-100";
  const diet = count("dietary");
  const access = count("accessibility");

  return (
    <div className="space-y-10">
      <div className="grid grid-cols-2 gap-6 lg:grid-cols-4">
        <Stat index={0} label="Going" value={going.length} suffix={`/${cap}`} hint={`Venue seats ${cap}`} />
        <Stat index={1} label="Waitlist" value={waitlist.length} hint={waitlist.length ? "Promote below when seats free up" : undefined} />
        <Stat index={2} label="Checked in" value={checked} hint={going.length ? `${Math.round((checked / going.length) * 100)}% of going` : undefined} />
        <Stat index={3} label="Expected" value={pred.predicted} hint={`Range ${pred.low} to ${pred.high}. Show rate ${Math.round(showRate * 100)}% from past events. Order food for ${food}.${venues[0] ? ` Smallest room that fits: ${venues[0].name}.` : ""}`} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {platforms.map((p) => (
          <div key={p.key} className="group relative flex h-10 items-center gap-2 rounded-xl border-[1.5px] border-ink bg-card pl-3 pr-1.5">
            <span className={`size-2 rounded-full ${p.data?.url ? "bg-[#46a758]" : "bg-ink/25"}`} />
            {p.data?.url ? <a href={p.data.url} target="_blank" rel="noreferrer" className="text-sm font-semibold hover:underline">{p.name}</a> : <span className="text-sm font-semibold text-muted-foreground">{p.name}</span>}
            {!p.data?.url && <ActionButton action={publish.bind(null, id, p.key)} size="xs" variant="primary" icon={<Rocket className="size-3.5" />}>Publish</ActionButton>}
            <ActionButton action={sync.bind(null, id, p.key)} size="xs" variant="ghost" icon={<RefreshCw className="size-3.5" />}>{""}</ActionButton>
            <span className={tip}>{p.data?.url ? `Live (${p.data.mode})${p.data.synced_at ? `. Synced ${new Date(p.data.synced_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kuala_Lumpur" })}` : ""}` : `Not published (${p.mode}). Needs President or VP.`}</span>
          </div>
        ))}
        <div className="group relative">
          <a href={`/e/${id}`} target="_blank" className="flex h-10 items-center gap-2 rounded-xl border-[1.5px] border-ink bg-card px-3 text-sm font-semibold hover:bg-sand/50"><QrCode className="size-4" />Sign-up page</a>
          <span className="pointer-events-none absolute left-0 top-full z-30 mt-2 rounded-xl border-[1.5px] border-ink bg-white p-2 opacity-0 shadow-[3px_3px_0_0_#161514] transition-opacity group-hover:opacity-100">
            { }
            <img src={qr} alt="" className="size-32" />
          </span>
        </div>
        <Link href={`/checkin/${id}`} className="flex h-10 items-center gap-2 rounded-xl border-[1.5px] border-ink bg-sun px-3 text-sm font-semibold shadow-[2px_2px_0_0_#161514] transition-transform hover:-translate-y-0.5"><ScanLine className="size-4" />Door check-in</Link>
        {waitlist.length > 0 && <ActionButton action={promoteWaitlist.bind(null, id)} size="xs" icon={<ArrowUpFromLine className="size-3.5" />}>Promote waitlist</ActionButton>}
      </div>

      <section>
        <h3 className="mono-label mb-4 border-b-[1.5px] border-ink pb-2 font-bold">Reminders</h3>
        <ol className="relative flex justify-between px-2">
          <span aria-hidden className="absolute inset-x-4 top-[9px] h-[2px] bg-ink/15" />
          {reminders.map((r) => (
            <li key={r.id} className="group relative flex flex-col items-center gap-1.5">
              <span className={`relative z-10 size-5 rounded-full border-[1.5px] border-ink transition-transform group-hover:scale-125 ${r.status === "sent" ? "bg-mint" : r.status === "skipped" ? "bg-sand" : "bg-card"}`} />
              <span className="font-mono text-[10px] text-muted-foreground">{r.label.replace(/ before.*/i, "")}</span>
              <span className="pointer-events-none absolute top-full z-30 mt-6 w-max rounded-lg border-[1.5px] border-ink bg-card px-2 py-1 text-xs opacity-0 shadow-[2px_2px_0_0_#161514] transition-opacity group-hover:opacity-100">{r.label}: {fmtDate(r.scheduled_for)} ({r.status})</span>
            </li>
          ))}
        </ol>
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-center gap-2 border-b-[1.5px] border-ink pb-2">
          <h3 className="mono-label mr-2 font-bold">Attendees <span className="font-mono text-muted-foreground">{b.rsvps.length}</span></h3>
          {[...diet, ...access].map(([k, n]) => (
            <span key={k} className="rounded-md border border-ink/20 px-1.5 py-0.5 font-mono text-[10.5px]">{k} <b>{n}</b></span>
          ))}
        </div>
        <RsvpTable rows={b.rsvps.map((r) => ({ ...r, created_at: new Date(r.created_at).toISOString(), checked_in_at: r.checked_in_at ? new Date(r.checked_in_at).toISOString() : null }))} />
      </section>
    </div>
  );
}
