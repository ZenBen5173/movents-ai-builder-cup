import type { LeadTime, Role, Sop } from "./types";

/**
 * Turn an uploaded SOP document (markdown or plain text) into the structure the
 * agent plans against. Anything not found keeps the base value, so a partial
 * document never leaves the SOP empty. Returns counts so the UI can say what
 * was detected.
 */
export function parseSopText(text: string, base: Sop) {
  const lines = text.split(/\r?\n/);
  const blocks: { heading: string; items: string[] }[] = [];
  let cur = { heading: "", items: [] as string[] };
  for (const raw of lines) {
    const l = raw.trim();
    if (!l) continue;
    const h = l.match(/^#{1,6}\s+(.*)$/) ?? (l.length < 80 && /^[A-Z0-9][^.:]*:?$/.test(l) && !/^\d+[.)]/.test(l) && !/^[-*•]/.test(l) ? [l, l.replace(/:$/, "")] : null);
    if (h) {
      if (cur.heading || cur.items.length) blocks.push(cur);
      cur = { heading: h[1], items: [] };
      continue;
    }
    const it = l.match(/^(?:[-*•]|\d+[.)])\s+(.*)$/);
    if (it) cur.items.push(it[1]);
  }
  blocks.push(cur);

  const find = (re: RegExp) => blocks.filter((b) => re.test(b.heading));

  const sectionItems = find(/proposal|format|section|template/i).flatMap((b) => b.items);
  const required_sections = sectionItems.length
    ? sectionItems.map((s) => {
        const [title, hint] = s.split(/\s+[—–-]\s+|:\s+/);
        const clean = title.replace(/\*\*/g, "").trim();
        const known = base.required_sections.find((r) => r.title.toLowerCase().split(/[ &]/)[0] === clean.toLowerCase().split(/[ &]/)[0]);
        return { key: known?.key ?? clean.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""), title: clean, hint: (hint ?? known?.hint ?? "").trim() };
      })
    : base.required_sections;

  const lead_times: LeadTime[] = [];
  for (const l of lines) {
    const m = l.match(/^\s*(?:[-*•]|\d+[.)])?\s*(.+?)[:,—–-]+\s*(?:at least|minimum(?: of)?|no later than|min\.?)?\s*(\d+)\s*(weeks?|wks?|working days|days)\s*(?:before|prior)/i);
    if (!m) continue;
    const n = Number(m[2]);
    const weeks = /week|wk/i.test(m[3]) ? n : /working/i.test(m[3]) ? Math.ceil(n / 5) : Math.ceil(n / 7);
    const label = m[1].replace(/\*\*/g, "").trim();
    const key = label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40);
    const owner: Role = /venue|cater|speaker|vendor/i.test(label) ? "director" : /poster|publicity|promo/i.test(label) ? "committee" : "president";
    const known = base.lead_times.find((b) => label.toLowerCase().includes(b.key.split("_")[0]));
    lead_times.push({ key: known?.key ?? key, label, weeks_before: weeks, owner_role: owner });
  }

  const rules = find(/rule|requirement|policy|guideline|compliance/i).flatMap((b) => b.items);
  const chainItems = find(/approval/i).flatMap((b) => b.items);
  const roleOf = (s: string): Sop["approval_chain"][number]["role"] =>
    /student (life|affairs)|sle|hep|dean/i.test(s) ? "student_life" : /advis|faculty|lecturer/i.test(s) ? "faculty_advisor" : /president|vp|vice/i.test(s) ? "president" : /director|head|hod/i.test(s) ? "director" : "committee";
  const approval_chain = chainItems.length ? chainItems.map((s, i) => ({ step: i + 1, role: roleOf(s), label: s.replace(/\*\*/g, "") })) : base.approval_chain;

  const pct = text.match(/(\d{1,2})\s*%\s*contingency/i)?.[1];
  const threshold = text.match(/(?:above|over|exceed(?:ing)?)\s*RM\s?([\d,]+)/i)?.[1];
  const claims = text.match(/claims?[^.\n]*?within\s*(\d+)\s*(?:calendar\s*)?days/i)?.[1];
  const version = text.match(/version[:\s]+([\w.-]+)/i)?.[1];

  const sop: Sop = {
    ...base,
    version: version ?? `${base.version.split("-")[0]}-upload`,
    required_sections,
    lead_times: lead_times.length ? lead_times : base.lead_times,
    approval_chain,
    rules: rules.length ? rules : base.rules,
    budget_rules: {
      ...base.budget_rules,
      contingency_pct: pct ? Number(pct) : base.budget_rules.contingency_pct,
      president_threshold: threshold ? Number(threshold.replace(/,/g, "")) : base.budget_rules.president_threshold,
      claims_days_after: claims ? Number(claims) : base.budget_rules.claims_days_after,
    },
  };
  return { sop, found: { sections: sectionItems.length, leadTimes: lead_times.length, rules: rules.length, approvalSteps: chainItems.length } };
}
