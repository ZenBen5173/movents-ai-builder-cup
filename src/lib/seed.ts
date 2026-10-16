import { SUNWAY_SOP, SUNWAY_SOP_TEXT } from "./sop-default";
import { REFERENCE_SUPPLIERS } from "./integrations/reference-data";

/**
 * Reference data every deployment starts with: Sunway University's SOP,
 * venues and a supplier registry with public list prices. No people, no
 * events. Idempotent, so it is safe to run on every boot.
 */
type Q = (sql: string, params?: unknown[]) => Promise<Record<string, unknown>[]>;

const UNI = "uni_sunway";

function ins(q: Q, table: string, row: Record<string, unknown>) {
  const keys = Object.keys(row);
  const vals = keys.map((k) => {
    const v = row[k];
    return v !== null && typeof v === "object" ? JSON.stringify(v) : v;
  });
  return q(
    `INSERT INTO ${table} (${keys.join(",")}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(",")}) ON CONFLICT (id) DO NOTHING`,
    vals,
  );
}

// Sunway's own photos where they exist; Auditorium 1 and 2 have none online.
const SW = "https://sunwayuniversity.edu.my/sites/default/files/mediaimage/2025/";
export const VENUE_PHOTOS: Record<string, string> = {
  ven_aud1: "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3c/BI_Norwegian_Business_School_Auditorium_7DM29184.jpg/960px-BI_Norwegian_Business_School_Auditorium_7DM29184.jpg",
  ven_aud2: "https://images.unsplash.com/photo-1505373877841-8d25f7d46678?w=800",
  ven_jc2: SW + "jc2_jc3_auditoriums.jpg",
  ven_jc3: "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b3/Sunway_University_Hall.jpg/960px-Sunway_University_Hall.jpg",
  ven_lt5: SW + "lecture_theatres.jpg",
  ven_jc1: SW + "jc1_auditorium.jpg",
  ven_jch: SW + "jeffrey_cheah_hall.jpg",
  ven_slc: SW + "student_hub.jpg",
  ven_rooftop: "/venues/rooftop-terrace.jpg",
};

export async function seedReference(q: Q) {
  await ins(q, "universities", { id: UNI, name: "Sunway University", short_name: "Sunway", sop: SUNWAY_SOP, latitude: 3.0675, longitude: 101.6036 });
  await ins(q, "sop_documents", {
    id: "sop_sunway_main",
    university_id: UNI,
    title: "Clubs & Societies Event SOP (template)",
    kind: "sop",
    content: SUNWAY_SOP_TEXT,
  });

  // Capacities are estimates — Sunway does not publish seat counts.
  const venues: [string, string, number, string[], string[], number, number, string][] = [
    ["ven_aud1", "Auditorium 1", 120, ["theatre"], ["projector", "PA system", "2 wireless mics"], 0, 4, "Sunway College South West, Level G"],
    ["ven_aud2", "Auditorium 2", 120, ["theatre"], ["projector", "PA system", "2 wireless mics"], 0, 4, "Sunway College South West, Level G"],
    ["ven_jc2", "JC2", 160, ["theatre"], ["dual projectors", "PA system", "lectern mic", "lecture capture"], 0, 6, "University Building, Level 1"],
    ["ven_jc3", "JC3", 160, ["theatre"], ["dual projectors", "PA system", "lectern mic"], 0, 6, "University Building, Level 1"],
    ["ven_lt5", "Lecture Theatre 5", 200, ["theatre"], ["projector", "PA system", "lecture capture"], 0, 6, "University Building"],
    ["ven_jc1", "JC1 Auditorium", 300, ["theatre"], ["dual projectors", "line array PA", "4 wireless mics", "stage lighting", "livestream"], 0, 8, "University Building, Level 1"],
    ["ven_jch", "Jeffrey Cheah Hall", 600, ["theatre", "banquet", "cocktail", "classroom"], ["stage", "full PA", "lighting rig", "LED wall"], 1500, 10, "Sunway College North building, Level 4"],
    ["ven_rooftop", "Rooftop Terrace", 78, ["banquet", "workshop clusters"], ["portable TV", "2 speakers"], 0, 2, "University Building, Rooftop"],
    ["ven_slc", "Student Life Centre", 80, ["cocktail", "classroom", "workshop clusters"], ["TV screen", "portable speaker"], 0, 2, "Student Life Centre"],
  ];
  for (const [vid, name, capacity, setup_styles, av, cost, lead, location] of venues) {
    await ins(q, "venues", { id: vid, university_id: UNI, name, capacity, setup_styles, av, cost, booking_lead_weeks: lead, location, photo_url: VENUE_PHOTOS[vid] ?? null });
  }

  // Supplier registry with public list prices; stable ids keep this idempotent.
  for (const [i, s] of REFERENCE_SUPPLIERS.entries()) {
    await ins(q, "vendors", {
      id: `ven_ref_${i + 1}`,
      event_id: null,
      university_id: UNI,
      category: s.category,
      name: s.name,
      url: s.url,
      unit: s.unit,
      unit_price: s.unit_price,
      rating: s.rating,
      snippet: s.snippet,
      source: "registry",
      contract_status: "none",
    });
  }
}
