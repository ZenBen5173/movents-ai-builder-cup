import type { Phase, Role, Sop, Venue } from "./types";

// Pure planning logic — no DB, no network — so it can be unit tested.

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}
export function addDays(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return iso(d);
}
export function diffDays(from: string, to: string) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

// ------------------------------------------------------------------ prompt

export type ParsedPrompt = {
  pax: number;
  budget: number;
  date: string;
  topic: string;
  format: string;
  title: string;
  university: string | null;
  startTime: string;
  endTime: string;
  missing: string[];
  team: string[];
  suppliers: string[];
};

/** Words that follow a headcount: "150 pax", "120-person", "80 people", "200 students". */
const HEADCOUNT = String.raw`(?:pax|people|persons?|attendees?|participants?|students?|guests?|delegates?)`;

export function parsePrompt(prompt: string, todayIso: string): ParsedPrompt {
  const p = prompt.replace(/\s+/g, " ").trim();
  const missing: string[] = [];

  const paxM = p.match(new RegExp(String.raw`(\d{1,5})\s*-?\s*${HEADCOUNT}\b`, "i"));
  const pax = paxM ? Number(paxM[1]) : (missing.push("pax"), 100);

  const budM =
    p.match(/budget(?:\s+of|\s+is|:)?\s*(?:RM|MYR)?\s*([\d,]+(?:\.\d+)?)\s*(k)?/i) ?? p.match(/(?:RM|MYR)\s*([\d,]+(?:\.\d+)?)\s*(k)?/i);
  const budget = budM ? Number(budM[1].replace(/,/g, "")) * (budM[2] ? 1000 : 1) : (missing.push("budget"), 3000);

  let date: string | null = null;
  const dm = p.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?(?:\s+(\d{4}))?/i);
  const md = p.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?/i);
  const isoM = p.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (isoM) date = `${isoM[1]}-${isoM[2]}-${isoM[3]}`;
  else if (dm || md) {
    const day = Number(dm ? dm[1] : md![2]);
    const mon = MONTHS.indexOf((dm ? dm[2] : md![1]).toLowerCase().slice(0, 3));
    const yearGiven = dm ? dm[3] : md![3];
    let year = yearGiven ? Number(yearGiven) : Number(todayIso.slice(0, 4));
    let candidate = iso(new Date(Date.UTC(year, mon, day)));
    if (!yearGiven && candidate < todayIso) {
      year += 1;
      candidate = iso(new Date(Date.UTC(year, mon, day)));
    }
    date = candidate;
  }
  if (!date) {
    missing.push("date");
    date = addDays(todayIso, 56);
  }

  const uniM = p.match(/\b(?:at|in)\s+([A-Z][A-Za-z]+(?:\s+(?:University|College|Uni))?)/);
  const university = uniM ? uniM[1].replace(/\s+(University|College|Uni)$/i, "") : null;

  // "150-pax AI talk at Sunway" / "a 120-person AI talk on …" → "AI talk"
  let phrase =
    p.match(new RegExp(String.raw`\d+\s*-?\s*${HEADCOUNT}\s+(.+?)\s+(?:at|in|on|for)\b`, "i"))?.[1] ??
    p.match(new RegExp(String.raw`plan\s+(?:a|an|the)\s+(?:\d+\s*-?\s*${HEADCOUNT}\s+)?(.+?)\s+(?:at|in|on|for)\b`, "i"))?.[1] ??
    "event";
  phrase = phrase.replace(/^(a|an|the)\s+/i, "");
  const formatM = phrase.match(/\b(talk|workshop|seminar|conference|hackathon|meetup|forum|panel|competition|bootcamp|webinar|summit|networking night|career fair)\b/i);
  const format = formatM ? formatM[1].toLowerCase() : "event";
  const topic = phrase.replace(new RegExp(`\\b${format}\\b`, "i"), "").trim() || phrase;
  const cap = (s: string) => s.replace(/\b([a-z])/g, (c) => c.toUpperCase()).replace(/\bAi\b/g, "AI");
  const title = `${cap(topic)} ${cap(format)}${university ? ` @ ${cap(university)}` : ""}`.trim();

  const timeM = p.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)\s*(?:-|to|–)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
  const to24 = (h: string, m: string | undefined, ap: string) => {
    let hh = Number(h) % 12;
    if (ap.toLowerCase() === "pm") hh += 12;
    return `${String(hh).padStart(2, "0")}:${m ?? "00"}`;
  };
  const startTime = timeM ? to24(timeM[1], timeM[2], timeM[3]) : "14:00";
  const endTime = timeM ? to24(timeM[4], timeM[5], timeM[6]) : "17:00";

  // "with Jason and Priya" / "team: Jason, Priya"
  const teamM = p.match(/\b(?:[Ww]ith|[Tt]eam:?)\s+([A-Z][\w.@]*(?:\s*(?:,|and|&)\s*[A-Z][\w.@]*)*)/);
  const team = teamM ? teamM[1].split(/\s*(?:,|\band\b|&)\s*/).map((x) => x.trim().replace(/[.,;]+$/, "")).filter(Boolean) : [];

  // "Suppliers: Mix Mix Catering, CUSTA" / "use Tastytouch for food" / "catering from Mix Mix"
  const suppliers: string[] = [];
  const listM = p.match(/\b[Ss]uppliers?:\s*([^.;]+)/);
  if (listM) suppliers.push(...listM[1].split(/\s*(?:,|\band\b|&)\s*/));
  for (const m of p.matchAll(/\b(?:[Uu]se|[Cc]atering (?:from|by)|[Ff]ood from|[Mm]erch from|[Pp]rint(?:ing)? (?:from|by))\s+([A-Z][\w&.'-]*(?:\s+[A-Z][\w&.'-]*)*)/g)) suppliers.push(m[1]);
  const supplierNames = [...new Set(suppliers.map((x) => x.trim().replace(/\s+for\s+.*$/i, "").replace(/[.,;]+$/, "")).filter((x) => x.length > 1))];

  return { pax, budget, date, topic: cap(topic), format, title, university, startTime, endTime, missing, team, suppliers: supplierNames };
}

