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

/** Three different sample events, so a new sandbox shows a busy society rather than an empty Box office. */
const SAMPLE_EVENTS: { days: number; title: string; topic: string; brief: string; team: string[]; ask?: { who: string; what: "budget" | "faculty" }; proposal: { overview: string; objectives: string[]; outcomes: string; audience: string } }[] = [
  {
    days: 45,
    title: "AI for Climate Hackathon",
    ask: { who: "Daniel Lim", what: "budget" },
    topic: "AI for climate action",
    brief: "Plan a 120-pax AI for Climate Hackathon at Sunway, 9am to 6pm, budget RM5,000",
    team: ["Daniel Lim", "Priya Nair", "Hafiz Ismail"],
    proposal: {
      overview: "A one-day hackathon where student teams build AI prototypes for climate problems in Malaysia, from flood early-warning to campus energy use, judged by industry and faculty mentors.",
      objectives: ["Run a one-day build with 25 to 30 teams of four", "Give every team at least two mentor check-ins", "Ship at least 10 working demos by the final pitch", "Grow society membership by 40 new members"],
      outcomes: "participants can scope a data problem, prototype with an AI API in a day, and pitch it in three minutes.",
      audience: "120 undergraduates from computing, engineering and environmental science, registered in teams of four through the event page; a waitlist opens once capacity is reached.",
    },
  },
  {
    days: 25,
    title: "Data Science with Python Workshop",
    ask: { who: "Mei Ling Ong", what: "budget" },
    topic: "data science with Python",
    brief: "Plan a 60-pax Data Science with Python workshop at Sunway, 2pm to 5pm, budget RM1,200",
    team: ["Mei Ling Ong", "Wei Jie Tan"],
    proposal: {
      overview: "A hands-on afternoon workshop that takes first- and second-year students from a raw CSV to a cleaned dataset, three charts and a simple prediction in Python.",
      objectives: ["Teach pandas basics on a real Malaysian open dataset", "Every participant finishes the notebook with a working model", "Collect at least 80% positive feedback on pace and clarity"],
      outcomes: "participants can load, clean and chart a dataset and explain what a train-test split is.",
      audience: "60 first- and second-year students from any faculty, laptops required, registered on the event page.",
    },
  },
  {
    days: 70,
    title: "Tech Career Fair",
    ask: { who: "Priya Nair", what: "faculty" },
    topic: "tech careers and internships",
    brief: "Plan a 200-pax Tech Career Fair at Sunway, 10am to 4pm, budget RM4,000",
    team: ["Aisyah Rahman", "Priya Nair"],
    proposal: {
      overview: "A career fair connecting students with tech employers in the Klang Valley: company booths, a CV clinic and short talks on internships and graduate roles.",
      objectives: ["Bring in at least 12 employers with booths", "Run 60 CV clinic sessions", "Get 200 students through the doors across the day"],
      outcomes: "participants leave with a reviewed CV, at least three employer contacts and a list of open internships.",
      audience: "200 penultimate- and final-year students, registered on the event page with their CVs.",
    },
  },
];

/**
 * Plan the sample events with the rule-based planner (no AI, a few seconds
 * each): timeline, venue, budget, risks, run of show and marketing kit.
 * Teammates then ask the President for the sign-offs a real committee would
 * (two budgets, one faculty submission), so Backstage has real requests.
 */
export async function seedDemoEvents(userId: string) {
  const { parsePrompt } = await import("./planning");
  const { today } = await import("./appurl");
  const T = await import("./agent/tools");
  const { generateKit } = await import("./marketing");
  const user = await one<import("./types").User>("SELECT * FROM users WHERE id = $1", [userId]);
  if (!user?.society_id) return;
  for (const s of SAMPLE_EVENTS) {
    try {
      const date = new Date(Date.now() + s.days * 86_400_000);
      // Weekend dates, like most society events.
      date.setUTCDate(date.getUTCDate() + ((6 - date.getUTCDay() + 7) % 7));
      const p = parsePrompt(`${s.brief} on ${date.getUTCDate()} ${date.toLocaleString("en-GB", { month: "short", timeZone: "UTC" })} ${date.getUTCFullYear()}`, today());
      p.team = s.team;
      p.title = s.title;
      p.topic = s.topic;
      const ev = await T.createEvent(user, p);
      const sop = await T.readSop(ev.id);
      await T.planTimeline(ev.id);
      await T.matchVenue(ev.id);
      await T.checkLeads(ev.id);
      await T.researchSpeakers(ev.id, 3);
      await T.researchSuppliers(ev.id);
      await T.draftBudget(ev.id, sop.signals);
      await T.generateRisks(ev.id);
      await T.generateOpsPack(ev.id);
      await T.writeProposalText(ev.id, s.proposal);
      await generateKit(ev.id, { withImages: false });
      if (s.ask) {
        const mate = await one<import("./types").User>("SELECT u.id, u.name, u.email, u.phone, m.society_id, m.role, m.department FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.society_id = $1 AND u.name = $2", [user.society_id, s.ask.who]);
        if (mate) {
          if (s.ask.what === "budget") await T.requestBudgetApproval(mate, ev.id, null);
          else await T.submitToFaculty(mate, ev.id, null);
        }
      }
    } catch (err) {
      console.error("[demo] sample event failed", s.brief, err);
    }
  }
  await audit(user, "demo.seeded", { events: SAMPLE_EVENTS.length }, { societyId: user.society_id });
}

/** How far the sample events are, for the setting-up screen. */
export async function demoProgress(societyId: string) {
  const events = await query<{ title: string }>("SELECT title FROM events WHERE society_id = $1 ORDER BY created_at", [societyId]);
  const done = await one("SELECT 1 FROM audit_logs WHERE society_id = $1 AND action = 'demo.seeded' LIMIT 1", [societyId]);
  return { events: events.map((e) => e.title), total: SAMPLE_EVENTS.length, done: Boolean(done) };
}
