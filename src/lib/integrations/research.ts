import "server-only";
import { REFERENCE_SUPPLIERS, SAMPLE_SPEAKERS } from "./reference-data";

/**
 * Web research is the AI assistant's job: it searches, then saves speakers and quotes
 * into Movents with `save_speakers` / `save_supplier_quotes`. When it hasn't
 * yet, the planner falls back to placeholder speakers and reference prices.
 */

export type SpeakerCandidate = {
  name: string;
  headline: string;
  source_url: string;
  email: string | null;
  fit_reason: string;
  source: "assistant" | "sample" | "manual";
};

export type SupplierCandidate = {
  category: string;
  name: string;
  url: string;
  unit: string;
  unit_price: number | null;
  snippet: string;
  source: "assistant" | "reference";
};

export const SUPPLIER_CATEGORIES: { key: string; label: string; unit: string }[] = [
  { key: "food", label: "Food catering", unit: "pax" },
  { key: "tshirt", label: "T-shirts", unit: "piece" },
  { key: "lanyard", label: "Lanyards", unit: "piece" },
  { key: "cardholder", label: "Card holders", unit: "piece" },
];

export function placeholderSpeakers(topic: string, count = 3) {
  return SAMPLE_SPEAKERS(topic).slice(0, count);
}

export function referenceSuppliers(category: string, perCategory = 4) {
  return REFERENCE_SUPPLIERS.filter((s) => s.category === category)
    .sort((a, b) => (a.unit_price ?? Infinity) - (b.unit_price ?? Infinity))
    .slice(0, perCategory);
}
