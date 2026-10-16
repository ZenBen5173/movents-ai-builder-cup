import "server-only";
import { esc } from "../html";
import crypto from "node:crypto";
import { id, insert, one, query, transaction, update } from "../db";
import { audit } from "../audit";
import { gate, speakerEmail, type GateResult } from "../actions";
import { appUrl, fmtDate, fmtRM, today } from "../appurl";
import {
  PROMO_CHANNELS,
  REMINDER_CADENCE,
  addDays,
  buildRunsheet,
  buildTimeline,
  checkLeadTimes,
  composeBudget,
  draftRisks,
  lessonBullets,
  parseSignals,
  predictAttendance,
  selectVenue,
  type LessonSignals,
  type ParsedPrompt,
  type Supplier,
} from "../planning";
import { placeholderSpeakers, referenceSuppliers, SUPPLIER_CATEGORIES, type SpeakerCandidate, type SupplierCandidate } from "../integrations/research";
import { weatherFor } from "../integrations/weather";
import { emailShell } from "../integrations/email";
import { forwardNote, vendorRecipient } from "../vendor-contact";
import { lumaGuests, lumaMode, meetupGuests, meetupMode } from "../integrations/ticketing";
import { loadBundle, budgetTotals, validateProposal, reportData } from "../docs/builders";
import type { BudgetLine, EventRow, Speaker, University, User, Vendor, Venue } from "../types";
import { addMembers, resolvePeople, visibleSql } from "../members";

export async function eventContext(eventId: string) {
  const ev = await one<EventRow>("SELECT * FROM events WHERE id = $1", [eventId]);
  if (!ev) throw new Error(`Event ${eventId} not found`);
  const uni = await one<University & { society_name: string }>(
    "SELECT u.*, s.name AS society_name FROM societies s JOIN universities u ON u.id = s.university_id WHERE s.id = $1",
    [ev.society_id],
  );
  if (!uni) throw new Error("University not found for this society");
  return { ev, uni, sop: uni.sop };
}

// ------------------------------------------------------------------ create

export async function createEvent(user: User, p: ParsedPrompt) {
  if (!user.society_id) throw new Error("User has no society");
  const evId = id("evt");
  const ev = await insert<EventRow>("events", {
    id: evId,
    society_id: user.society_id,
    title: p.title,
    topic: p.topic,
    date: p.date,
    start_time: p.startTime,
    end_time: p.endTime,
    pax: p.pax,
    budget_cap: p.budget,
    status: "draft",
    created_by: user.id,
    setup_style: "theatre",
    flags: [],
    preferences: { suppliers: p.suppliers ?? [], team: p.team ?? [] },
  });
  await audit(user, "event.created", { title: ev.title, date: ev.date, pax: ev.pax, budget_cap: ev.budget_cap }, { eventId: ev.id });
  await addMembers(ev.id, [user.id], user.id, "lead");
  if (p.team?.length) {
    const { ids } = await resolvePeople(user.society_id, p.team);
    await addMembers(ev.id, ids.filter((x) => x !== user.id), user.id);
    if (ids.length) await audit(user, "event.team_added", { team: p.team }, { eventId: ev.id });
  }
  return ev;
}

export async function addFlag(eventId: string, level: "info" | "warn" | "error", message: string) {
  const ev = await one<EventRow>("SELECT flags FROM events WHERE id = $1", [eventId]);
  const flags = [...(ev?.flags ?? []).filter((f) => f.message !== message), { level, message }];
  await update("events", eventId, { flags });
}

// ------------------------------------------------------------------ knowledge base

export async function readSop(eventId: string) {
  const { uni, sop } = await eventContext(eventId);
  const docs = await query<{ id: string; title: string; kind: string; content: string }>(
    "SELECT id, title, kind, content FROM sop_documents WHERE university_id = $1 ORDER BY created_at DESC",
    [uni.id],
  );
  const lessonsDocs = docs.filter((d) => d.kind === "lessons");
  const signals: LessonSignals = {};
  // Newest lessons win; older ones fill gaps.
  for (const d of [...lessonsDocs].reverse()) Object.assign(signals, parseSignals(d.content));
  return {
    university: uni.name,
    sopVersion: sop.version,
    requiredSections: sop.required_sections.map((s) => s.title),
    leadTimes: sop.lead_times.map((l) => `${l.label}: ${l.weeks_before} wks`),
    rules: sop.rules,
    documents: docs.map((d) => d.title),
    lessons: lessonsDocs.flatMap((d) => lessonBullets(d.content)).slice(0, 8),
    signals,
  };
}

