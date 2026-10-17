import { one, query } from "@/lib/db";
import { outputsUrl } from "@/lib/appurl";
import { FileBrowser, type FolderNode } from "@/components/app/file-browser";
import { canViewEvent } from "@/lib/guard";
import { templatesOf } from "@/lib/templates";
import { RecordEditor } from "@/components/app/record-editor";
import { updateProposalText } from "@/app/actions";
import { FileUpload } from "@/components/app/file-upload";
import type { University } from "@/lib/types";

export const dynamic = "force-dynamic";

const KIND_LABEL: Record<string, string> = { poster: "Poster", ig_post: "Instagram post", ig_story: "Instagram story", linkedin: "LinkedIn post", video: "Teaser video" };

export default async function EventFiles({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await canViewEvent(id))) return null;
  // The university's blank forms, for anything you would rather fill in by hand.
  const uni = await one<Pick<University, "id" | "sop">>("SELECT u.id, u.sop FROM events e JOIN societies s ON s.id = e.society_id JOIN universities u ON u.id = s.university_id WHERE e.id = $1", [id]);
  const ev = await one<{ preferences: { proposal?: { overview?: string; objectives?: string[]; outcomes?: string; audience?: string } } | null }>("SELECT preferences FROM events WHERE id = $1", [id]);
  const prop = ev?.preferences?.proposal ?? {};
  const [report, fb, speakers, vendors, creatives, uploads] = await Promise.all([
    query("SELECT 1 FROM agent_runs WHERE event_id = $1 AND kind = 'report' LIMIT 1", [id]),
    query("SELECT 1 FROM feedback WHERE event_id = $1 LIMIT 1", [id]),
    query<{ id: string; name: string }>("SELECT id, name FROM speakers WHERE event_id = $1 ORDER BY name", [id]),
    query<{ id: string; name: string; category: string; url: string | null; selected: boolean }>("SELECT id, name, category, url, selected FROM vendors WHERE event_id = $1 ORDER BY category, selected DESC", [id]),
    query<{ id: string; kind: string; image_url: string | null }>("SELECT id, kind, image_url FROM creatives WHERE event_id = $1 ORDER BY created_at", [id]),
    query<{ id: string; name: string; size: number; created_at: string; by: string | null }>(
      "SELECT f.id, f.name, f.size, f.created_at, u.name AS by FROM event_files f LEFT JOIN users u ON u.id = f.uploaded_by WHERE f.event_id = $1 ORDER BY f.created_at DESC",
      [id],
    ),
  ]);
  const ext = (n: string) => (n.split(".").pop() ?? "file").toLowerCase().slice(0, 4);
  const size = (n: number) => (n > 1_000_000 ? `${(n / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1000))} KB`);
  const b = `/api/outputs/${id}`;
  const feed = outputsUrl(id, "timeline.ics", 365);
  const hasReport = report.length > 0 || fb.length > 0;
  const clean = (n: string) => n.split(" — ")[0];

  const tree: FolderNode[] = [
    {
      id: "shared",
      name: "Shared by the team",
      files: uploads.map((f) => ({ label: f.name, href: `/api/events/${id}/files/${f.id}`, kind: ext(f.name), note: `${size(Number(f.size))}${f.by ? `, uploaded by ${f.by}` : ""}` })),
    },
    {
      id: "templates",
      name: "Templates",
      files: [],
      folders: uni
        ? templatesOf(uni.sop).map((t) => ({
            id: `tpl-${t.key}`,
            name: t.title,
            files: [
              { label: `${t.title} (blank, Word)`, href: `/api/templates/${uni.id}/${t.key}.docx`, kind: "docx", note: "Your university's format, ready to fill in" },
              { label: `${t.title} (blank, PDF)`, href: `/api/templates/${uni.id}/${t.key}.pdf`, kind: "pdf" },
              ...(t.kind === "pre_event" ? [{ label: "Filled in for this event", href: `${b}/proposal.docx`, kind: "docx", note: "Written by Movents from this event's plan" }] : []),
              ...(t.kind === "post_event" && hasReport ? [{ label: "Filled in for this event", href: `${b}/report.docx`, kind: "docx" }] : []),
            ],
          }))
        : [],
    },
    {
      id: "proposal",
      name: "Proposal",
      files: [
        { label: "Event proposal", href: `${b}/proposal.pdf`, kind: "pdf" },
        { label: "Event proposal (editable)", href: `${b}/proposal.docx`, kind: "docx" },
      ],
      folders: [{ id: "speakers", name: "Speaker profiles", files: speakers.map((s) => ({ label: s.name, href: `${b}/speaker-${s.id}.pdf`, kind: "pdf" })) }],
    },
    {
      id: "money",
      name: "Budget",
      files: [
        { label: "Budget sheet", href: `${b}/budget.xlsx`, kind: "xlsx" },
        { label: "Budget", href: `${b}/budget.csv`, kind: "csv" },
      ],
      folders: [
        {
          id: "quotes",
          name: "Supplier quotes",
          files: [],
          folders: [...new Set(vendors.map((v) => v.category))].map((cat) => ({
            id: `q-${cat}`,
            name: cat.charAt(0).toUpperCase() + cat.slice(1),
            files: vendors.filter((v) => v.category === cat && v.url).map((v) => ({ label: `${clean(v.name)}${v.selected ? " (chosen)" : ""}`, href: v.url!, kind: "link" })),
          })),
        },
      ],
    },
    {
      id: "risk",
      name: "Risk",
      files: [
        { label: "Risk register", href: `${b}/risks.xlsx`, kind: "xlsx" },
        { label: "Risk register and contingency plan", href: `${b}/risks.pdf`, kind: "pdf" },
      ],
    },
    {
      id: "marketing",
      name: "Marketing",
      files: [],
      folders: [
        { id: "posters", name: "Posters", files: creatives.filter((c) => c.kind === "poster").map((c) => ({ label: KIND_LABEL[c.kind] ?? c.kind, href: `/api/creatives/${c.id}/image`, kind: "png" })) },
        { id: "social", name: "Social posts", files: creatives.filter((c) => c.kind !== "poster").map((c) => ({ label: KIND_LABEL[c.kind] ?? c.kind, href: `/api/creatives/${c.id}/image`, kind: c.kind === "video" ? "mp4" : "png" })) },
      ],
    },
    {
      id: "day",
      name: "Event day",
      files: [{ label: "Run sheet and roster", href: `${b}/runsheet.pdf`, kind: "pdf" }],
      folders: [
        {
          id: "calendar",
          name: "Calendar",
          files: [
            { label: "Timeline", href: `${b}/timeline.ics`, kind: "ics", note: "Import, or subscribe in Google Calendar" },
            { label: "Add to Google Calendar", href: `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(feed.replace(/^https?:/, "webcal:"))}`, kind: "link", note: "Works once the app is on a public URL" },
          ],
        },
      ],
    },
    {
      id: "report",
      name: "After the event",
      files: hasReport
        ? [
            { label: "Post-event report", href: `${b}/report.pdf`, kind: "pdf" },
            { label: "Post-event report (editable)", href: `${b}/report.docx`, kind: "docx" },
          ]
        : [],
    },
  ];
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border-[1.5px] border-dashed border-ink/25 px-4 py-2.5 text-sm">
        <span className="min-w-0 flex-1 text-muted-foreground">Upload anything for this event and the whole committee finds it here. The proposal files are written from the plan; change the wording yourself, or ask Movi.</span>
        <FileUpload eventId={id} />
        <RecordEditor
          trigger="Edit proposal wording"
          title="Proposal wording"
          description="Used in the proposal PDF and Word file. Leave a box empty and Movents writes it from the event plan."
          save={updateProposalText.bind(null, id)}
          fields={[
            { key: "overview", label: "Overview", value: prop.overview, type: "textarea", placeholder: "What the event is and why it matters" },
            { key: "objectives", label: "Objectives (one per line)", value: (prop.objectives ?? []).join("\n"), type: "textarea" },
            { key: "outcomes", label: "Learning outcomes", value: prop.outcomes, type: "textarea" },
            { key: "audience", label: "Target audience", value: prop.audience, type: "textarea" },
          ]}
        />
      </div>
      <FileBrowser tree={tree} />
    </div>
  );
}
