import { FileDown, MapPin, ShieldAlert, StickyNote } from "lucide-react";
import { query } from "@/lib/db";
import { BlockField } from "@/components/app/runsheet-editor";
import { CoLeadChip, ContactChip, CrewEditor, type Crew } from "@/components/app/crew-editor";
import { cn } from "@/lib/utils";
import { canViewEvent } from "@/lib/guard";

export const dynamic = "force-dynamic";

type Item = { id: string; start_time: string; end_time: string; activity: string; owner: string | null; location: string | null; notes: string | null };
type Block = { ids: string[]; start: string; end: string; activity: string; owner: string; location: string; notes: string };
type TeamRow = { user_id: string; name: string; phone: string | null; member_role: string };

const toMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};
const baseActivity = (a: string) => a.replace(/\s*\(cont\.\)\s*$/i, "").trim();

/** Back to back rows with the same activity and owner become one block: 14:15 to 14:45. */
function mergeBlocks(items: Item[]): Block[] {
  const out: (Block & { allNotes: string[] })[] = [];
  for (const r of items) {
    const activity = baseActivity(r.activity);
    const owner = r.owner ?? "";
    const last = out[out.length - 1];
    if (last && last.activity === activity && last.owner === owner && last.end === r.start_time) {
      last.ids.push(r.id);
      last.end = r.end_time;
      if (r.notes?.trim()) last.allNotes.push(r.notes.trim());
    } else {
      out.push({ ids: [r.id], start: r.start_time, end: r.end_time, activity, owner, location: r.location ?? "", notes: "", allNotes: r.notes?.trim() ? [r.notes.trim()] : [] });
    }
  }
  return out.map(({ allNotes, ...b }) => ({ ...b, notes: [...new Set(allNotes)].join(" · ") }));
}

const TONES: Record<string, string> = { logistics: "bg-sky", programmes: "bg-sun", president: "bg-peach" };
const SPARE = ["bg-mint", "bg-peach", "bg-sky", "bg-sun", "bg-sand"];
function tone(owner: string) {
  const k = owner.trim().toLowerCase();
  if (TONES[k]) return TONES[k];
  let h = 0;
  for (const c of k) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return k ? SPARE[h % SPARE.length] : "bg-sand";
}

/** Height follows duration, so a 90 minute talk reads longer than a 15 minute check. */
const blockHeight = (b: Block) => Math.min(150, Math.round(44 + Math.max(0, toMin(b.end) - toMin(b.start) - 15) * 0.9));

const COLS = "grid grid-cols-[56px_minmax(0,1fr)_110px] sm:grid-cols-[84px_minmax(0,1fr)_190px]";
const enter = "animate-in fade-in slide-in-from-bottom-1 fill-mode-backwards duration-300";

function Section({ title, meta, actions, children, className }: { title: string; meta?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-xl border-[1.5px] border-ink bg-card", className)}>
      <header className="flex items-center justify-between gap-3 border-b-[1.5px] border-ink px-4 py-2.5">
        <div className="flex items-baseline gap-3">
          <h2 className="mono-label font-bold text-ink">{title}</h2>
          {meta && <span className="font-mono text-[11px] text-muted-foreground tabular">{meta}</span>}
        </div>
        {actions}
      </header>
      {children}
    </section>
  );
}

