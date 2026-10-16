// Baseline: the schema as it stood before versioned migrations. Every
// statement is idempotent so databases created by the old runtime bootstrap
// adopt it without changes.
export default `
CREATE TABLE IF NOT EXISTS universities (
  id text PRIMARY KEY,
  name text NOT NULL,
  short_name text NOT NULL,
  sop jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sop_documents (
  id text PRIMARY KEY,
  university_id text NOT NULL,
  title text NOT NULL,
  kind text NOT NULL DEFAULT 'sop',
  content text NOT NULL,
  source_event_id text,
  uploaded_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS societies (
  id text PRIMARY KEY,
  university_id text NOT NULL,
  name text NOT NULL
);
CREATE TABLE IF NOT EXISTS users (
  id text PRIMARY KEY,
  society_id text,
  name text NOT NULL,
  email text NOT NULL,
  role text NOT NULL,
  department text,
  phone text,
  api_key text
);
CREATE TABLE IF NOT EXISTS venues (
  id text PRIMARY KEY,
  university_id text NOT NULL,
  name text NOT NULL,
  capacity integer NOT NULL,
  setup_styles jsonb NOT NULL DEFAULT '[]'::jsonb,
  av jsonb NOT NULL DEFAULT '[]'::jsonb,
  cost double precision NOT NULL DEFAULT 0,
  booking_lead_weeks integer NOT NULL DEFAULT 2,
  location text
);
CREATE TABLE IF NOT EXISTS events (
  id text PRIMARY KEY,
  society_id text NOT NULL,
  title text NOT NULL,
  topic text,
  date text NOT NULL,
  start_time text NOT NULL DEFAULT '14:00',
  end_time text NOT NULL DEFAULT '17:00',
  pax integer NOT NULL DEFAULT 100,
  budget_cap double precision NOT NULL DEFAULT 0,
  approved_budget double precision,
  status text NOT NULL DEFAULT 'draft',
  venue_id text,
  setup_style text,
  created_by text,
  luma jsonb,
  meetup jsonb,
  flags jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS tasks (
  id text PRIMARY KEY,
  event_id text NOT NULL,
  phase text NOT NULL,
  title text NOT NULL,
  due_date text NOT NULL,
  owner_id text,
  status text NOT NULL DEFAULT 'todo',
  sop_ref text,
  sort integer NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS speakers (
  id text PRIMARY KEY,
  event_id text NOT NULL,
  name text NOT NULL,
  headline text,
  source_url text,
  email text,
  status text NOT NULL DEFAULT 'found',
  fit_reason text,
  contacted_at timestamptz,
  followed_up_at timestamptz,
  replied_at timestamptz,
  source text NOT NULL DEFAULT 'reference'
);
CREATE TABLE IF NOT EXISTS vendors (
  id text PRIMARY KEY,
  event_id text,
  category text NOT NULL,
  name text NOT NULL,
  url text,
  quote double precision,
  unit text,
  unit_price double precision,
  rating double precision,
  contact_email text,
  contract_status text NOT NULL DEFAULT 'none',
  deposit_amount double precision NOT NULL DEFAULT 0,
  deposit_status text NOT NULL DEFAULT 'none',
  selected boolean NOT NULL DEFAULT false,
  snippet text,
  source text NOT NULL DEFAULT 'reference',
  reminded_at timestamptz
);
CREATE TABLE IF NOT EXISTS budget_lines (
  id text PRIMARY KEY,
  event_id text NOT NULL,
  category text NOT NULL,
  description text NOT NULL,
  vendor_id text,
  qty double precision NOT NULL DEFAULT 1,
  unit_cost double precision NOT NULL DEFAULT 0,
  estimated double precision NOT NULL DEFAULT 0,
  actual double precision,
  funding_source text NOT NULL DEFAULT 'Society fund',
  source_url text,
  sort integer NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS risks (
  id text PRIMARY KEY,
  event_id text NOT NULL,
  category text NOT NULL,
  description text NOT NULL,
  likelihood integer NOT NULL,
  impact integer NOT NULL,
  mitigation text NOT NULL,
  contingency text,
  owner_id text
);
CREATE TABLE IF NOT EXISTS approval_requests (
  id text PRIMARY KEY,
  event_id text,
  action_type text NOT NULL,
  title text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  requested_by text,
  approver_role text NOT NULL,
  approver_department text,
  status text NOT NULL DEFAULT 'pending',
  decided_by text,
  decided_at timestamptz,
  decision_note text,
  result jsonb,
  run_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS audit_logs (
  id text PRIMARY KEY,
  event_id text,
  user_id text,
  actor text NOT NULL,
  action text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  approved_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS agent_runs (
  id text PRIMARY KEY,
  event_id text,
  prompt text NOT NULL,
  kind text NOT NULL DEFAULT 'plan',
  source text NOT NULL DEFAULT 'builtin',
  status text NOT NULL DEFAULT 'running',
  steps jsonb NOT NULL DEFAULT '[]'::jsonb,
  outputs jsonb NOT NULL DEFAULT '[]'::jsonb,
  summary jsonb,
  started_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
CREATE TABLE IF NOT EXISTS emails (
  id text PRIMARY KEY,
  event_id text,
  kind text NOT NULL,
  to_addr text NOT NULL,
  intended_to text,
  subject text NOT NULL,
  body text NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  provider text,
  provider_id text,
  error text,
  related_id text,
  sent_by text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS calendar_events (
  id text PRIMARY KEY,
  event_id text NOT NULL,
  task_id text,
  title text NOT NULL,
  date text NOT NULL,
  provider text NOT NULL,
  external_id text,
  html_link text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS rsvps (
  id text PRIMARY KEY,
  event_id text NOT NULL,
  name text NOT NULL,
  email text NOT NULL,
  source text NOT NULL DEFAULT 'direct',
  status text NOT NULL DEFAULT 'going',
  ticket text NOT NULL,
  checked_in boolean NOT NULL DEFAULT false,
  checked_in_at timestamptz,
  dietary text,
  accessibility text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS feedback (
  id text PRIMARY KEY,
  event_id text NOT NULL,
  name text,
  nps integer NOT NULL,
  rating integer NOT NULL,
  liked text,
  improve text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS promo_items (
  id text PRIMARY KEY,
  event_id text NOT NULL,
  channel text NOT NULL,
  title text NOT NULL,
  due_date text NOT NULL,
  status text NOT NULL DEFAULT 'todo',
  link text
);
CREATE TABLE IF NOT EXISTS reminders (
  id text PRIMARY KEY,
  event_id text NOT NULL,
  label text NOT NULL,
  offset_days integer NOT NULL,
  scheduled_for text NOT NULL,
  audience text NOT NULL DEFAULT 'attendees',
  status text NOT NULL DEFAULT 'scheduled',
  sent_at timestamptz
);
CREATE TABLE IF NOT EXISTS runsheet_items (
  id text PRIMARY KEY,
  event_id text NOT NULL,
  start_time text NOT NULL,
  end_time text NOT NULL,
  activity text NOT NULL,
  owner text,
  location text,
  notes text
);
CREATE TABLE IF NOT EXISTS volunteers (
  id text PRIMARY KEY,
  event_id text NOT NULL,
  name text NOT NULL,
  role text NOT NULL,
  phone text,
  shift text,
  emergency boolean NOT NULL DEFAULT false
);
CREATE TABLE IF NOT EXISTS payments (
  id text PRIMARY KEY,
  event_id text,
  vendor_id text,
  amount double precision NOT NULL,
  currency text NOT NULL DEFAULT 'myr',
  provider text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  checkout_url text,
  provider_ref text,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz
);
CREATE TABLE IF NOT EXISTS notifications (
  id text PRIMARY KEY,
  user_id text,
  role text,
  title text NOT NULL,
  body text,
  link text,
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS creatives (
  id text PRIMARY KEY,
  event_id text NOT NULL,
  kind text NOT NULL,
  channel text NOT NULL,
  title text NOT NULL,
  caption text NOT NULL,
  hashtags text,
  image_prompt text,
  image_data text,
  image_url text,
  image_source text NOT NULL DEFAULT 'template',
  width integer NOT NULL,
  height integer NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  posted_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS key text;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS depends_on jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'medium';
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS start_date text;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS risk_id text;
ALTER TABLE risks ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'open';
ALTER TABLE risks ADD COLUMN IF NOT EXISTS mitigation_task_id text;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS university_id text;
ALTER TABLE speakers ADD COLUMN IF NOT EXISTS photo_url text;
ALTER TABLE speakers ADD COLUMN IF NOT EXISTS bio text;
ALTER TABLE speakers ADD COLUMN IF NOT EXISTS talk_title text;
ALTER TABLE speakers ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS photo_url text;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS floor_plan_url text;
ALTER TABLE events ADD COLUMN IF NOT EXISTS preferences jsonb NOT NULL DEFAULT '{}'::jsonb;
CREATE TABLE IF NOT EXISTS event_members (
  event_id text NOT NULL,
  user_id text NOT NULL,
  role text NOT NULL DEFAULT 'member',
  added_by text,
  added_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, user_id)
);
CREATE TABLE IF NOT EXISTS venue_bookings (
  id text PRIMARY KEY,
  venue_id text NOT NULL,
  title text NOT NULL,
  holder text,
  kind text NOT NULL DEFAULT 'booking',
  date text NOT NULL,
  start_time text NOT NULL,
  end_time text NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tasks_event ON tasks(event_id);
CREATE INDEX IF NOT EXISTS idx_audit_event ON audit_logs(event_id);
CREATE INDEX IF NOT EXISTS idx_rsvps_event ON rsvps(event_id);
CREATE TABLE IF NOT EXISTS event_mailboxes (
  event_id text PRIMARY KEY,
  address text NOT NULL,
  label text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sponsors (
  id text PRIMARY KEY,
  event_id text NOT NULL,
  company text NOT NULL,
  industry text,
  website text,
  logo_url text,
  contact_name text,
  contact_email text,
  ask text,
  status text NOT NULL DEFAULT 'found',
  offer_type text,
  offer_amount double precision,
  offer_note text,
  notes text,
  source text NOT NULL DEFAULT 'workbuddy',
  fit_reason text,
  contacted_at timestamptz,
  opened_at timestamptz,
  replied_at timestamptz,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sponsors_event ON sponsors(event_id);
CREATE TABLE IF NOT EXISTS meetings (
  id text PRIMARY KEY,
  event_id text NOT NULL,
  title text NOT NULL,
  starts_at timestamptz NOT NULL,
  duration_min integer NOT NULL DEFAULT 60,
  location text,
  meeting_url text,
  agenda jsonb NOT NULL DEFAULT '[]'::jsonb,
  attendees jsonb NOT NULL DEFAULT '[]'::jsonb,
  minutes text,
  decisions jsonb NOT NULL DEFAULT '[]'::jsonb,
  action_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'scheduled',
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_meetings_event ON meetings(event_id);
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS attended jsonb NOT NULL DEFAULT '[]'::jsonb;
`;
