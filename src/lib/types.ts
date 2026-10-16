export type Role = "president" | "vp" | "director" | "committee" | "faculty_advisor";

export const ROLE_LABEL: Record<Role, string> = {
  president: "President",
  vp: "Vice President",
  director: "Director / HOD",
  committee: "Committee member",
  faculty_advisor: "Faculty advisor",
};

export type User = {
  id: string;
  society_id: string | null;
  name: string;
  email: string;
  role: Role;
  department: string | null;
  phone: string | null;
  email_verified_at?: string | null;
  avatar_url?: string | null;
};

export type LeadTime = {
  key: string;
  label: string;
  weeks_before: number;
  owner_role: Role;
};

export type Sop = {
  version: string;
  required_sections: { key: string; title: string; hint: string }[];
  lead_times: LeadTime[];
  approval_chain: { step: number; role: Role | "student_life"; label: string }[];
  budget_rules: {
    contingency_pct: number;
    president_threshold: number;
    alert_pct: number;
    claims_days_after: number;
    food_buffer_pct: number;
  };
  rules: string[];
  phases: { key: Phase; label: string; from_weeks: number; to_weeks: number }[];
};

export type Phase = "concept" | "planning" | "promotion" | "execution" | "post";

export type University = {
  id: string;
  name: string;
  short_name: string;
  latitude?: number | null;
  longitude?: number | null;
  sop: Sop;
  created_at: string;
};

export type EventStatus = "draft" | "pending_approval" | "approved" | "live" | "completed";

export type EventRow = {
  id: string;
  society_id: string;
  title: string;
  topic: string | null;
  date: string;
  start_time: string;
  end_time: string;
  pax: number;
  budget_cap: number;
  approved_budget: number | null;
  status: EventStatus;
  venue_id: string | null;
  setup_style: string | null;
  created_by: string | null;
  luma: { id?: string; url?: string; mode?: string; synced_at?: string } | null;
  meetup: { id?: string; url?: string; mode?: string; synced_at?: string } | null;
  flags: { level: "info" | "warn" | "error"; message: string }[];
  created_at: string;
};

export type Venue = {
  id: string;
  university_id: string;
  name: string;
  capacity: number;
  setup_styles: string[];
  av: string[];
  cost: number;
  booking_lead_weeks: number;
  location: string | null;
  photo_url?: string | null;
  floor_plan_url?: string | null;
};

export type Task = {
  id: string;
  event_id: string;
  phase: Phase;
  title: string;
  due_date: string;
  owner_id: string | null;
  status: "todo" | "doing" | "done";
  sop_ref: string | null;
  sort: number;
  key: string | null;
  depends_on: string[];
  priority: "low" | "medium" | "high" | "urgent";
  start_date: string | null;
  description: string | null;
  risk_id: string | null;
};

export type Speaker = {
  id: string;
  event_id: string;
  name: string;
  headline: string | null;
  source_url: string | null;
  email: string | null;
  status: "found" | "pending_approval" | "contacted" | "followed_up" | "replied" | "confirmed" | "declined";
  fit_reason: string | null;
  contacted_at: string | null;
  followed_up_at: string | null;
  replied_at: string | null;
  source: string;
  photo_url?: string | null;
  bio?: string | null;
  talk_title?: string | null;
  phone?: string | null;
};

export type Vendor = {
  id: string;
  event_id: string | null;
  category: string;
  name: string;
  url: string | null;
  quote: number | null;
  unit: string | null;
  unit_price: number | null;
  rating: number | null;
  contact_email: string | null;
  contract_status: "none" | "quoted" | "sent" | "signed";
  deposit_amount: number;
  deposit_status: "none" | "pending_approval" | "pending" | "paid";
  selected: boolean;
  snippet: string | null;
  source: string;
  reminded_at: string | null;
};

export type BudgetLine = {
  id: string;
  event_id: string;
  category: string;
  description: string;
  vendor_id: string | null;
  qty: number;
  unit_cost: number;
  estimated: number;
  actual: number | null;
  funding_source: string;
  source_url: string | null;
  sort: number;
};

