import "server-only";
import { id, one, query, transaction } from "./db";
import { audit } from "./audit";
import { switchWorkspace } from "./workspace";
import type { Role } from "./types";

/**
 * "Try the demo" sign-in for judges and visitors (DEMO_MODE=1).
 * Each click makes a private sandbox: a new society at Sunway University
 * with sample teammates (fake @movents.test addresses), and signs the
 * visitor in as its President. Sandboxes never share data with each other.
 */
export function demoEnabled() {
  return process.env.DEMO_MODE === "1";
}

const TEAM: { name: string; role: Role; department: string | null }[] = [
  { name: "Aisyah Rahman", role: "vp", department: "Executive" },
  { name: "Daniel Lim", role: "director", department: "Programmes" },
  { name: "Priya Nair", role: "director", department: "Logistics" },
  { name: "Wei Jie Tan", role: "director", department: "Marketing" },
  { name: "Hafiz Ismail", role: "committee", department: "Programmes" },
  { name: "Mei Ling Ong", role: "committee", department: "Marketing" },
  { name: "Dr. Kavitha Subramaniam", role: "faculty_advisor", department: null },
];

export async function createDemoSandbox() {
  if (!demoEnabled()) throw new Error("The demo is not enabled on this server.");
  const uni = await one<{ id: string }>("SELECT id FROM universities WHERE id = 'uni_sunway'") ?? (await one<{ id: string }>("SELECT id FROM universities ORDER BY name LIMIT 1"));
  if (!uni) throw new Error("No university data yet. Run the migrations first.");
  const tag = id("x").slice(2, 10).toLowerCase();
  const sid = id("soc");
  const userId = id("usr");
  await transaction(async () => {
    await query("INSERT INTO users (id, society_id, name, email, role, department, email_verified_at) VALUES ($1, NULL, $2, $3, 'president', 'Executive', now())", [userId, "Demo Organiser", `demo-${tag}@movents.test`]);
    await query("INSERT INTO societies (id, university_id, name, created_by) VALUES ($1, $2, $3, $4)", [sid, uni.id, "AI & Tech Society (demo)", userId]);
    await query("INSERT INTO memberships (society_id, user_id, role, department) VALUES ($1, $2, 'president', 'Executive')", [sid, userId]);
    for (const p of TEAM) {
      const uid = id("usr");
      const local = p.name.toLowerCase().replace(/^dr\.?\s+/, "").replace(/[^a-z]+/g, ".").replace(/^\.|\.$/g, "");
      await query("INSERT INTO users (id, society_id, name, email, role, department, phone) VALUES ($1, $2, $3, $4, $5, $6, $7)", [uid, sid, p.name, `${local}.${tag}@movents.test`, p.role, p.department, `+60 12-${String(1000000 + Math.floor(Math.random() * 8999999)).slice(0, 3)} ${String(Math.floor(1000 + Math.random() * 8999))}`]);
      await query("INSERT INTO memberships (society_id, user_id, role, department) VALUES ($1, $2, $3, $4)", [sid, uid, p.role, p.department]);
    }
    await switchWorkspace(userId, sid);
  });
  await audit({ id: userId, name: "Demo Organiser" }, "demo.sandbox_created", { society: sid }, { societyId: sid });
  return userId;
}
