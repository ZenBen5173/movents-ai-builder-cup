import type { Sop } from "./types";

/**
 * Seed SOP for Sunway University clubs & societies.
 *
 * Sunway's internal C&S rulebook is not public. What is confirmed from public
 * sources: clubs run under Student LIFE's Student Leadership & Engagement (SLE)
 * team (sle@sunway.edu.my). Section list, lead times and limits below are a
 * working template modelled on Malaysian university practice — replace them by
 * uploading the official SOP on the Knowledge Base page.
 */
export const SUNWAY_SOP: Sop = {
  version: "2026.1-seed",
  required_sections: [
    { key: "overview", title: "Event Overview", hint: "Name, date, time, venue, organising society" },
    { key: "objectives", title: "Objectives & Learning Outcomes", hint: "What participants gain; link to graduate attributes" },
    { key: "target_audience", title: "Target Audience & Expected Attendance", hint: "Who, how many, how they register" },
    { key: "programme", title: "Programme Itinerary", hint: "Time-blocked schedule for the day" },
    { key: "speakers", title: "External Speakers", hint: "Name, affiliation, topic, declaration status" },
    { key: "organising_committee", title: "Organising Committee", hint: "Roles and responsible persons" },
    { key: "budget", title: "Budget & Funding", hint: "Itemised estimate, 10% contingency, funding sources" },
    { key: "risk", title: "Risk Assessment & Safety", hint: "Risk register, mitigations, emergency contacts" },
    { key: "promotion", title: "Publicity Plan", hint: "Channels, dates, poster approval" },
    { key: "timeline", title: "Planning Timeline", hint: "Key milestones and SOP deadlines" },
    { key: "endorsement", title: "Endorsement", hint: "President, faculty advisor and Student LIFE (SLE) sign-off" },
  ],
  lead_times: [
    { key: "venue_booking", label: "Venue booking request to Facilities", weeks_before: 6, owner_role: "director" },
    { key: "proposal_submission", label: "Event proposal submitted to advisor & SLE", weeks_before: 4, owner_role: "president" },
    { key: "speaker_declaration", label: "External speaker declaration submitted", weeks_before: 3, owner_role: "director" },
    { key: "publicity_approval", label: "Poster & publicity approval from SLE", weeks_before: 2, owner_role: "committee" },
    { key: "catering_confirmation", label: "Caterer confirmed (halal-certified)", weeks_before: 1, owner_role: "director" },
  ],
  approval_chain: [
    { step: 1, role: "committee", label: "Committee drafts proposal" },
    { step: 2, role: "director", label: "Department director reviews" },
    { step: 3, role: "president", label: "President endorses" },
    { step: 4, role: "faculty_advisor", label: "Faculty advisor approves" },
    { step: 5, role: "student_life", label: "Student LIFE (SLE) final approval" },
  ],
  budget_rules: {
    contingency_pct: 10,
    president_threshold: 1000,
    alert_pct: 90,
    claims_days_after: 14,
    food_buffer_pct: 5,
  },
  rules: [
    "All catering for open events must be from a JAKIM halal-certified provider.",
    "External speakers must be declared to SLE at least 3 weeks before the event.",
    "Posters may only be published after SLE publicity approval.",
    "Claims with original receipts must be submitted within 14 days after the event.",
    "Events past 10:00 PM or off-campus require additional safety approval.",
    "Budget total must include a 10% contingency and stay within the approved cap.",
  ],
  phases: [
    { key: "concept", label: "Concept", from_weeks: 16, to_weeks: 12 },
    { key: "planning", label: "Planning", from_weeks: 12, to_weeks: 8 },
    { key: "promotion", label: "Promotion", from_weeks: 6, to_weeks: 4 },
    { key: "execution", label: "Execution", from_weeks: 2, to_weeks: 0 },
    { key: "post", label: "Post-event", from_weeks: 0, to_weeks: -2 },
  ],
};

export const SUNWAY_SOP_TEXT = `# Sunway University, Clubs & Societies Event SOP (seed template ${SUNWAY_SOP.version})

Clubs and societies operate under Student LIFE's Student Leadership & Engagement (SLE) team (sle@sunway.edu.my, 03-7491 8622).
This seed is a working template. Replace it with the official C&S SOP by uploading it here.

## 1. Approval chain
${SUNWAY_SOP.approval_chain.map((s) => `${s.step}. ${s.label}`).join("\n")}

## 2. Lead times (before event date)
${SUNWAY_SOP.lead_times.map((l) => `- ${l.label}: at least ${l.weeks_before} weeks before`).join("\n")}

## 3. Proposal format, required sections
${SUNWAY_SOP.required_sections.map((s, i) => `${i + 1}. ${s.title}: ${s.hint}`).join("\n")}

## 4. Budget rules
- Include a ${SUNWAY_SOP.budget_rules.contingency_pct}% contingency inside the approved cap.
- Any spend above RM${SUNWAY_SOP.budget_rules.president_threshold} needs President/VP approval.
- Alert committee when spend reaches ${SUNWAY_SOP.budget_rules.alert_pct}% of the approved budget.
- Claims due within ${SUNWAY_SOP.budget_rules.claims_days_after} days after the event.

## 5. Rules
${SUNWAY_SOP.rules.map((r) => `- ${r}`).join("\n")}

## 6. Venues commonly used by C&S
JC1 Auditorium (University Building L1), JC2/JC3, Auditorium 1 & 2 (Sunway College South West, Level G),
Jeffrey Cheah Hall (North building L4), Lecture Theatres 5 to 8, Student Life Centre.
Capacities are estimates, confirm with Facilities when booking.
`;