// ------------------------------------------------------------------ lessons

export type LessonSignals = { show_rate?: number; follow_up_days?: number; lanyards_attendees?: boolean; av_check?: boolean };

export function parseSignals(content: string): LessonSignals {
  const m = content.match(/```signals\s*([\s\S]*?)```/);
  if (!m) return {};
  try {
    return JSON.parse(m[1]) as LessonSignals;
  } catch {
    return {};
  }
}

export function lessonBullets(content: string) {
  return content
    .split("\n")
    .filter((l) => l.trim().startsWith("- "))
    .map((l) => l.trim().slice(2));
}

// ------------------------------------------------------------------ timeline

export type PlannedTask = {
  key: string;
  phase: Phase;
  title: string;
  due_date: string;
  start_date: string;
  owner_role: Role;
  sop_ref: string | null;
  deps: string[];
  priority: "low" | "medium" | "high" | "urgent";
  compressed?: boolean;
};

// Which SOP lead time depends on what. Unknown keys (other universities) depend on the draft.
const LEAD_DEPS: Record<string, string[]> = {
  venue_booking: ["datecheck"],
  proposal_submission: ["draft", "venue_booking"],
  speaker_declaration: ["speakers"],
  publicity_approval: ["poster"],
  catering_confirmation: ["quotes", "proposal_submission"],
};