/** Who can own work on an event: its team first, execs for sign-offs, round-robin otherwise. */
async function ownerPicker(eventId: string, societyId: string) {
  const all = await query<User>("SELECT * FROM society_members WHERE society_id = $1 ORDER BY name", [societyId]);
  const members = await query<{ user_id: string; role: string }>("SELECT user_id, role FROM event_members WHERE event_id = $1 ORDER BY added_at", [eventId]);
  const team = members.map((m) => all.find((u) => u.id === m.user_id)).filter(Boolean) as User[];
  const lead = all.find((u) => u.id === members.find((m) => m.role === "lead")?.user_id) ?? team[0];
  const turn = new Map<string, number>();
  // Rotate work across everyone on the team with that role, so the load is shared.
  const next = (key: string, pool: User[]) => {
    const i = turn.get(key) ?? 0;
    turn.set(key, i + 1);
    return pool[i % pool.length];
  };
  return (role: string) => {
    if (role === "president" || role === "vp") return lead ?? all.find((u) => u.role === role);
    const same = team.filter((u) => u.role === role);
    if (role === "committee" && lead && !same.includes(lead)) same.push(lead);
    if (same.length) return next(role, same);
    if (team.length) return next("any", team);
    return all.find((u) => u.role === "committee");
  };
}

// ------------------------------------------------------------------ timeline

export async function planTimeline(eventId: string) {
  const { ev, sop, uni } = await eventContext(eventId);
  const pick = await ownerPicker(eventId, ev.society_id);
  const tasks = buildTimeline(ev.date, today(), sop);
  await query("DELETE FROM tasks WHERE event_id = $1", [eventId]);
  const ids = new Map(tasks.map((t) => [t.key, id("tsk")]));
  let sort = 0;
  for (const t of tasks) {
    const owner = pick(t.owner_role);
    await insert("tasks", {
      id: ids.get(t.key),
      event_id: eventId,
      key: t.key,
      phase: t.phase,
      title: t.title,
      start_date: t.start_date,
      due_date: t.due_date,
      owner_id: owner?.id ?? null,
      status: "todo",
      priority: t.priority,
      sop_ref: t.sop_ref,
      depends_on: t.deps.map((d) => ids.get(d)).filter(Boolean),
      sort: sort++,
    });
  }
  const byPhase = Object.fromEntries(sop.phases.map((ph) => [ph.label, tasks.filter((t) => t.phase === ph.key).length]));
  return { tasks: tasks.length, dependencies: tasks.reduce((n, t) => n + t.deps.length, 0), byPhase, compressed: tasks.filter((t) => t.compressed).length, university: uni.short_name };
}

export async function checkLeads(eventId: string) {
  const { ev, sop } = await eventContext(eventId);
  const venue = ev.venue_id ? await one<Venue>("SELECT * FROM venues WHERE id = $1", [ev.venue_id]) : null;
  const r = checkLeadTimes(ev.date, today(), sop, venue?.booking_lead_weeks);
  for (const c of r.checks.filter((x) => !x.passed)) {
    await addFlag(eventId, "warn", `SOP lead time missed: ${c.label} was due ${fmtDate(c.deadline)} (${c.days_late} days late). Earliest compliant date: ${fmtDate(r.suggestedDate)}.`);
  }
  return r;
}

// ------------------------------------------------------------------ venue

export async function matchVenue(eventId: string, predicted?: number) {
  const { ev, uni } = await eventContext(eventId);
  const venues = await query<Venue>("SELECT * FROM venues WHERE university_id = $1", [uni.id]);
  const bookings = await query<{ id: string; venue_id: string | null; date: string; start_time: string; end_time: string; title: string }>(
    "SELECT id, venue_id, date, start_time, end_time, title FROM events WHERE date = $1 AND id <> $2 AND venue_id IS NOT NULL",
    [ev.date, ev.id],
  );
  const need = Math.max(ev.pax, predicted ?? 0);
  const r = selectVenue(venues, bookings, need, ev);
  if (r.chosen) await update("events", eventId, { venue_id: r.chosen.id, setup_style: r.chosen.setup_styles[0] ?? "theatre" });
  else await addFlag(eventId, "error", `No venue at ${uni.short_name} fits ${need} pax on ${fmtDate(ev.date)}.`);
  return r;
}

