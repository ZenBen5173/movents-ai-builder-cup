import { pageUser } from "@/lib/guard";
import { one, query } from "@/lib/db";
import { canManageUniversity } from "@/lib/universities";
import { SopView } from "@/components/app/sop-view";
import type { University } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function UniversitySop({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await pageUser();
  const uni = (await one<University>("SELECT * FROM universities WHERE id = $1", [id]))!;
  const docs = await query<{ id: string; title: string; kind: string; content: string; created_at: string; by: string | null }>(
    "SELECT d.*, u.name AS by FROM sop_documents d LEFT JOIN users u ON u.id = d.uploaded_by WHERE d.university_id = $1 ORDER BY d.created_at DESC",
    [id],
  );
  return <SopView university={JSON.parse(JSON.stringify(uni))} docs={docs.map((d) => ({ ...d, created_at: new Date(d.created_at).toISOString() }))} canEdit={await canManageUniversity(user, id)} />;
}