export function buildTimeline(eventDate: string, todayIso: string, sop: Sop): PlannedTask[] {
  const w = (weeks: number) => addDays(eventDate, -Math.round(weeks * 7));
  const t = (key: string, phase: Phase, title: string, due: string, owner_role: Role, deps: string[] = [], days = 3, priority: PlannedTask["priority"] = "medium", sop_ref: string | null = null): PlannedTask => ({
    key,
    phase,
    title,
    due_date: due,
    start_date: addDays(due, -days),
    owner_role,
    sop_ref,
    deps,
    priority,
  });

  const tasks: PlannedTask[] = [
    t("objectives", "concept", "Define objectives, audience and success metrics", w(12), "committee", [], 5),
    t("budget", "concept", "Confirm budget cap and funding sources", w(12), "president", ["objectives"], 3, "high"),
    t("datecheck", "concept", "Check date against university calendar and other society events", w(12), "committee", [], 2),
    t("speakers", "planning", "Shortlist speakers and send invitations", w(10), "director", ["objectives"], 7, "high"),
    t("quotes", "planning", "Request quotes from suppliers (food, merchandise)", w(9), "director", ["budget"], 5),
    t("draft", "planning", "Draft proposal, budget sheet and risk register", w(8), "committee", ["quotes", "speakers"], 5, "high"),
  ];
  for (const l of sop.lead_times) {
    const phase: Phase = l.weeks_before >= 6 ? "planning" : l.weeks_before >= 3 ? "promotion" : "execution";
    tasks.push(t(l.key, phase, `SOP: ${l.label}`, w(l.weeks_before), l.owner_role, LEAD_DEPS[l.key] ?? ["draft"], 3, "urgent", `${l.label} (≥${l.weeks_before} wks before)`));
  }
  const has = (k: string) => sop.lead_times.some((l) => l.key === k);
  tasks.push(
    t("luma", "promotion", "Create Luma / Meetup event page", w(6), "committee", has("venue_booking") ? ["venue_booking"] : ["draft"], 2),
    t("poster", "promotion", "Design poster and social media kit", w(5), "committee", has("venue_booking") ? ["venue_booking"] : ["draft"], 4),
    t("campaign", "promotion", "Launch Instagram & LinkedIn campaign", w(4), "committee", has("publicity_approval") ? ["publicity_approval"] : ["poster"], 2),
    t("blast", "promotion", "Email blast to members and faculty mailing list", w(4), "committee", ["luma"], 1),
    t("headcount", "execution", "Final headcount, dietary list and name tags", w(1), "committee", ["luma"], 2, "high"),
    t("brief", "execution", "Brief volunteers and walk through the run sheet", addDays(eventDate, -2), "director", ["headcount"], 1),
    t("avtest", "execution", "AV & mic test at venue", addDays(eventDate, -1), "director", has("venue_booking") ? ["venue_booking"] : [], 1),
    t("eventday", "execution", "Event day", eventDate, "president", ["brief", "avtest", ...(has("catering_confirmation") ? ["catering_confirmation"] : []), ...(has("speaker_declaration") ? ["speaker_declaration"] : [])], 0, "urgent"),
    t("survey", "post", "Send feedback survey to attendees", addDays(eventDate, 1), "committee", ["eventday"], 1),
    t("thanks", "post", "Thank-you emails to speakers and vendors", addDays(eventDate, 2), "director", ["eventday"], 1, "low"),
    t("report", "post", "Post-event report", addDays(eventDate, 7), "president", ["survey"], 3),
    t("claims", "post", `SOP: Submit claims with receipts`, addDays(eventDate, sop.budget_rules.claims_days_after), "director", ["eventday"], 5, "high", `Claims within ${sop.budget_rules.claims_days_after} days after event`),
  );
  const keys = new Set(tasks.map((x) => x.key));
  for (const task of tasks) {
    task.deps = task.deps.filter((d) => keys.has(d) && d !== task.key);
    // Anything already in the past gets pulled to today — the schedule is compressed, and marked so.
    if (task.due_date < todayIso && task.phase !== "post") {
      task.due_date = todayIso;
      task.compressed = true;
    }
    if (task.start_date < todayIso) task.start_date = todayIso;
    if (task.start_date > task.due_date) task.start_date = task.due_date;
  }
  return tasks.sort((a, b) => a.due_date.localeCompare(b.due_date));
}