// ------------------------------------------------------------------ research

export async function researchSpeakers(eventId: string, count = 3) {
  const { ev } = await eventContext(eventId);
  const saved = await query<Speaker>("SELECT * FROM speakers WHERE event_id = $1 AND source <> 'sample'", [eventId]);
  if (saved.length) return { mode: "assistant" as const, speakers: saved };
  await query("DELETE FROM speakers WHERE event_id = $1 AND status = 'found'", [eventId]);
  const rows: Speaker[] = [];
  for (const c of placeholderSpeakers(ev.topic ?? ev.title, count)) {
    rows.push(await insert<Speaker>("speakers", { id: id("spk"), event_id: eventId, name: c.name, headline: c.headline, source_url: c.source_url || null, email: c.email, fit_reason: c.fit_reason, status: "found", source: c.source }));
  }
  return { mode: "placeholder" as const, speakers: rows };
}

/** The AI assistant's web research lands here. */
export async function saveSpeakers(eventId: string, list: Partial<SpeakerCandidate>[]) {
  await query("DELETE FROM speakers WHERE event_id = $1 AND source = 'sample'", [eventId]);
  const rows: Speaker[] = [];
  for (const c of list.filter((x) => x.name)) {
    rows.push(await insert<Speaker>("speakers", { id: id("spk"), event_id: eventId, name: c.name, headline: c.headline ?? null, source_url: c.source_url ?? null, email: c.email ?? null, fit_reason: c.fit_reason ?? null, status: "found", source: "assistant" }));
  }
  return rows;
}

export async function saveSupplierQuotes(eventId: string, list: Partial<SupplierCandidate>[]) {
  const out: Vendor[] = [];
  for (const c of list.filter((x) => x.name && x.category && x.unit_price != null)) {
    out.push(await insert<Vendor>("vendors", { id: id("vnd"), event_id: eventId, category: c.category, name: c.name, url: c.url ?? null, unit: c.unit ?? "unit", unit_price: Number(c.unit_price), quote: null, rating: null, snippet: c.snippet ?? null, source: "assistant", contract_status: "quoted" }));
  }
  return out;
}

export async function researchSuppliers(eventId: string) {
  const out: Record<string, Vendor[]> = {};
  const modes: Record<string, string> = {};
  await query("DELETE FROM vendors WHERE event_id = $1 AND selected = false AND source <> 'assistant'", [eventId]);
  // Ratings come from the registry of this event's own university only.
  const registry = await query<Vendor>(
    `SELECT v.* FROM vendors v WHERE v.event_id IS NULL AND v.university_id =
       (SELECT s.university_id FROM events e JOIN societies s ON s.id = e.society_id WHERE e.id = $1)`,
    [eventId],
  );
  const host = (u: string | null | undefined) => {
    try {
      return u ? new URL(u).hostname : null;
    } catch {
      return null;
    }
  };
  const fromAssistant = await query<Vendor>("SELECT * FROM vendors WHERE event_id = $1 AND source = 'assistant'", [eventId]);
  for (const cat of SUPPLIER_CATEGORIES) {
    const live = fromAssistant.filter((v) => v.category === cat.key);
    modes[cat.key] = live.length ? "assistant" : "reference";
    out[cat.key] = [...live];
    if (live.length >= 2) continue;
    for (const c of referenceSuppliers(cat.key)) {
      // Society's own rating from the vendor registry, when we have used them before.
      const known = registry.find((v) => v.name === c.name || (host(v.url) && host(v.url) === host(c.url) && v.category === c.category));
      out[cat.key].push(
        await insert<Vendor>("vendors", {
          id: id("vnd"),
          event_id: eventId,
          category: cat.key,
          name: c.name,
          url: c.url,
          unit: c.unit,
          unit_price: c.unit_price,
          quote: null,
          rating: known?.rating ?? null,
          snippet: c.snippet,
          source: c.source,
          contract_status: "quoted",
        }),
      );
    }
  }
  return { modes, suppliers: out };
}

