import { query } from "@/lib/db";
import { outputsUrl } from "@/lib/appurl";
import { FileBrowser, type FolderNode } from "@/components/app/file-browser";
import { canViewEvent } from "@/lib/guard";

export const dynamic = "force-dynamic";

const KIND_LABEL: Record<string, string> = { poster: "Poster", ig_post: "Instagram post", ig_story: "Instagram story", linkedin: "LinkedIn post", video: "Teaser video" };

export default async function EventFiles({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await canViewEvent(id))) return null;
  const [report, fb, speakers, vendors, creatives] = await Promise.all([
    query("SELECT 1 FROM agent_runs WHERE event_id = $1 AND kind = 'report' LIMIT 1", [id]),
    query("SELECT 1 FROM feedback WHERE event_id = $1 LIMIT 1", [id]),
    query<{ id: string; name: string }>("SELECT id, name FROM speakers WHERE event_id = $1 ORDER BY name", [id]),
    query<{ id: string; name: string; category: string; url: string | null; selected: boolean }>("SELECT id, name, category, url, selected FROM vendors WHERE event_id = $1 ORDER BY category, selected DESC", [id]),
    query<{ id: string; kind: string; image_url: string | null }>("SELECT id, kind, image_url FROM creatives WHERE event_id = $1 ORDER BY created_at", [id]),
  ]);
  const b = `/api/outputs/${id}`;
  const feed = outputsUrl(id, "timeline.ics", 365);
  const hasReport = report.length > 0 || fb.length > 0;
  const clean = (n: string) => n.split(" — ")[0];

  const tree: FolderNode[] = [
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
  return <FileBrowser tree={tree} />;
}
