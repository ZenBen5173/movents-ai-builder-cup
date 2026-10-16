import type { SpeakerCandidate, SupplierCandidate } from "./research";

/**
 * Public list prices gathered from supplier websites (Oct 2026 research).
 * Used until live quotes are saved for an event.
 * "From" prices — always get a written quote before booking.
 */
export const REFERENCE_SUPPLIERS: (SupplierCandidate & { rating: number })[] = [
  // Food (per pax)
  { category: "food", name: "Tastytouch Catering, buffet (promo)", url: "https://www.comparehero.my/articles/7-raya-catering-for-less-than-rm20-per-head", unit: "pax", unit_price: 30, snippet: "JAKIM-certified buffet RM38 to 78/pax; promo from RM30/pax.", source: "reference", rating: 4.6 },
  { category: "food", name: "Tastytouch Catering, bento sets", url: "https://www.comparehero.my/articles/7-raya-catering-for-less-than-rm20-per-head", unit: "pax", unit_price: 19.5, snippet: "Bento RM19.50 to 39.50/pax, minimum 50 pax. JAKIM-certified.", source: "reference", rating: 4.3 },
  { category: "food", name: "Mix Mix Catering", url: "https://chiefeater.com/best-halal-caterers-in-klang-valley/", unit: "pax", unit_price: 20, snippet: "Halal caterer, RM20 to 50/pax depending on menu.", source: "reference", rating: 4.1 },
  { category: "food", name: "The Humble Food Company", url: "https://chiefeater.com/best-halal-caterers-in-klang-valley/", unit: "pax", unit_price: 35, snippet: "Western buffet from RM35/pax.", source: "reference", rating: 4.5 },
  // T-shirts (per piece, 1-colour silkscreen)
  { category: "tshirt", name: "e-print.my, microfiber silkscreen", url: "https://www.e-print.my/products_silkscreen_shirt", unit: "piece", unit_price: 9.5, snippet: "Blank RM8.20 (50 to 100 pcs) + ~RM1.30 one-colour front print.", source: "reference", rating: 4.0 },
  { category: "tshirt", name: "Juara Print Shop, cotton silkscreen", url: "http://www.juaraprintshop.my/tshirt-silkscreen", unit: "piece", unit_price: 14.5, snippet: "RM14.50 for >100 pcs, RM16.50 for >50 pcs. Excludes artwork & delivery.", source: "reference", rating: 4.4 },
  { category: "tshirt", name: "TMaker", url: "https://www.tmaker.my/official-price-list/", unit: "piece", unit_price: 16, snippet: "Jan 2026 list: RM16 to 22 for 51 to 100 pcs.", source: "reference", rating: 4.2 },
  { category: "tshirt", name: "Tshirtprint-KL", url: "https://tshirtprint-kl.com/t-shirt-printing-price-guide-malaysia-2025/", unit: "piece", unit_price: 15, snippet: "1-colour silkscreen RM15 to 20 for 50 to 100 pcs.", source: "reference", rating: 4.1 },
  // Lanyards
  { category: "lanyard", name: "CUSTA, 20mm sublimation lanyard", url: "https://custa.com.my/merchandise/categories/lanyard-cardholder-printing/lanyard", unit: "piece", unit_price: 2.22, snippet: "From RM2.22/pc, no minimum order.", source: "reference", rating: 4.2 },
  { category: "lanyard", name: "Lanyards.com.my, 20mm full colour", url: "https://lanyards.com.my/lanyard-printing-malaysia/", unit: "piece", unit_price: 4.5, snippet: "RM4.50 @100 pcs, RM3.00 @500, RM2.50 @1,000.", source: "reference", rating: 4.5 },
  { category: "lanyard", name: "The Lanyards Factory", url: "https://thelanyardsfactory.com/", unit: "piece", unit_price: 3.9, snippet: "From RM3.90 at 100 pcs.", source: "reference", rating: 4.0 },
  // Card holders
  { category: "cardholder", name: "CUSTA, PVC ID holder", url: "https://custa.com.my/merchandise/categories/lanyard-cardholder-printing/id-card-holder", unit: "piece", unit_price: 0.79, snippet: "PVC ID-F holder RM0.79/pc, no MOQ.", source: "reference", rating: 4.0 },
  { category: "cardholder", name: "CUSTA, PU leather holder", url: "https://custa.com.my/merchandise/categories/lanyard-cardholder-printing/id-card-holder", unit: "piece", unit_price: 1.9, snippet: "PU holder RM1.90/pc, no MOQ.", source: "reference", rating: 4.4 },
  { category: "cardholder", name: "Lapasar, PVC name card holder", url: "https://mall.lapasar.com/products/228289", unit: "piece", unit_price: 0.95, snippet: "PVC name card holder RM0.95.", source: "reference", rating: 3.9 },
];

/** Placeholder speakers until real ones are added. Clearly not real people. */
export function SAMPLE_SPEAKERS(topic: string): SpeakerCandidate[] {
  return [
    { name: "Sample Speaker A", headline: `Industry practitioner, ${topic}`, source_url: "", email: null, fit_reason: "Placeholder until a real speaker is added.", source: "sample" },
    { name: "Sample Speaker B", headline: `University researcher, ${topic}`, source_url: "", email: null, fit_reason: "Placeholder until a real speaker is added.", source: "sample" },
    { name: "Sample Speaker C", headline: `Startup founder, ${topic}`, source_url: "", email: null, fit_reason: "Placeholder until a real speaker is added.", source: "sample" },
  ];
}
