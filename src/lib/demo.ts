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
  await sampleVenueBookings(uni.id).catch((err) => console.error("[demo] venue bookings", err));
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
      await demoExtras(user, ev.id);
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
  // Then Gemini finds real speakers (with photos) and sponsors for each, in the background.
  const { geminiEnabled } = await import("./ai/gemini");
  if (geminiEnabled()) {
    const { researchEvent } = await import("./agent/gemini/orchestrator");
    const ids = await query<{ id: string }>("SELECT id FROM events WHERE society_id = $1 ORDER BY created_at", [user.society_id]);
    await Promise.allSettled(ids.map((e) => researchEvent(user, e.id)));
  }
}

/**
 * A sample event's paper trail, so no tab is empty: emails the committee has
 * sent (to placeholder .example addresses, never real ones) and meetings, a
 * past kick-off with minutes and action items that became tasks, and the
 * next weekly sync.
 */
/** Sample registrations, and for the seeded sample events also a sent-email trail and meetings. */
export async function demoExtras(user: import("./types").User, eventId: string, opts: { trail?: boolean } = {}) {
  await sampleRegistrations(eventId);
  // Extras for a fuller demo; a hiccup here never stops the event being set up.
  await sampleSponsorProgress(eventId).catch((err) => console.error("[demo] sponsor progress", err));
  await sampleReplies(user, eventId).catch((err) => console.error("[demo] replies", err));
  await sampleFiles(user, eventId).catch((err) => console.error("[demo] files", err));
  if (opts.trail !== false) await sampleInboxAndMeetings(user, eventId);
}

/**
 * A sponsor pipeline a few weeks in: one offer, one reply, emails opened and
 * sent, so the Sponsors overview has a real funnel. Only runs while every
 * sponsor is still untouched; does nothing if there are none yet.
 */
export async function sampleSponsorProgress(eventId: string) {
  const list = await query<{ id: string; status: string; ask: string | null }>("SELECT id, status, ask FROM sponsors WHERE event_id = $1 ORDER BY created_at, company", [eventId]);
  if (!list.length || list.some((s) => s.status !== "found")) return;
  const askRM = (a: string | null) => Number(a?.match(/RM\s?([\d,]+)/i)?.[1]?.replace(/,/g, "")) || 0;
  const steps: [string, number][] = [["accepted", 9], ["replied", 7], ["opened", 6], ["contacted", 4], ["declined", 8]];
  for (const [i, s] of list.slice(0, steps.length).entries()) {
    const [status, ago] = steps[i];
    const at = `now() - interval '${ago} days'`;
    if (status === "accepted") {
      const amount = Math.min(3000, Math.max(500, askRM(s.ask) || 1000));
      await query(
        `UPDATE sponsors SET status = 'accepted', contacted_at = ${at}, opened_at = ${at} + interval '1 day', replied_at = ${at} + interval '3 days', decided_at = ${at} + interval '4 days', offer_type = 'cash', offer_amount = $2, offer_note = 'Logo on the poster and a booth' WHERE id = $1`,
        [s.id, amount],
      );
    } else if (status === "declined") {
      await query(`UPDATE sponsors SET status = 'declined', contacted_at = ${at}, decided_at = ${at} + interval '5 days', notes = 'No budget left this quarter, try again next semester' WHERE id = $1`, [s.id]);
    } else {
      await query(
        `UPDATE sponsors SET status = $2, contacted_at = ${at}, opened_at = CASE WHEN $2 IN ('opened','replied') THEN ${at} + interval '1 day' END, replied_at = CASE WHEN $2 = 'replied' THEN ${at} + interval '3 days' END WHERE id = $1`,
        [s.id, status],
      );
    }
  }
}

/**
 * Replies to the mail Movents sent (caterer, facilities, sponsors, a speaker),
 * stored as received mail, so the event inbox has both sides. Each is added once.
 */