// ------------------------------------------------------------------ budget

export async function draftBudget(eventId: string, signals: LessonSignals) {
  const { ev, sop } = await eventContext(eventId);
  const venue = ev.venue_id ? await one<Venue>("SELECT * FROM venues WHERE id = $1", [ev.venue_id]) : null;
  const vendors = await query<Vendor>("SELECT * FROM vendors WHERE event_id = $1 AND unit_price IS NOT NULL", [eventId]);
  const speakers = await query<Speaker>("SELECT * FROM speakers WHERE event_id = $1", [eventId]);
  const suppliers: Record<string, Supplier[]> = {};
  for (const v of vendors) (suppliers[v.category] ??= []).push({ id: v.id, category: v.category, name: v.name, url: v.url, unit_price: v.unit_price!, rating: v.rating, unit: v.unit ?? "unit" });
  const showRate = signals.show_rate ?? 0.75;
  const pred = predictAttendance(ev.pax, 0, showRate, venue?.capacity ?? ev.pax);
  const result = composeBudget({
    pax: ev.pax,
    predicted: pred.predicted,
    cap: ev.budget_cap,
    contingencyPct: sop.budget_rules.contingency_pct,
    foodBufferPct: sop.budget_rules.food_buffer_pct,
    suppliers,
    venueCost: venue?.cost ?? 0,
    speakers: Math.max(1, speakers.length),
    crew: 25,
    coreCommittee: 12,
    lanyardsForAttendees: signals.lanyards_attendees ?? true,
    preferred: ((ev as unknown as { preferences?: { suppliers?: string[] } }).preferences?.suppliers) ?? [],
  });
  await query("DELETE FROM budget_lines WHERE event_id = $1", [eventId]);
  await query("UPDATE vendors SET selected = false WHERE event_id = $1", [eventId]);
  let sort = 0;
  for (const l of result.final.lines) {
    await insert("budget_lines", {
      id: id("bl"),
      event_id: eventId,
      category: l.category,
      description: l.description,
      vendor_id: l.supplier?.id ?? null,
      qty: l.qty,
      unit_cost: l.unit_cost,
      estimated: l.estimated,
      funding_source: l.funding_source,
      source_url: l.supplier?.url ?? null,
      sort: sort++,
    });
    if (l.supplier?.id) await update("vendors", l.supplier.id, { selected: true, quote: l.estimated });
  }
  if (result.shortfall > 0) await addFlag(eventId, "error", `Budget still over cap by ${fmtRM(result.shortfall)} after all adaptations, request a higher cap or sponsorship.`);
  return { ...result, predicted: pred, showRate };
}

// ------------------------------------------------------------------ risks + ops pack

