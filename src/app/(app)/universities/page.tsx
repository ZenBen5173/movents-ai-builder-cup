import Link from "next/link";
import { Plus } from "lucide-react";
import { query } from "@/lib/db";
import { PageHeader } from "@/components/app/ui";
import type { University } from "@/lib/types";
import { uniIcon } from "@/lib/uni-logos";

export const dynamic = "force-dynamic";

export default async function UniversitiesPage() {
  const unis = await query<University & { societies: number; venues: number; docs: number }>(
    `SELECT u.*, (SELECT count(*)::int FROM societies s WHERE s.university_id = u.id) AS societies,
      (SELECT count(*)::int FROM venues v WHERE v.university_id = u.id) AS venues,
      (SELECT count(*)::int FROM sop_documents d WHERE d.university_id = u.id) AS docs
     FROM universities u ORDER BY u.created_at`,
  );
  return (
    <div>
      <PageHeader
        eyebrow="The campus tour"
        title="Universities"
        actions={<Link href="/universities/new" className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground"><Plus className="size-4" />Onboard university</Link>}
      />
      <div>
        {unis.map((u) => (
          <Link key={u.id} href={`/universities/${u.id}`} className="group grid grid-cols-[64px_1fr_auto] items-center gap-4 border-b-[1.5px] border-ink py-5 hover:bg-sand/40">
            <span className="grid size-14 place-items-center rounded-xl border-[1.5px] border-ink bg-white p-1.5 transition-transform group-hover:-rotate-3">
              {uniIcon(u.id) ? (
                 
                <img src={uniIcon(u.id)!} alt="" className="size-full object-contain" />
              ) : (
                <span className="font-display text-lg font-bold">{u.short_name.slice(0, 2)}</span>
              )}
            </span>
            <span>
              <span className="block font-display text-2xl font-bold group-hover:text-tomato-ink">{u.name}</span>
              <span className="text-sm text-muted-foreground">SOP v{u.sop.version} · {u.sop.required_sections.length} proposal sections · {u.sop.lead_times.length} lead times · {u.sop.approval_chain.length}-step approval</span>
            </span>
            <span className="text-right text-sm text-muted-foreground">{u.societies} {u.societies === 1 ? "society" : "societies"} · {u.venues} venues · {u.docs} {u.docs === 1 ? "doc" : "docs"}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
