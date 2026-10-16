import m001 from "./001_baseline";
import m002 from "./002_auth_tenancy";
import m004 from "./004_oauth";
import m005 from "./005_university_ownership";
import m006 from "./006_media_storage";
import { seedReference } from "../seed";

type Q = (sql: string, params?: unknown[]) => Promise<Record<string, unknown>[]>;
export type Migration = { id: number; name: string; sql?: string; run?: (q: Q) => Promise<void> };

/** Applied in order, once each. Never edit a shipped migration; add a new one. */
export const MIGRATIONS: Migration[] = [
  { id: 1, name: "baseline", sql: m001 },
  { id: 2, name: "auth_tenancy", sql: m002 },
  {
    id: 3,
    name: "reference_data",
    // Fresh databases get Sunway's SOP, venues and the supplier registry.
    run: async (q) => {
      const [{ n }] = (await q("SELECT count(*)::int AS n FROM universities")) as { n: number }[];
      if (n === 0) await seedReference(q);
    },
  },
  { id: 4, name: "oauth", sql: m004 },
  { id: 5, name: "university_ownership", sql: m005 },
  { id: 6, name: "media_storage", sql: m006 },
];