/** Tasks whose dependencies are not all done. */
export function blockedBy<T extends { id: string; title: string; status: string; depends_on: string[] }>(task: T, all: T[]) {
  return task.depends_on.map((d) => all.find((x) => x.id === d)).filter((x): x is T => Boolean(x) && x!.status !== "done");
}

/** Longest chain of dependencies ending at each task — the critical path ends at the event day. */
export function criticalPath<T extends { id: string; depends_on: string[]; start_date: string | null; due_date: string }>(tasks: T[], endId: string) {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const memo = new Map<string, string[]>();
  const walk = (id: string, seen: Set<string>): string[] => {
    if (memo.has(id)) return memo.get(id)!;
    const t = byId.get(id);
    if (!t || seen.has(id)) return [];
    seen.add(id);
    let best: string[] = [];
    for (const d of t.depends_on) {
      const p = walk(d, seen);
      if (p.length > best.length) best = p;
    }
    const path = [...best, id];
    memo.set(id, path);
    return path;
  };
  return walk(endId, new Set());
}


export type LeadCheck = { key: string; label: string; deadline: string; weeks_before: number; passed: boolean; days_late: number };

export function checkLeadTimes(eventDate: string, todayIso: string, sop: Sop, venueLeadWeeks?: number) {
  const checks: LeadCheck[] = sop.lead_times.map((l) => {
    const weeks = l.key === "venue_booking" && venueLeadWeeks ? Math.max(l.weeks_before, venueLeadWeeks) : l.weeks_before;
    const deadline = addDays(eventDate, -weeks * 7);
    const late = diffDays(deadline, todayIso);
    return { key: l.key, label: l.label, deadline, weeks_before: weeks, passed: late <= 0, days_late: Math.max(0, late) };
  });
  const maxWeeks = Math.max(...checks.map((c) => c.weeks_before));
  // Earliest date that meets every lead time, kept on the same weekday as requested.
  let suggested = addDays(todayIso, maxWeeks * 7);
  const wantDow = new Date(`${eventDate}T00:00:00Z`).getUTCDay();
  while (new Date(`${suggested}T00:00:00Z`).getUTCDay() !== wantDow) suggested = addDays(suggested, 1);
  return { checks, allPassed: checks.every((c) => c.passed), suggestedDate: suggested };
}

// ------------------------------------------------------------------ venue

export type Booking = { venue_id: string | null; date: string; start_time: string; end_time: string; title: string; id: string };

export function overlaps(a: { start_time: string; end_time: string }, b: { start_time: string; end_time: string }) {
  return a.start_time < b.end_time && b.start_time < a.end_time;
}

export function selectVenue(venues: Venue[], bookings: Booking[], pax: number, ev: { date: string; start_time: string; end_time: string; id?: string }) {
  const considered: { venue: Venue; ok: boolean; reason: string }[] = [];
  const sorted = [...venues].sort((a, b) => a.capacity - b.capacity || a.cost - b.cost);
  let chosen: Venue | null = null;
  for (const v of sorted) {
    if (v.capacity < pax) {
      considered.push({ venue: v, ok: false, reason: `capacity ${v.capacity} < ${pax}` });
      continue;
    }
    const clash = bookings.find((b) => b.venue_id === v.id && b.date === ev.date && b.id !== ev.id && overlaps(b, ev));
    if (clash) {
      considered.push({ venue: v, ok: false, reason: `clash with "${clash.title}" ${clash.start_time} to ${clash.end_time}` });
      continue;
    }
    considered.push({ venue: v, ok: true, reason: `fits ${pax} (capacity ${v.capacity}), free on ${ev.date}` });
    chosen = v;
    break;
  }
  return { chosen, considered };
}

// ------------------------------------------------------------------ attendance

export function predictAttendance(registered: number, waitlist: number, showRate: number, capacity: number) {
  const fromRegistered = registered * showRate;
  const free = Math.max(0, capacity - fromRegistered);
  const fromWaitlist = Math.min(free, waitlist * 0.3);
  const predicted = Math.round(fromRegistered + fromWaitlist);
  return { predicted, low: Math.round(predicted * 0.88), high: Math.round(Math.min(capacity, predicted * 1.12)) };
}