export type Risk = {
  id: string;
  event_id: string;
  category: string;
  description: string;
  likelihood: number;
  impact: number;
  mitigation: string;
  contingency: string | null;
  owner_id: string | null;
  status: "open" | "mitigating" | "closed";
  mitigation_task_id: string | null;
};

export type ApprovalRequest = {
  id: string;
  event_id: string | null;
  action_type: ActionType;
  title: string;
  payload: Record<string, unknown>;
  requested_by: string | null;
  approver_role: Role;
  approver_department: string | null;
  status: "pending" | "approved" | "rejected" | "awaiting_faculty" | "executed" | "failed";
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string | null;
  result: Record<string, unknown> | null;
  run_id: string | null;
  created_at: string;
};

export type ActionType =
  | "email.speaker"
  | "email.sponsor"
  | "email.vendor"
  | "email.faculty"
  | "publish.luma"
  | "publish.meetup"
  | "budget.approve"
  | "speaker.confirm"
  | "payment.deposit"
  | "calendar.push"
  | "publish.social";

export type AuditLog = {
  id: string;
  event_id: string | null;
  user_id: string | null;
  actor: string;
  action: string;
  details: Record<string, unknown>;
  approved_by: string | null;
  created_at: string;
};

export type StepStatus = "running" | "ok" | "warn" | "fail" | "blocked" | "skipped";

export type AgentStep = {
  id: string;
  name: string;
  tool: string;
  status: StepStatus;
  input?: unknown;
  output?: unknown;
  summary?: string;
  validation?: { check: string; passed: boolean; detail: string }[];
  adapt?: string;
  started_at: string;
  finished_at?: string;
};

export type AgentOutput = { label: string; href: string; kind: string };

export type AgentRun = {
  id: string;
  event_id: string | null;
  prompt: string;
  kind: "plan" | "report" | "custom";
  source: "builtin" | "assistant";
  status: "running" | "done" | "failed";
  steps: AgentStep[];
  outputs: AgentOutput[];
  summary: Record<string, unknown> | null;
  started_by: string | null;
  created_at: string;
  finished_at: string | null;
};

export type Email = {
  id: string;
  event_id: string | null;
  kind: string;
  to_addr: string;
  intended_to: string | null;
  subject: string;
  body: string;
  status: "queued" | "sent" | "outbox" | "failed";
  provider: string | null;
  provider_id: string | null;
  error: string | null;
  related_id: string | null;
  sent_by: string | null;
  sent_at: string | null;
  created_at: string;
};

export type Rsvp = {
  id: string;
  event_id: string;
  name: string;
  email: string;
  source: string;
  status: "going" | "waitlist" | "cancelled";
  ticket: string;
  checked_in: boolean;
  checked_in_at: string | null;
  dietary: string | null;
  accessibility: string | null;
  created_at: string;
};

export type Feedback = {
  id: string;
  event_id: string;
  name: string | null;
  nps: number;
  rating: number;
  liked: string | null;
  improve: string | null;
  created_at: string;
};

export type Creative = {
  id: string;
  event_id: string;
  kind: "poster" | "ig_post" | "ig_story" | "linkedin" | "video";
  channel: string;
  title: string;
  caption: string;
  hashtags: string | null;
  image_prompt: string | null;
  image_data: string | null;
  image_url: string | null;
  /** Vercel Blob pathname (private store) when the media lives in Blob. */
  media_key: string | null;
  media_type: string | null;
  image_source: "template" | "nano-banana" | "assistant" | "upload";
  width: number;
  height: number;
  status: "draft" | "pending_approval" | "approved" | "posted";
  posted_url: string | null;
  created_at: string;
  updated_at: string;
};

export type SponsorStatus = "found" | "contacted" | "opened" | "replied" | "accepted" | "declined";

export type Sponsor = {
  id: string;
  event_id: string;
  company: string;
  industry: string | null;
  website: string | null;
  logo_url: string | null;
  contact_name: string | null;
  contact_email: string | null;
  ask: string | null;
  status: SponsorStatus;
  offer_type: "cash" | "in_kind" | null;
  offer_amount: number | null;
  offer_note: string | null;
  notes: string | null;
  source: string;
  fit_reason: string | null;
  contacted_at: string | null;
  opened_at: string | null;
  replied_at: string | null;
  decided_at: string | null;
  created_at: string;
};