export async function sampleReplies(user: import("./types").User, eventId: string) {
  const { emailShell } = await import("./integrations/email");
  const ev = await one<{ title: string; date: string; pax: number; venue: string | null; mailbox: string | null }>(
    "SELECT e.title, e.date, e.pax, v.name AS venue, (SELECT address FROM event_mailboxes WHERE event_id = e.id) AS mailbox FROM events e LEFT JOIN venues v ON v.id = e.venue_id WHERE e.id = $1",
    [eventId],
  ).catch(() => null);
  if (!ev) return;
  const me = ev.mailbox ?? user.email ?? "committee@society.example";
  const first = user.name.split(" ")[0];
  const [food, sponsors, speaker] = await Promise.all([
    one<{ id: string; name: string; unit_price: number }>("SELECT id, name, unit_price FROM vendors WHERE event_id = $1 AND category = 'food' AND selected = true LIMIT 1", [eventId]),
    query<{ id: string; company: string; status: string; offer_amount: number | null; offer_note: string | null; contact_name: string | null }>("SELECT id, company, status, offer_amount, offer_note, contact_name FROM sponsors WHERE event_id = $1 AND status IN ('accepted', 'replied', 'declined')", [eventId]),
    one<{ id: string; name: string; email: string | null }>("SELECT id, name, email FROM speakers WHERE event_id = $1 ORDER BY name LIMIT 1", [eventId]),
  ]);
  const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const replies: { kind: string; from: string; related: string | null; subject: string; html: string; ago: number }[] = [
    {
      kind: "other_reply",
      from: "facilities.booking@university.example",
      related: null,
      subject: `Re: Venue booking request: ${ev.venue ?? "venue"}`,
      html: emailShell("Booking received", `<p>Hi ${first},</p><p>We have pencilled in <b>${ev.venue ?? "the room"}</b> for ${ev.title}. Please upload the approved proposal at least two weeks before so we can confirm the booking and the AV set-up.</p><p>Facilities Management</p>`),
      ago: 4,
    },
  ];
  if (food)
    replies.push({
      kind: "vendor_reply",
      from: `sales@${slug(food.name.split(" — ")[0].split(",")[0])}.example`,
      related: food.id,
      subject: `Re: Quotation request, ${ev.title}`,
      html: emailShell("Quotation", `<p>Hello ${first},</p><p>Thanks for reaching out. For ${ev.pax} pax we can do RM${Number(food.unit_price).toFixed(2)} per pax, halal certified, delivered 30 minutes before. A 30% deposit holds the date.</p><p>Best regards,<br>${food.name.split(" — ")[0]}</p>`),
      ago: 2,
    });
  for (const s of sponsors) {
    const who = s.contact_name ?? `${s.company} partnerships`;
    const body =
      s.status === "accepted"
        ? `<p>Hi ${first},</p><p>Happy to support ${ev.title}. ${s.offer_amount ? `We can sponsor RM${Number(s.offer_amount).toLocaleString("en-MY")}` : "We can cover it in kind"}${s.offer_note ? ` (${s.offer_note.toLowerCase()})` : ""}. Send over the invoice details and logo specs.</p><p>${who}</p>`
        : s.status === "replied"
          ? `<p>Hi ${first},</p><p>Thanks for the proposal. Could you share last year's turnout and what logo placement we would get? We will decide by Friday.</p><p>${who}</p>`
          : `<p>Hi ${first},</p><p>Thank you for thinking of us. Our budget for this quarter is committed, but do reach out again next semester.</p><p>${who}</p>`;
    replies.push({ kind: "sponsor_reply", from: `partnerships@${slug(s.company)}.example`, related: s.id, subject: `Re: Sponsorship for ${ev.title}`, html: emailShell("Sponsorship", body), ago: s.status === "accepted" ? 5 : s.status === "replied" ? 1 : 3 });
  }
  if (speaker)
    replies.push({
      kind: "speaker_reply",
      from: speaker.email ?? `${slug(speaker.name)}@speaker.example`,
      related: speaker.id,
      subject: `Re: Invitation to speak at ${ev.title}`,
      html: emailShell("Speaking invitation", `<p>Dear ${first},</p><p>Thank you for the invitation. I would be glad to join, ideally a 30-minute talk in the morning slot. Could you send the run of show and the expected audience?</p><p>Warm regards,<br>${speaker.name}</p>`),
      ago: 0.3,
    });
  for (const r of replies) {
    const have = await one("SELECT 1 FROM emails WHERE event_id = $1 AND kind = $2 AND COALESCE(related_id, '') = $3 AND status = 'received'", [eventId, r.kind, r.related ?? ""]);
    if (have) continue;
    await query(
      "INSERT INTO emails (id, event_id, kind, to_addr, intended_to, subject, body, status, provider, related_id, sent_at, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, 'received', 'gmail', $8, $9, $9)",
      [id("eml"), eventId, r.kind, me, r.from, r.subject, r.html, r.related, new Date(Date.now() - r.ago * 86_400_000)],
    );
  }
}