// ------------------------------------------------------------------ budget

export type Supplier = { id?: string; category: string; name: string; url: string | null; unit_price: number; rating: number | null; unit: string };

export type DraftLine = {
  key: string;
  category: string;
  description: string;
  qty: number;
  unit_cost: number;
  estimated: number;
  supplier: Supplier | null;
  funding_source: string;
};

export type BudgetIteration = { label: string; lines: DraftLine[]; subtotal: number; contingency: number; total: number; withinCap: boolean; change: string };

export type BudgetInput = {
  pax: number;
  predicted: number;
  cap: number;
  contingencyPct: number;
  foodBufferPct: number;
  suppliers: Record<string, Supplier[]>;
  venueCost: number;
  speakers: number;
  crew: number;
  coreCommittee: number;
  lanyardsForAttendees: boolean;
  /** Supplier names the organiser asked for in the brief; they win over ratings and price. */
  preferred?: string[];
};

const r2 = (n: number) => Math.round(n * 100) / 100;

function totals(lines: DraftLine[], cap: number, pct: number) {
  const subtotal = r2(lines.reduce((s, l) => s + l.estimated, 0));
  const contingency = r2(subtotal * (pct / 100));
  const total = r2(subtotal + contingency);
  return { subtotal, contingency, total, withinCap: total <= cap };
}

function line(key: string, category: string, description: string, qty: number, supplier: Supplier | null, unitCost?: number, funding = "Society fund"): DraftLine {
  const unit = unitCost ?? supplier?.unit_price ?? 0;
  return { key, category, description, qty, unit_cost: r2(unit), estimated: r2(qty * unit), supplier, funding_source: funding };
}

/**
 * Draft → validate → adapt. Starts from the society's top-rated suppliers,
 * then swaps to cheapest, then applies cuts in priority order until the total
 * (including contingency) fits the cap. Every iteration is kept for the trace.
 */
