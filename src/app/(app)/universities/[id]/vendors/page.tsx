import { query } from "@/lib/db";
import type { Vendor } from "@/lib/types";
import { VendorGallery } from "@/components/app/vendor-gallery";
import { AddVendorForm } from "@/components/app/add-vendor-form";
import { vendorPhoto } from "@/lib/vendor-photos";

export const dynamic = "force-dynamic";

export default async function UniversityVendors({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [vendors, usage] = await Promise.all([
    query<Vendor & { university_id: string | null }>(
      "SELECT * FROM vendors WHERE event_id IS NULL AND (university_id IS NULL OR university_id = $1) ORDER BY category, unit_price NULLS LAST",
      [id],
    ),
    query<{ name: string; n: number }>("SELECT name, count(DISTINCT event_id)::int AS n FROM vendors WHERE event_id IS NOT NULL AND selected = true GROUP BY name"),
  ]);
  const used = new Map(usage.map((u) => [u.name, u.n]));
  const seen = new Map<string, number>();
  return (
    <div>
      <div className="mb-4 flex justify-end"><AddVendorForm universityId={id} /></div>
      <VendorGallery
        vendors={vendors.map((v) => {
          const i = seen.get(v.category) ?? 0;
          seen.set(v.category, i + 1);
          return { id: v.id, name: v.name, category: v.category, unit_price: v.unit_price, unit: v.unit, rating: v.rating, url: v.url, snippet: v.snippet, photo: vendorPhoto(v.category, i), used: used.get(v.name) ?? 0 };
        })}
        rows={vendors.map((v) => ({ ...v, rating: v.rating ?? null, unit_price: v.unit_price ?? null }))}
      />
    </div>
  );
}