/** A few documents the committee already shared, so Files is not empty: a contact list, meeting notes, a signed form. */
export async function sampleFiles(user: import("./types").User, eventId: string) {
  if (await one("SELECT 1 FROM event_files WHERE event_id = $1 LIMIT 1", [eventId])) return;
  const ev = await one<{ title: string; date: string; venue: string | null }>("SELECT e.title, e.date, v.name AS venue FROM events e LEFT JOIN venues v ON v.id = e.venue_id WHERE e.id = $1", [eventId]);
  if (!ev) return;
  const members = await query<{ name: string; email: string; role: string }>(
    "SELECT u.name, u.email, COALESCE(ms.role, 'committee') AS role FROM event_members m JOIN users u ON u.id = m.user_id LEFT JOIN memberships ms ON ms.user_id = u.id AND ms.society_id = (SELECT society_id FROM events WHERE id = $1) WHERE m.event_id = $1 ORDER BY m.added_at",
    [eventId],
  );
  const { fmtDate } = await import("./appurl");
  const { renderPdf } = await import("./docs/render");
  const csv = ["Name,Role,Email,Phone", ...members.map((m, i) => `${m.name},${m.role.replace(/_/g, " ")},${m.email},012-${String(3104410 + i * 7319).slice(0, 7)}`)].join("\n");
  const notes = [
    `${ev.title}: kick-off notes`,
    "",
    "Decisions",
    `- Event on ${fmtDate(ev.date)}${ev.venue ? ` at ${ev.venue}` : ""}.`,
    "- Gemini drafts outreach; we check and send each email ourselves.",
    "- Budget goes to the President for sign-off before any deposit.",
    "",
    "Action items",
    "- Confirm speakers by next Friday.",
    "- Collect two written supplier quotes for food.",
    "- Book the venue and upload the confirmation here.",
  ].join("\n");
  const form = await renderPdf({
    title: "Venue booking form",
    subtitle: ev.title,
    meta: [["Date", fmtDate(ev.date)], ["Venue", ev.venue ?? "To be confirmed"], ["Requested by", user.name]],
    sections: [
      { title: "Booking", blocks: [{ type: "kv", rows: [["Purpose", ev.title], ["Setup", "Theatre seating, projector, two wireless mics"], ["Status", "Submitted to Facilities"]] }] },
      { title: "Signatures", blocks: [{ type: "table", head: ["Role", "Name", "Signed"], rows: [["Event lead", user.name, "Yes"], ["Faculty advisor", "", ""]] }] },
    ],
  });
  const files: [string, string, Buffer][] = [
    ["Venue booking form.pdf", "application/pdf", form],
    ["Committee contacts.csv", "text/csv", Buffer.from(csv)],
    ["Kick-off notes.txt", "text/plain", Buffer.from(notes)],
  ];
  for (const [i, [name, mime, data]] of files.entries()) {
    await query("INSERT INTO event_files (id, event_id, name, mime, size, data, uploaded_by, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, now() - ($8 || ' hours')::interval)", [
      id("fil"), eventId, name, mime, data.length, data, user.id, String(30 - i * 9),
    ]);
  }
}

/**
 * Bookings on every venue at the university for the next two months (lectures,
 * exams, other societies), so each venue's availability calendar shows real
 * busy and free time. Shared by every demo; tops a venue up only when it is quiet.
 */