export async function generateRisks(eventId: string) {
  const { ev, uni } = await eventContext(eventId);
  const venue = ev.venue_id ? await one<Venue>("SELECT * FROM venues WHERE id = $1", [ev.venue_id]) : null;
  const pick = await ownerPicker(eventId, ev.society_id);
  const weather = await weatherFor(ev.date, today(), uni.latitude != null && uni.longitude != null ? { lat: uni.latitude, lon: uni.longitude } : null);
  const foodLine = await one<BudgetLine>("SELECT * FROM budget_lines WHERE event_id = $1 AND category = 'Food & beverage'", [eventId]);
  const speakers = await query<Speaker>("SELECT id FROM speakers WHERE event_id = $1", [eventId]);
  const risks = draftRisks({ pax: ev.pax, venueName: venue?.name ?? "indoor venue", month: Number(ev.date.slice(5, 7)) - 1, outdoor: false, hasExternalSpeakers: speakers.length > 0, weatherNote: weather.note, foodPax: foodLine?.qty ?? ev.pax });
  await query("DELETE FROM tasks WHERE event_id = $1 AND risk_id IS NOT NULL", [eventId]);
  await query("DELETE FROM risks WHERE event_id = $1", [eventId]);
  const dayTask = await one<{ id: string }>("SELECT id FROM tasks WHERE event_id = $1 AND key = 'eventday'", [eventId]);
  let mitigations = 0;
  for (const r of risks) {
    const owner = pick(r.owner_role);
    const riskId = id("rsk");
    let taskId: string | null = null;
    // High-scoring risks get a real mitigation task on the board, feeding the event-day milestone.
    if (r.likelihood * r.impact >= 8) {
      taskId = id("tsk");
      const due = addDays(ev.date, r.category === "Weather" || r.category === "AV / Tech" ? -2 : -7);
      await insert("tasks", { id: taskId, event_id: eventId, key: `risk_${r.category.toLowerCase().replace(/[^a-z]+/g, "_")}`, phase: "execution", title: `Mitigate: ${r.category} — ${r.mitigation.split(/[;.]/)[0]}`, start_date: addDays(due, -3) < today() ? today() : addDays(due, -3), due_date: due < today() ? today() : due, owner_id: owner?.id ?? null, status: "todo", priority: r.likelihood * r.impact >= 12 ? "urgent" : "high", risk_id: riskId, depends_on: [], sort: 900 + mitigations });
      if (dayTask) await query("UPDATE tasks SET depends_on = depends_on || $1::jsonb WHERE id = $2", [JSON.stringify([taskId]), dayTask.id]);
      mitigations++;
    }
    await insert("risks", { id: riskId, event_id: eventId, category: r.category, description: r.description, likelihood: r.likelihood, impact: r.impact, mitigation: r.mitigation, contingency: r.contingency, owner_id: owner?.id ?? null, status: taskId ? "mitigating" : "open", mitigation_task_id: taskId });
  }
  return { count: risks.length, mitigationTasks: mitigations, weather, top: risks.map((r) => ({ ...r, score: r.likelihood * r.impact })).sort((a, b) => b.score - a.score).slice(0, 3) };
}

export async function generateOpsPack(eventId: string) {
  const { ev } = await eventContext(eventId);
  const venue = ev.venue_id ? await one<Venue>("SELECT * FROM venues WHERE id = $1", [ev.venue_id]) : null;
  const speakers = await query<Speaker>("SELECT name FROM speakers WHERE event_id = $1 ORDER BY name", [eventId]);
  const people = await query<User & { member_role: string }>("SELECT u.*, m.role AS member_role FROM event_members m JOIN users u ON u.id = m.user_id WHERE m.event_id = $1 ORDER BY (m.role = 'lead') DESC, u.name", [eventId]);
  await query("DELETE FROM runsheet_items WHERE event_id = $1", [eventId]);
  const rs = buildRunsheet(ev.start_time, ev.end_time, speakers.map((s) => s.name), venue?.name ?? "Venue");
  for (const r of rs) await insert("runsheet_items", { id: id("rs"), event_id: eventId, ...r });

  await query("DELETE FROM promo_items WHERE event_id = $1", [eventId]);
  for (const p of PROMO_CHANNELS) {
    const due = addDays(ev.date, -Math.round(p.weeks * 7));
    await insert("promo_items", { id: id("pr"), event_id: eventId, channel: p.channel, title: p.title, due_date: due < today() ? today() : due, status: "todo" });
  }
  await query("DELETE FROM reminders WHERE event_id = $1", [eventId]);
  for (const r of REMINDER_CADENCE) {
    const when = addDays(ev.date, -r.days);
    await insert("reminders", { id: id("rem"), event_id: eventId, label: r.label, offset_days: r.days, scheduled_for: when, status: when < today() ? "skipped" : "scheduled" });
  }
  await query("DELETE FROM volunteers WHERE event_id = $1", [eventId]);
  const roles = ["Registration desk", "Registration desk", "Usher", "Usher", "AV support", "Speaker liaison", "Photographer", "Food & refreshments"];
  for (const u of people) {
    await insert("volunteers", { id: id("vol"), event_id: eventId, name: u.name, role: u.member_role === "lead" ? "Event lead" : `${u.department ?? "General"} lead`, phone: u.phone, shift: `${addMin(ev.start_time, -60)} to ${addMin(ev.end_time, 30)}`, emergency: u.member_role === "lead" || u.department === "Logistics" });
  }
  for (let i = 0; i < roles.length; i++) {
    await insert("volunteers", { id: id("vol"), event_id: eventId, name: `Volunteer ${i + 1} (to assign)`, role: roles[i], phone: null, shift: `${addMin(ev.start_time, -45)} to ${addMin(ev.end_time, 15)}`, emergency: false });
  }
  return { runsheetBlocks: rs.length, promoItems: PROMO_CHANNELS.length, reminders: REMINDER_CADENCE.length, volunteers: people.length + roles.length };
}