function Timetable({ blocks }: { blocks: Block[] }) {
  return (
    <div>
      <div className={cn(COLS, "mono-label border-b border-ink/15 text-[10px] text-muted-foreground")}>
        <span className="px-3 py-2 sm:px-4">Time</span>
        <span className="py-2 pl-4">Activity</span>
        <span className="py-2 pr-3 sm:pr-4">Owner</span>
      </div>
      <ol>
        {blocks.map((b, i) => {
          const t = tone(b.owner);
          return (
            <li
              key={b.ids[0]}
              style={{ minHeight: blockHeight(b), animationDelay: `${Math.min(i, 20) * 22}ms` }}
              className={cn(COLS, enter, "group border-b border-ink/10 transition-colors duration-150 last:border-b-0 hover:bg-sand/35 focus-within:bg-sand/35")}
            >
              <div className="px-3 py-2.5 font-mono tabular sm:px-4">
                <div className="text-sm font-bold leading-tight">{b.start}</div>
                <div className="text-[11px] leading-tight text-muted-foreground transition-colors group-hover:text-ink">to {b.end}</div>
              </div>
              <div className="flex min-w-0 gap-3 py-2.5 pr-3">
                <span className={cn("w-1 shrink-0 self-stretch rounded-full border border-ink/60 transition-[width] duration-200 group-hover:w-1.5", t)} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start gap-1.5">
                    <BlockField ids={b.ids} field="activity" value={b.activity} className="text-sm font-semibold leading-snug" />
                    {b.notes && <StickyNote aria-hidden className="mt-1 size-3 shrink-0 text-muted-foreground transition-opacity group-hover:opacity-0" />}
                  </div>
                  <div className="grid grid-rows-[0fr] transition-[grid-template-rows] duration-200 ease-out group-focus-within:grid-rows-[1fr] group-hover:grid-rows-[1fr]">
                    <div className="overflow-hidden">
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-0.5 pt-1 text-xs text-muted-foreground">
                        <span className="inline-flex min-w-0 items-center gap-1">
                          <MapPin className="size-3 shrink-0" />
                          <BlockField ids={b.ids} field="location" value={b.location} placeholder="Location" />
                        </span>
                        <span className="inline-flex min-w-0 items-center gap-1">
                          <StickyNote className="size-3 shrink-0" />
                          <BlockField ids={b.ids} field="notes" value={b.notes} placeholder="Note" />
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="min-w-0 py-2 pr-3 sm:pr-4">
                <span className={cn("inline-flex max-w-full items-center rounded-full border-[1.5px] border-ink px-2 py-0.5 text-xs font-medium transition-transform duration-150 group-hover:-translate-y-px", t)}>
                  <BlockField ids={b.ids} field="owner" value={b.owner} placeholder="Owner" className="whitespace-nowrap" />
                </span>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** Run of show as a timetable, then crew, then who to call. All server rendered; only the edit fields are client. */
export default async function DayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await canViewEvent(id))) return null;
  const [items, vols, team] = await Promise.all([
    query<Item>("SELECT id, start_time, end_time, activity, owner, location, notes FROM runsheet_items WHERE event_id = $1 ORDER BY start_time", [id]),
    query<Crew>("SELECT id, name, role, phone, shift, emergency FROM volunteers WHERE event_id = $1 ORDER BY (name LIKE '%(to assign)'), emergency DESC, name", [id]),
    query<TeamRow>("SELECT u.id AS user_id, u.name, u.phone, m.role AS member_role FROM event_members m JOIN users u ON u.id = m.user_id WHERE m.event_id = $1 ORDER BY m.added_at", [id]),
  ]);
  const blocks = mergeBlocks(items);
  const lead = team.find((m) => m.member_role === "lead") ?? null;
  const colead = team.find((m) => m.member_role === "colead") ?? null;
  const pickable = team.filter((m) => m.member_role !== "lead").map(({ user_id, name, phone }) => ({ user_id, name, phone }));

  return (
    <div className="space-y-8">
      <Section
        title="Run of show"
        meta={blocks.length ? `${blocks[0].start} to ${blocks[blocks.length - 1].end}` : undefined}
        actions={
          <a href={`/api/outputs/${id}/runsheet.pdf`} target="_blank" className="group inline-flex h-7 items-center gap-1 rounded-lg border-[1.5px] border-ink/25 px-2 text-xs transition-[border-color,transform] hover:-translate-y-px hover:border-ink">
            <FileDown className="size-3.5 transition-transform group-hover:translate-y-px" />
            PDF
          </a>
        }
      >
        {blocks.length ? <Timetable blocks={blocks} /> : <p className="px-4 py-6 text-sm text-muted-foreground">No run sheet yet, run the agent.</p>}
      </Section>

      <Section title="Crew" meta={vols.length ? String(vols.length) : undefined}>
        <div className="p-3">
          <CrewEditor eventId={id} crew={vols} />
        </div>
      </Section>

      <Section title="Emergency">
        <ul className="flex flex-wrap items-center gap-3 p-4">
          <ContactChip tag="Lead" person={lead} tone="bg-sun" />
          <CoLeadChip eventId={id} colead={colead} team={pickable} />
          <li>
            <a href="tel:999" title="Police, ambulance, fire" className="flex h-11 items-center gap-2 rounded-xl border-[1.5px] border-ink bg-tomato px-4 text-sm font-bold shadow-[2px_2px_0_0_#161514] transition-[transform,box-shadow] duration-150 hover:-translate-y-0.5 hover:shadow-[3px_3px_0_0_#161514] active:translate-y-0 active:shadow-none">
              <ShieldAlert className="size-4" />
              999
            </a>
          </li>
        </ul>
      </Section>
    </div>
  );
}