export async function sampleVenueBookings(universityId: string) {
  const venues = await query<{ id: string; name: string }>("SELECT id, name FROM venues WHERE university_id = $1", [universityId]);
  const day = (n: number) => new Date(Date.now() + 8 * 3600_000 + n * 86_400_000).toISOString().slice(0, 10);
  const SOC = ["Debate Club", "Robotics Society", "Music Club", "Entrepreneurship Society", "Photography Club", "Red Crescent"];
  const CLASS = ["Lecture: Data Structures", "Lecture: Marketing 101", "Tutorial: Statistics", "Lab: Embedded Systems"];
  for (const [v, venue] of venues.entries()) {
    const have = await one<{ n: number }>("SELECT count(*)::int AS n FROM venue_bookings WHERE venue_id = $1 AND date >= $2", [venue.id, day(0)]);
    if (Number(have?.n) >= 6) continue;
    const rows: [string, string | null, string, string, string, string][] = [];
    // A weekly class, two society events and an exam, spread over eight weeks.
    for (let w = 0; w < 8; w++) rows.push([CLASS[v % CLASS.length], "Faculty timetable", "class", day(1 + ((v * 2) % 5) + w * 7), "09:00", "11:00"]);
    for (let k = 0; k < 4; k++) rows.push([`${SOC[(v + k) % SOC.length]} event`, SOC[(v + k) % SOC.length], "society", day(3 + ((v * 3 + k * 11) % 50)), k % 2 ? "19:00" : "14:00", k % 2 ? "22:00" : "17:00"]);
    rows.push([`Final exam: ${["Calculus", "Accounting", "Programming", "Biology"][v % 4]}`, "Examinations unit", "exam", day(40 + (v % 7)), "09:00", "12:00"]);
    for (const [title, holder, kind, date, start, end] of rows) {
      await query("INSERT INTO venue_bookings (id, venue_id, title, holder, kind, date, start_time, end_time) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)", [id("vbk"), venue.id, title, holder, kind, date, start, end]);
    }
  }
}

const FIRST = ["Aiman", "Nur Aisyah", "Jia Hui", "Arjun", "Mei Xin", "Haziq", "Siti", "Wei Lun", "Kavya", "Daniel", "Farah", "Jun Hao", "Priyanka", "Amirul", "Hui Min", "Ravi", "Alya", "Zhi Wei", "Nadia", "Marcus", "Iman", "Yi Ling", "Harith", "Sharmila"];
const LAST = ["Tan", "Rahman", "Lim", "Kumar", "Wong", "Ismail", "Lee", "Abdullah", "Ng", "Raj", "Chong", "Hassan", "Ong", "Nair", "Yusof", "Goh"];

/** Sample sign-ups (placeholder .example emails), so Registration and Door check-in have people to show. */
async function sampleRegistrations(eventId: string) {
  const ev = await one<{ pax: number }>("SELECT pax FROM events WHERE id = $1", [eventId]);
  const have = await one<{ n: number }>("SELECT count(*)::int AS n FROM rsvps WHERE event_id = $1", [eventId]);
  if (!ev || Number(have?.n) > 0) return;
  const { ticketCode } = await import("./agent/tools");
  const count = Math.min(48, Math.max(12, Math.round(ev.pax * 0.35)));
  const diets = [null, null, null, null, "Vegetarian", null, "No nuts", null, null, "Vegan"];
  for (let i = 0; i < count; i++) {
    const name = `${FIRST[i % FIRST.length]} ${LAST[(i * 7) % LAST.length]}`;
    const email = `${name.toLowerCase().replace(/[^a-z]+/g, ".")}.${i}@student.example`;
    await query("INSERT INTO rsvps (id, event_id, name, email, source, status, ticket, checked_in, dietary, created_at) VALUES ($1, $2, $3, $4, 'movents', $5, $6, false, $7, now() - ($8 || ' hours')::interval)", [
      id("rsv"), eventId, name, email, i % 17 === 16 ? "waitlist" : "going", ticketCode(), diets[i % diets.length], String((count - i) * 3),
    ]);
  }
}