export function composeBudget(input: BudgetInput): { iterations: BudgetIteration[]; final: BudgetIteration; shortfall: number } {
  const pick = (cat: string, mode: "best" | "cheapest") => {
    const list = input.suppliers[cat] ?? [];
    const wanted = list.find((s) => (input.preferred ?? []).some((w) => s.name.toLowerCase().includes(w.toLowerCase())));
    if (wanted) return wanted;
    if (!list.length) return null;
    return [...list].sort((a, b) => (mode === "best" ? (b.rating ?? 0) - (a.rating ?? 0) || a.unit_price - b.unit_price : a.unit_price - b.unit_price))[0];
  };
  const foodPax = Math.ceil(input.predicted * (1 + input.foodBufferPct / 100));
  const lanyardQty = input.lanyardsForAttendees ? input.pax + input.crew : input.crew + input.speakers;

  type Opts = { tees?: number; speakerGift?: number; foodBuffer?: number; crewTags?: boolean; refreshments?: boolean };
  const build = (mode: "best" | "cheapest", o: Opts = {}) => {
    const fp = o.foodBuffer !== undefined ? Math.ceil(input.predicted * (1 + o.foodBuffer / 100)) : foodPax;
    const food = pick("food", mode);
    const tee = pick("tshirt", mode);
    const lan = pick("lanyard", mode);
    const holder = pick("cardholder", mode);
    const lines: DraftLine[] = [
      o.refreshments
        ? line("food", "Food & beverage", `Light refreshments (tea break) for ${fp} pax, est. 50% of cheapest meal quote${food ? `, ${food.name}` : ""}; get written quote`, fp, food, (food?.unit_price ?? 0) * 0.5)
        : line("food", "Food & beverage", `Catering for ${fp} pax (predicted ${input.predicted} + buffer)${food ? `, ${food.name}` : ""}`, fp, food),
      line("tshirt", "Merchandise", `Crew T-shirts${tee ? `, ${tee.name}` : ""}`, o.tees ?? input.crew, tee),
      line("lanyard", "Merchandise", `Lanyards (${input.lanyardsForAttendees ? "all attendees + crew" : "crew & speakers"})${lan ? `, ${lan.name}` : ""}`, lanyardQty, lan),
      line("cardholder", "Merchandise", `Name-tag holders${o.crewTags ? " (crew & speakers; attendees get printed stickers)" : ""}${holder ? `, ${holder.name}` : ""}`, o.crewTags ? input.crew + input.speakers : input.pax, holder),
      line("speaker", "Speakers", "Speaker token of appreciation", input.speakers, null, o.speakerGift ?? 80),
      line("printing", "Publicity", "Posters, bunting & printed signage", 1, null, 120),
    ];
    if (input.venueCost > 0) lines.push(line("venue", "Venue", "Venue rental", 1, null, input.venueCost, "Student LIFE subsidy"));
    return lines;
  };

  const iterations: BudgetIteration[] = [];
  const push = (label: string, lines: DraftLine[], change: string) => {
    const t = totals(lines, input.cap, input.contingencyPct);
    const it = { label, lines, ...t, change };
    iterations.push(it);
    return it;
  };

  let current = push("Draft v1, top-rated suppliers", build("best"), "Initial draft using the society's highest-rated suppliers");
  if (current.withinCap) return { iterations, final: current, shortfall: 0 };

  current = push("Adapt 1, cheapest suppliers", build("cheapest"), `Over cap by RM${r2(current.total - input.cap)} → swapped every category to the cheapest quote`);
  const steps: { label: string; opts: Opts; why: string }[] = [
    { label: "Adapt 2, T-shirts for core committee only", opts: { tees: input.coreCommittee }, why: `Cut crew T-shirts from ${input.crew} to ${input.coreCommittee} (core committee)` },
    { label: "Adapt 3, smaller speaker tokens", opts: { tees: input.coreCommittee, speakerGift: 50 }, why: "Reduced speaker tokens from RM80 to RM50 each" },
    { label: "Adapt 4, no food buffer", opts: { tees: input.coreCommittee, speakerGift: 50, foodBuffer: 0 }, why: "Dropped the food buffer, cater exactly to predicted attendance" },
    { label: "Adapt 5, name tags for crew only", opts: { tees: input.coreCommittee, speakerGift: 50, foodBuffer: 0, crewTags: true }, why: "Name-tag holders for crew & speakers only; attendees get printed stickers" },
    { label: "Adapt 6, light refreshments", opts: { tees: input.coreCommittee, speakerGift: 50, foodBuffer: 0, crewTags: true, refreshments: true }, why: "Switched from meals to a tea-break (estimated at 50% of the cheapest meal quote)" },
  ];
  for (const s of steps) {
    if (current.withinCap) break;
    current = push(s.label, build("cheapest", s.opts), `Still over by RM${r2(current.total - input.cap)} → ${s.why}`);
  }
  return { iterations, final: current, shortfall: current.withinCap ? 0 : r2(current.total - input.cap) };
}

// ------------------------------------------------------------------ risks

export type DraftRisk = { category: string; description: string; likelihood: number; impact: number; mitigation: string; contingency: string; owner_role: Role };

