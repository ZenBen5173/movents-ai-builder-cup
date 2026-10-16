import { query } from "@/lib/db";
import { decide } from "@/lib/rbac";
import { offerLabel, sponsorContext, sponsorDraft } from "@/lib/sponsors";
import { Card } from "@/components/app/ui";
import { SponsorOverview, SponsorPipeline, type SponsorRow } from "@/components/app/sponsor-board";
import type { Sponsor } from "@/lib/types";
import { canViewEvent, pageUser } from "@/lib/guard";

export const dynamic = "force-dynamic";

const iso = (v: unknown) => (v == null ? null : v instanceof Date ? v.toISOString() : String(v));

/** Funnel donut + offers on top, the outreach pipeline underneath. */
export default async function SponsorsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await canViewEvent(id))) return null;
  const user = await pageUser();
  const [sponsors, pending, ctx] = await Promise.all([
    query<Sponsor>("SELECT * FROM sponsors WHERE event_id = $1 ORDER BY created_at", [id]),
    query<{ sid: string | null }>("SELECT payload->>'sponsor_id' AS sid FROM approval_requests WHERE event_id = $1 AND action_type = 'email.sponsor' AND status = 'pending'", [id]),
    sponsorContext(id, user),
  ]);
  const waiting = new Set(pending.map((p) => p.sid));
  const rows: SponsorRow[] = sponsors.map((s) => ({
    id: s.id,
    company: s.company,
    industry: s.industry,
    website: s.website,
    logo_url: s.logo_url,
    contact_name: s.contact_name,
    contact_email: s.contact_email,
    ask: s.ask,
    status: s.status,
    offer_type: s.offer_type,
    offer_amount: s.offer_amount == null ? null : Number(s.offer_amount),
    offer: s.status === "accepted" ? offerLabel(s) : null,
    offer_note: s.offer_note,
    notes: s.notes,
    fit_reason: s.fit_reason,
    contacted_at: iso(s.contacted_at),
    opened_at: iso(s.opened_at),
    replied_at: iso(s.replied_at),
    decided_at: iso(s.decided_at),
    pending: waiting.has(s.id),
    draft: sponsorDraft(s, ctx),
  }));
  const gated = !decide(user, "email.sponsor").allowed;
  return (
    <div className="space-y-10">
      <Card title="Sponsors">
        <SponsorOverview rows={rows} />
      </Card>
      <Card title="Outreach">
        <SponsorPipeline eventId={id} rows={rows} gated={gated} />
      </Card>
    </div>
  );
}
