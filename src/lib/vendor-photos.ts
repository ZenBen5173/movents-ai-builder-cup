/** Stock product photos (Unsplash) per vendor category, until vendors upload their own. */
const U = (id: string) => `https://images.unsplash.com/photo-${id}?w=800&h=600&fit=crop`;

const PHOTOS: Record<string, string[]> = {
  food: ["1555244162-803834f70033", "1546069901-ba9599a7e63c", "1512058564366-18510be2db19", "1414235077428-338989a2e8c0"].map(U),
  tshirt: ["1521572163474-6864f9cf17ab", "1622445275463-afa2ab738c34", "1562157873-818bc0726f68", "1576566588028-4147f3842f27"].map(U),
  lanyard: ["1769142726489-6f40b1c575c5", "1704269523788-f2bb9885e583", "1762637119322-0aeb996bc832"].map(U),
  cardholder: ["1769029269011-b32f787c288c", "1783120947302-0ac75b8a9e35"].map(U),
};

export function vendorPhoto(category: string, index: number) {
  const list = PHOTOS[category] ?? PHOTOS.food;
  return list[index % list.length];
}

/**
 * One picture per supplier: its own page image when that image shows only its
 * product, else a photo of the category. Suppliers' sites often reuse one banner
 * for everything they sell (a T-shirt on the card-holder page), so an image
 * shared across categories is not used.
 */
export function supplierPhotos<T extends { id: string; category: string; photo_url?: string | null }>(vendors: T[]) {
  const cats = new Map<string, Set<string>>();
  for (const v of vendors) if (v.photo_url) cats.set(v.photo_url, (cats.get(v.photo_url) ?? new Set()).add(v.category));
  const seen = new Map<string, number>();
  return new Map(
    vendors.map((v) => {
      const i = seen.get(v.category) ?? 0;
      seen.set(v.category, i + 1);
      const own = v.photo_url && cats.get(v.photo_url)!.size === 1 ? v.photo_url : null;
      return [v.id, own ?? vendorPhoto(v.category, i)];
    }),
  );
}