function addMin(t: string, m: number) {
  const [h, mm] = t.split(":").map(Number);
  const total = h * 60 + mm + m;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export async function checkProposal(eventId: string) {
  const b = await loadBundle(eventId);
  if (!b) throw new Error("Event not found");
  return validateProposal(b);
}

export async function checkBudget(eventId: string) {
  const { ev, sop } = await eventContext(eventId);
  const lines = await query<BudgetLine>("SELECT * FROM budget_lines WHERE event_id = $1", [eventId]);
  const t = budgetTotals(lines, sop.budget_rules.contingency_pct);
  return [
    { check: `Total incl. ${sop.budget_rules.contingency_pct}% contingency ≤ cap`, passed: t.total <= ev.budget_cap, detail: `${fmtRM(t.total)} vs cap ${fmtRM(ev.budget_cap)}` },
    { check: "Contingency line present", passed: t.contingency > 0, detail: `${fmtRM(t.contingency)} (${sop.budget_rules.contingency_pct}%)` },
    { check: "Every priced line has a supplier link", passed: lines.filter((l) => l.vendor_id).every((l) => l.source_url), detail: `${lines.filter((l) => l.source_url).length}/${lines.filter((l) => l.vendor_id).length} linked` },
  ];
}

// ------------------------------------------------------------------ gated actions

export async function outreachSpeakers(user: User, eventId: string, runId: string | null) {
  const { ev, uni } = await eventContext(eventId);
  const venue = ev.venue_id ? await one<Venue>("SELECT * FROM venues WHERE id = $1", [ev.venue_id]) : null;
  const speakers = await query<Speaker>("SELECT * FROM speakers WHERE event_id = $1 AND status = 'found'", [eventId]);
  const results: { speaker: string; status: GateResult["status"]; detail: string }[] = [];
  for (const sp of speakers) {
    if (!sp.email) {
      results.push({ speaker: sp.name, status: "failed", detail: "No email on file. Add one on the Speakers page, then send again." });
      continue;
    }
    const { subject, html } = speakerEmail(sp, ev, venue, uni.society_name, user, false, uni.name);
    const r = await gate(user, "email.speaker", `Invite ${sp.name} to speak at ${ev.title}`, { speaker_id: sp.id, to: sp.email, subject, html }, { eventId, runId });
    results.push({ speaker: sp.name, status: r.status, detail: r.status === "blocked" ? r.reason : r.status === "executed" ? `sent → ${String(r.result.to)}` : r.error });
  }
  return results;
}

export async function requestVendorQuotes(user: User, eventId: string, runId: string | null) {
  const { ev, uni } = await eventContext(eventId);
  const vendors = await query<Vendor>("SELECT * FROM vendors WHERE event_id = $1 AND selected = true", [eventId]);
  const lines = await query<BudgetLine>("SELECT * FROM budget_lines WHERE event_id = $1", [eventId]);
  const results: { vendor: string; status: GateResult["status"]; detail: string }[] = [];
  for (const v of vendors) {
    const l = lines.find((x) => x.vendor_id === v.id);
    const html = emailShell(
      "Quotation request",
      `<p>Hello ${esc(v.name.split(" — ")[0])} team,</p><p>The ${esc(uni.society_name)} (${esc(uni.name)}) would like a written quotation for <b>${esc(l?.qty ?? "")} ${esc(v.unit ?? "units")}</b> (${esc(l?.description ?? v.category)}) for <b>${esc(ev.title)}</b> on ${fmtDate(ev.date)}.</p><p>Your listed price is about ${fmtRM(v.unit_price)} per ${esc(v.unit)}. Please confirm availability, final price, deposit terms and delivery.</p><p>Thank you,<br>${esc(user.name)}</p>`,
    );
    const rcpt = await vendorRecipient(v, ev.society_id);
    const to = rcpt.to;
    const r = await gate(user, "email.vendor", `Request quote from ${v.name}`, { vendor_id: v.id, event_id: eventId, to, subject: `${rcpt.forward ? "[Forward to vendor] " : ""}Quotation request, ${ev.title} (${fmtDate(ev.date)})`, html: rcpt.forward ? forwardNote(v.name) + html : html, kind: "vendor_quote" }, { eventId, runId });
    results.push({ vendor: v.name, status: r.status, detail: r.status === "blocked" ? r.reason : r.status === "executed" ? "sent" : r.error });
  }
  return results;
}

export async function requestBudgetApproval(user: User, eventId: string, runId: string | null) {
  const { ev, sop } = await eventContext(eventId);
  const lines = await query<BudgetLine>("SELECT * FROM budget_lines WHERE event_id = $1", [eventId]);
  const t = budgetTotals(lines, sop.budget_rules.contingency_pct);
  return gate(user, "budget.approve", `Approve budget ${fmtRM(t.total)} for ${ev.title}`, { event_id: eventId, amount: t.total }, { eventId, runId, amount: t.total });
}

export async function submitToFaculty(user: User, eventId: string, runId: string | null) {
  const { ev, uni } = await eventContext(eventId);
  const faculty = await one<User>("SELECT * FROM society_members WHERE society_id = $1 AND role = 'faculty_advisor'", [ev.society_id]);
  const venue = ev.venue_id ? await one<Venue>("SELECT * FROM venues WHERE id = $1", [ev.venue_id]) : null;
  const html = `<p>Dear ${esc(faculty?.name ?? "Advisor")},</p><p>The ${esc(uni.society_name)} submits the proposal for <b>${esc(ev.title)}</b> on <b>${fmtDate(ev.date)}</b> (${esc(ev.start_time)} to ${esc(ev.end_time)}) at ${esc(venue?.name ?? "TBC")} for ${ev.pax} participants, budget cap ${fmtRM(ev.budget_cap)}.</p><p>The proposal follows the ${esc(uni.short_name)} SOP format and includes the budget, risk register and timeline. Please review and approve or reject using the buttons below.</p>`;
  return gate(user, "email.faculty", `Submit "${ev.title}" proposal to faculty advisor`, { event_id: eventId, to: faculty?.email, subject: `[Approval] Event proposal, ${ev.title} (${fmtDate(ev.date)})`, html }, { eventId, runId });
}

export async function requestSocialApproval(user: User, eventId: string, runId: string | null) {
  const { ev } = await eventContext(eventId);
  const ids = (await query<{ id: string }>("SELECT id FROM creatives WHERE event_id = $1 AND status = 'draft'", [eventId])).map((r) => r.id);
  if (ids.length) await query("UPDATE creatives SET status = 'pending_approval' WHERE event_id = $1 AND status = 'draft'", [eventId]);
  const r = await gate(user, "publish.social", `Approve poster & social posts for ${ev.title} (${ids.length} creatives)`, { event_id: eventId, creative_ids: ids }, { eventId, runId });
  if (r.status !== "blocked" && r.status !== "executed") await query("UPDATE creatives SET status = 'draft' WHERE event_id = $1 AND status = 'pending_approval'", [eventId]);
  return r;
}

export async function pushToCalendar(user: User, eventId: string, runId: string | null) {
  const { ev } = await eventContext(eventId);
  return gate(user, "calendar.push", `Push ${ev.title} timeline to calendar`, { event_id: eventId }, { eventId, runId });
}

export async function publishEvent(user: User, eventId: string, runId: string | null, where: "luma" | "meetup" = "luma") {
  const { ev } = await eventContext(eventId);
  return gate(user, where === "luma" ? "publish.luma" : "publish.meetup", `Publish ${ev.title} on ${where === "luma" ? "Luma" : "Meetup"}`, { event_id: eventId }, { eventId, runId });
}

// ------------------------------------------------------------------ registration sync

/**
 * Pull registrations from Luma or Meetup. Without that platform configured,
 * the event uses Movents' own registration page, whose sign-ups are already
 * in the list, so there is nothing to pull.
 */
export async function syncRsvps(eventId: string, source: "luma" | "meetup") {
  const { ev } = await eventContext(eventId);
  const ext = source === "luma" ? ev.luma : ev.meetup;
  const live = (source === "luma" ? lumaMode() : meetupMode()) === "live" && ext?.id && !/mock|movents/.test(String(ext.id));
  if (!live) return { mode: "movents", fetched: 0, added: 0, updated: 0, note: `${source === "luma" ? "Luma" : "Meetup"} is not connected; registrations come from the Movents event page.` };
  const guests = source === "luma" ? await lumaGuests(String(ext!.id)) : await meetupGuests(String(ext!.id));
  const existing = new Map((await query<{ email: string; id: string }>("SELECT id, lower(email) AS email FROM rsvps WHERE event_id = $1 AND source = $2", [eventId, source])).map((r) => [r.email, r.id]));
  const venue = ev.venue_id ? await one<Venue>("SELECT capacity FROM venues WHERE id = $1", [ev.venue_id]) : null;
  let going = Number((await one<{ n: number }>("SELECT count(*)::int AS n FROM rsvps WHERE event_id = $1 AND status = 'going'", [eventId]))?.n ?? 0);
  let added = 0;
  let updated = 0;
  await transaction(async () => {
    for (const g of guests) {
      const prev = existing.get(g.email.toLowerCase());
      if (prev) {
        await update("rsvps", prev, { checked_in: g.checked_in, checked_in_at: g.checked_in ? new Date() : null, status: g.status });
        updated++;
        continue;
      }
      const cap = venue?.capacity ?? ev.pax;
      const status = g.status === "going" && going >= cap ? "waitlist" : g.status;
      if (status === "going") going++;
      await insert("rsvps", { id: id("rsv"), event_id: eventId, name: g.name, email: g.email, source, status, ticket: ticketCode(), checked_in: g.checked_in, checked_in_at: g.checked_in ? new Date() : null, dietary: g.dietary ?? null, accessibility: g.accessibility ?? null });
      added++;
    }
  });
  const field = source === "luma" ? "luma" : "meetup";
  await update("events", eventId, { [field]: { ...(ext ?? {}), synced_at: new Date().toISOString(), mode: "live" } });
  return { mode: "live", fetched: guests.length, added, updated };
}

export function ticketCode() {
  return `T-${crypto.randomBytes(5).toString("hex").toUpperCase()}`;
}

// ------------------------------------------------------------------ post-event

export async function feedLessons(user: User, eventId: string) {
  const b = await loadBundle(eventId);
  if (!b) throw new Error("Event not found");
  const d = reportData(b);
  const docId = `sop_lessons_${eventId}`;
  await query("DELETE FROM sop_documents WHERE id = $1", [docId]);
  await insert("sop_documents", {
    id: docId,
    university_id: b.university!.id,
    title: `Lessons learned, ${b.event.title} (${fmtDate(b.event.date)})`,
    kind: "lessons",
    source_event_id: eventId,
    uploaded_by: user.id,
    content: `# Lessons learned, ${b.event.title}\n\n${d.lessons.map((l) => `- ${l}`).join("\n")}\n\n\`\`\`signals\n${JSON.stringify(d.signals)}\n\`\`\``,
  });
  await audit(user, "sop.lessons_added", { event: b.event.title, lessons: d.lessons.length }, { eventId });
  return { docId, lessons: d.lessons, signals: d.signals };
}

export async function findEventForPrompt(user: User, prompt: string) {
  const events = await query<EventRow>(`SELECT * FROM events e WHERE e.society_id = $1 AND ${visibleSql(user, 2)} ORDER BY e.created_at DESC`, [user.society_id, user.id]);
  const words = prompt.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 1 && !["the", "for", "generate", "post", "event", "report", "of", "a", "an", "our", "make", "create", "write"].includes(w));
  let best: EventRow | null = null;
  let bestScore = 0;
  for (const e of events) {
    const hay = `${e.title} ${e.topic ?? ""}`.toLowerCase();
    const score = words.filter((w) => hay.includes(w)).length;
    if (score > bestScore) {
      best = e;
      bestScore = score;
    }
  }
  return best ?? events[0] ?? null;
}

export { appUrl };