export function draftRisks(o: { pax: number; venueName: string; month: number; outdoor: boolean; hasExternalSpeakers: boolean; weatherNote: string; foodPax: number }): DraftRisk[] {
  const monsoon = [10, 11, 12, 0, 1].includes(o.month);
  return [
    { category: "Weather", description: `Heavy rain / thunderstorm on the day. ${o.weatherNote}`, likelihood: monsoon ? 4 : 2, impact: o.outdoor ? 4 : 2, mitigation: `Indoor venue (${o.venueName}); signage along covered walkways; remind attendees to plan for traffic.`, contingency: "If flash floods or LRT/BRT disruption: start 20 min late, livestream talk, send SMS/IG update by 12:00.", owner_role: "president" },
    { category: "Speakers", description: "Speaker cancels or is late", likelihood: 2, impact: 5, mitigation: "Confirm 7 days and 1 day before; collect slides 2 days before; keep a backup speaker on standby.", contingency: "Swap to panel format with remaining speakers; play recorded talk.", owner_role: "director" },
    { category: "Attendance", description: `Low turnout vs ${o.pax} registered`, likelihood: 3, impact: 3, mitigation: "Reminder cadence (6w/4w/2w/3d/day-of); waitlist; class-rep outreach.", contingency: "Open walk-ins; move to smaller room if under 60%.", owner_role: "committee" },
    { category: "Capacity", description: "Over-capacity / fire safety breach", likelihood: 2, impact: 5, mitigation: `Cap registration at venue capacity; head-count at door; keep aisles clear.`, contingency: "Overflow room with stream; stop admissions at capacity.", owner_role: "director" },
    { category: "Food", description: `Food shortage or dietary issue (catering ${o.foodPax} pax)`, likelihood: 3, impact: 3, mitigation: "Halal-certified caterer; collect dietary needs at RSVP; label vegetarian/allergen trays.", contingency: "Petty-cash top-up from contingency for snacks.", owner_role: "director" },
    { category: "AV / Tech", description: "Projector, mic or audio failure", likelihood: 3, impact: 4, mitigation: "AV test day before and at T-30 min (lesson from last event); spare HDMI/USB-C adapters; slides on USB.", contingency: "Portable speaker + handheld mic backup; IT helpdesk number on run sheet.", owner_role: "director" },
    { category: "Health & safety", description: "Medical emergency", likelihood: 1, impact: 5, mitigation: "First-aider on committee; know nearest AED and clinic; emergency contacts on run sheet.", contingency: "Call campus security, then 999; designated escort to entrance.", owner_role: "president" },
    { category: "Compliance", description: "Missing SOP approvals (publicity, speaker declaration)", likelihood: 3, impact: 4, mitigation: "Agent-tracked SOP deadlines; approval queue with President sign-off.", contingency: "Hold publicity until approved; escalate to faculty advisor.", owner_role: "president" },
    ...(o.hasExternalSpeakers
      ? [{ category: "Reputation", description: "External speaker content conflicts with university policy", likelihood: 1, impact: 4, mitigation: "Brief speakers on guidelines; review slides beforehand.", contingency: "MC steers Q&A; advisor present.", owner_role: "president" as Role }]
      : []),
    { category: "Finance", description: "Spend overrun beyond approved budget", likelihood: 2, impact: 3, mitigation: "10% contingency; alert at 90% spend; all spend over threshold needs President approval.", contingency: "Cut optional merchandise; seek sponsor top-up.", owner_role: "president" },
  ];
}

// ------------------------------------------------------------------ run sheet