async function sampleInboxAndMeetings(user: import("./types").User, eventId: string) {
  const { emailShell } = await import("./integrations/email");
  const { fmtDate } = await import("./appurl");
  const M = await import("./meetings");
  const ev = await one<{ title: string; date: string; start_time: string; end_time: string; pax: number; venue: string | null }>(
    "SELECT e.title, e.date, e.start_time, e.end_time, e.pax, v.name AS venue FROM events e LEFT JOIN venues v ON v.id = e.venue_id WHERE e.id = $1",
    [eventId],
  );
  if (!ev) return;
  const food = await one<{ name: string; unit_price: number }>("SELECT name, unit_price FROM vendors WHERE event_id = $1 AND category = 'food' AND selected = true LIMIT 1", [eventId]);
  const team = await query<{ user_id: string; name: string }>("SELECT m.user_id, u.name FROM event_members m JOIN users u ON u.id = m.user_id WHERE m.event_id = $1 ORDER BY m.added_at", [eventId]);
  const day = (n: number) => new Date(Date.now() + n * 86_400_000);
  const iso = (d: Date) => new Date(d.getTime() + 8 * 3600_000).toISOString().slice(0, 10);
  const mails = [
    {
      kind: "other",
      to: "facilities.booking@university.example",
      subject: `Venue booking request: ${ev.venue ?? "venue"}, ${fmtDate(ev.date)}`,
      html: emailShell("Venue booking request", `<p>Dear Facilities team,</p><p>We would like to book <b>${ev.venue ?? "a lecture theatre"}</b> for <b>${ev.title}</b> on ${fmtDate(ev.date)}, ${ev.start_time} to ${ev.end_time}, for about ${ev.pax} participants, with a projector and two wireless mics.</p><p>Thank you,<br>${user.name}</p>`),
      ago: 5,
    },
    {
      kind: "vendor_quote",
      to: "quotes@caterer.example",
      subject: `Quotation request, ${ev.title} (${fmtDate(ev.date)})`,
      html: emailShell("Quotation request", `<p>Hello ${food?.name.split(" — ")[0] ?? "catering"} team,</p><p>Could you quote halal packed meals for about ${ev.pax} people on ${fmtDate(ev.date)}? Your listed price is around RM${food?.unit_price ?? 15} per pax. Please confirm availability, final price and delivery time.</p><p>Thank you,<br>${user.name}</p>`),
      ago: 3,
    },
    {
      kind: "attendee_reminder",
      to: "members@society.example",
      subject: `Save the date: ${ev.title}`,
      html: emailShell(ev.title, `<p>Hi everyone,</p><p>Save the date: <b>${ev.title}</b> is on ${fmtDate(ev.date)} at ${ev.venue ?? "campus"}. Registration opens next week; spots are limited to ${ev.pax}.</p><p>See you there!</p>`),
      ago: 1,
    },
  ];
  for (const m of mails) {
    await query(
      "INSERT INTO emails (id, event_id, kind, to_addr, intended_to, subject, body, status, provider, sent_by, sent_at, created_at) VALUES ($1, $2, $3, $4, $4, $5, $6, 'sent', 'demo', $7, $8, $8)",
      [id("eml"), eventId, m.kind, m.to, m.subject, m.html, user.id, day(-m.ago)],
    );
  }
  const attendees = team.map((t) => t.user_id);
  const owner = (i: number) => team[i % Math.max(1, team.length)]?.user_id ?? user.id;
  const kickoff = await M.createMeetingRecord(user, eventId, {
    title: "Kick-off",
    date: iso(day(-4)),
    time: "20:00",
    duration_min: 45,
    meeting_url: "https://meet.google.com/new",
    attendees,
    agenda: ["Goals and audience", "Budget cap and funding", "Speakers shortlist", "Who owns what"],
  });
  await M.recordMinutes(user, kickoff.id, {
    minutes: `## Goals
- Run ${ev.title} for about ${ev.pax} students on ${fmtDate(ev.date)}.
## Budget
- Stay inside the cap; ask sponsors to cover food.
## Speakers
- Shortlist from the Speakers tab; invites go out this week.`,
    decisions: [`Venue: ${ev.venue ?? "to be booked"}`, "Halal catering only", "Registration through the event page"],
    action_items: [
      { text: "Send the venue booking request to Facilities", owner_id: owner(0), due_date: iso(day(2)) },
      { text: "Confirm the caterer's quote", owner_id: owner(1), due_date: iso(day(5)) },
      { text: "Draft the poster and social posts", owner_id: owner(2), due_date: iso(day(7)) },
    ],
    attended: attendees,
    create_tasks: true,
    mark_done: true,
  });
  await M.createMeetingRecord(user, eventId, {
    title: "Weekly sync",
    date: iso(day(3)),
    time: "20:30",
    duration_min: 30,
    meeting_url: "https://meet.google.com/new",
    attendees,
    agenda: ["Venue confirmed?", "Speaker replies", "Sponsor replies", "Promotion plan"],
  });
}

/** How far the sample events are, for the setting-up screen. */
export async function demoProgress(societyId: string) {
  const events = await query<{ title: string }>("SELECT title FROM events WHERE society_id = $1 ORDER BY created_at", [societyId]);
  const done = await one("SELECT 1 FROM audit_logs WHERE society_id = $1 AND action = 'demo.seeded' LIMIT 1", [societyId]);
  return { events: events.map((e) => e.title), total: SAMPLE_EVENTS.length, done: Boolean(done) };
}
