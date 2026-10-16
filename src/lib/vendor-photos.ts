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