export function toMin(t: string) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}
export function toTime(min: number) {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

/** Run sheet in 15-minute blocks from setup to teardown. */
export function buildRunsheet(start: string, end: string, speakers: string[], venue: string) {
  const s = toMin(start);
  const e = toMin(end);
  const items: { start_time: string; end_time: string; activity: string; owner: string; location: string; notes: string }[] = [];
  const add = (from: number, mins: number, activity: string, owner: string, notes = "") => {
    for (let t = from; t < from + mins; t += 15) {
      items.push({ start_time: toTime(t), end_time: toTime(t + 15), activity: t === from ? activity : `${activity} (cont.)`, owner, location: venue, notes: t === from ? notes : "" });
    }
  };
  add(s - 60, 30, "Venue setup: seating, banners, registration desk", "Logistics");
  add(s - 30, 15, "AV & mic check with speakers", "Logistics", "Test every mic from the back row");
  add(s - 15, 15, "Registration opens, QR check-in", "Programmes", "Volunteers at door with tablet");
  let t = s;
  add(t, 15, "Opening & welcome by President", "President");
  t += 15;
  const slots = Math.max(1, speakers.length);
  const talk = Math.max(30, Math.floor((e - s - 15 - 30 - 30 - 15) / slots / 15) * 15);
  speakers.forEach((sp, i) => {
    add(t, talk, `Talk ${i + 1}: ${sp}`, "Programmes", "Timekeeper shows 5-min card");
    t += talk;
    if (i === 0 && speakers.length > 1) {
      add(t, 15, "Tea break & networking", "Logistics", "Refreshments served");
      t += 15;
    }
  });
  const remaining = e - t - 15;
  if (remaining >= 15) {
    add(t, remaining, "Panel Q&A with speakers", "Programmes", "Roving mic");
    t += remaining;
  }
  add(t, 15, "Closing, group photo & feedback QR", "President", "Show feedback survey QR on screen");
  add(e, 30, "Teardown & venue handover", "Logistics");
  return items;
}

export const PROMO_CHANNELS: { channel: string; title: string; weeks: number }[] = [
  { channel: "Instagram", title: "Teaser post + save-the-date", weeks: 6 },
  { channel: "LinkedIn", title: "Event announcement on society page", weeks: 5 },
  { channel: "Poster", title: "Poster submitted for SLE publicity approval", weeks: 2.5 },
  { channel: "Email", title: "Email blast to members & faculty list", weeks: 4 },
  { channel: "Instagram", title: "Speaker spotlight carousel", weeks: 3 },
  { channel: "Poster", title: "Print & put up approved posters on campus boards", weeks: 2 },
  { channel: "WhatsApp", title: "Class-rep group broadcast", weeks: 2 },
  { channel: "Instagram", title: "Countdown stories", weeks: 3 / 7 },
  { channel: "Email", title: "Day-of reminder with venue map", weeks: 0 },
];

export const REMINDER_CADENCE: { label: string; days: number }[] = [
  { label: "6 weeks before", days: 42 },
  { label: "4 weeks before", days: 28 },
  { label: "2 weeks before", days: 14 },
  { label: "3 days before", days: 3 },
  { label: "Day of event", days: 0 },
];

// ------------------------------------------------------------------ feedback themes

const THEMES: { theme: string; words: RegExp }[] = [
  { theme: "Q&A / interaction time", words: /q&a|question|interact|discussion/i },
  { theme: "Food & refreshments", words: /food|lunch|snack|refresh|ran out/i },
  { theme: "Audio / AV quality", words: /audio|sound|mic|hear|projector|screen/i },
  { theme: "Content depth", words: /basic|advanced|depth|deeper|content|too easy/i },
  { theme: "Venue comfort", words: /cold|hot|room|seat|venue|crowded/i },
  { theme: "Timing & punctuality", words: /start on time|on time|late|too long|too short|punctual|overran/i },
  { theme: "Speaker quality", words: /speaker|clear|engaging|insight/i },
  { theme: "Hands-on / demos", words: /hands-on|demo|notebook|practical|example/i },
  { theme: "Materials & follow-up", words: /slides|share|recording|material/i },
  { theme: "Networking", words: /network|connect|meet/i },
];

export function feedbackThemes(rows: { liked: string | null; improve: string | null }[]) {
  const pos = new Map<string, number>();
  const neg = new Map<string, number>();
  for (const r of rows) {
    for (const t of THEMES) {
      if (r.liked && t.words.test(r.liked)) pos.set(t.theme, (pos.get(t.theme) ?? 0) + 1);
      if (r.improve && t.words.test(r.improve)) neg.set(t.theme, (neg.get(t.theme) ?? 0) + 1);
    }
  }
  const sort = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1]).map(([theme, count]) => ({ theme, count }));
  return { strengths: sort(pos), improvements: sort(neg) };
}

export function nps(scores: number[]) {
  if (!scores.length) return { nps: 0, promoters: 0, passives: 0, detractors: 0, n: 0 };
  const promoters = scores.filter((s) => s >= 9).length;
  const detractors = scores.filter((s) => s <= 6).length;
  const passives = scores.length - promoters - detractors;
  return { nps: Math.round(((promoters - detractors) / scores.length) * 100), promoters, passives, detractors, n: scores.length };
}
