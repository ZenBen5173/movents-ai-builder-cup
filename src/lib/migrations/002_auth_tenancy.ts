// Real accounts, society workspaces, hashed credentials and the indexes the
// app's hot queries need.
export default `
ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_sub text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url text;
ALTER TABLE users ALTER COLUMN role SET DEFAULT 'committee';
CREATE UNIQUE INDEX IF NOT EXISTS users_email_key ON users (lower(email));
CREATE UNIQUE INDEX IF NOT EXISTS users_google_sub_key ON users (google_sub) WHERE google_sub IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_society ON users (society_id);

ALTER TABLE societies ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE societies ADD COLUMN IF NOT EXISTS created_by text;
CREATE INDEX IF NOT EXISTS idx_societies_university ON societies (university_id);

ALTER TABLE universities ADD COLUMN IF NOT EXISTS created_by_society text;
ALTER TABLE universities ADD COLUMN IF NOT EXISTS latitude double precision;
ALTER TABLE universities ADD COLUMN IF NOT EXISTS longitude double precision;
UPDATE universities SET latitude = 3.0675, longitude = 101.6036 WHERE id = 'uni_sunway' AND latitude IS NULL;

-- A user can belong to several societies; users.society_id/role/department
-- hold the active one so existing queries keep working.
CREATE TABLE IF NOT EXISTS memberships (
  society_id text NOT NULL,
  user_id text NOT NULL,
  role text NOT NULL,
  department text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (society_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_memberships_user ON memberships (user_id);
INSERT INTO memberships (society_id, user_id, role, department)
  SELECT society_id, id, role, department FROM users WHERE society_id IS NOT NULL
  ON CONFLICT DO NOTHING;

-- People in a society with their role there (users.role is only the active one).
CREATE OR REPLACE VIEW society_members AS
  SELECT u.id, u.name, u.email, u.phone, u.avatar_url, m.society_id, m.role, m.department, m.created_at AS joined_at
  FROM memberships m JOIN users u ON u.id = m.user_id;

CREATE TABLE IF NOT EXISTS invites (
  id text PRIMARY KEY,
  society_id text NOT NULL,
  email text NOT NULL,
  role text NOT NULL,
  department text,
  token_hash text NOT NULL UNIQUE,
  invited_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  revoked_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_invites_society ON invites (society_id);
CREATE INDEX IF NOT EXISTS idx_invites_email ON invites (lower(email));

CREATE TABLE IF NOT EXISTS sessions (
  token_hash text PRIMARY KEY,
  user_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  user_agent text,
  ip text
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions (user_id);

CREATE TABLE IF NOT EXISTS login_tokens (
  token_hash text PRIMARY KEY,
  email text NOT NULL,
  next_path text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_at timestamptz
);

CREATE TABLE IF NOT EXISTS api_tokens (
  id text PRIMARY KEY,
  user_id text NOT NULL,
  name text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  prefix text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_api_tokens_user ON api_tokens (user_id);
-- Existing plaintext keys keep working as hashed tokens, then the plaintext goes.
INSERT INTO api_tokens (id, user_id, name, token_hash, prefix)
  SELECT 'tok_' || substr(md5(id || api_key), 1, 12), id, 'Migrated key', encode(sha256(convert_to(api_key, 'UTF8')), 'hex'), left(api_key, 7)
  FROM users WHERE api_key IS NOT NULL
  ON CONFLICT DO NOTHING;
UPDATE users SET api_key = NULL WHERE api_key IS NOT NULL;

-- Audit entries and role-addressed notifications belong to one society.
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS society_id text;
UPDATE audit_logs a SET society_id = e.society_id FROM events e WHERE a.society_id IS NULL AND e.id = a.event_id;
UPDATE audit_logs a SET society_id = u.society_id FROM users u WHERE a.society_id IS NULL AND u.id = a.user_id;
CREATE INDEX IF NOT EXISTS idx_audit_society ON audit_logs (society_id, created_at DESC);
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS society_id text;
UPDATE notifications n SET society_id = u.society_id FROM users u WHERE n.society_id IS NULL AND u.id = n.user_id;
CREATE INDEX IF NOT EXISTS idx_notifications_society ON notifications (society_id, role, created_at DESC);

ALTER TABLE approval_requests ADD COLUMN IF NOT EXISTS society_id text;
UPDATE approval_requests a SET society_id = e.society_id FROM events e WHERE a.society_id IS NULL AND e.id = a.event_id;
UPDATE approval_requests a SET society_id = u.society_id FROM users u WHERE a.society_id IS NULL AND u.id = a.requested_by;
CREATE INDEX IF NOT EXISTS idx_approvals_society ON approval_requests (society_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_approval ON audit_logs ((details->>'approval_id')) WHERE action = 'approval.requested';

CREATE TABLE IF NOT EXISTS rate_limits (
  key text PRIMARY KEY,
  window_start timestamptz NOT NULL,
  count integer NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_events_society ON events (society_id, date);
CREATE INDEX IF NOT EXISTS idx_event_members_user ON event_members (user_id);
CREATE INDEX IF NOT EXISTS idx_speakers_event ON speakers (event_id);
CREATE INDEX IF NOT EXISTS idx_vendors_event ON vendors (event_id);
CREATE INDEX IF NOT EXISTS idx_vendors_university ON vendors (university_id);
CREATE INDEX IF NOT EXISTS idx_budget_lines_event ON budget_lines (event_id);
CREATE INDEX IF NOT EXISTS idx_risks_event ON risks (event_id);
CREATE INDEX IF NOT EXISTS idx_creatives_event ON creatives (event_id);
CREATE INDEX IF NOT EXISTS idx_runsheet_event ON runsheet_items (event_id);
CREATE INDEX IF NOT EXISTS idx_promo_event ON promo_items (event_id);
CREATE INDEX IF NOT EXISTS idx_volunteers_event ON volunteers (event_id);
CREATE INDEX IF NOT EXISTS idx_feedback_event ON feedback (event_id);
CREATE INDEX IF NOT EXISTS idx_reminders_due ON reminders (status, scheduled_for);
CREATE INDEX IF NOT EXISTS idx_reminders_event ON reminders (event_id);
CREATE INDEX IF NOT EXISTS idx_emails_event ON emails (event_id);
CREATE INDEX IF NOT EXISTS idx_payments_event ON payments (event_id);
CREATE INDEX IF NOT EXISTS idx_calendar_event ON calendar_events (event_id);
CREATE INDEX IF NOT EXISTS idx_approvals_event ON approval_requests (event_id, status);
CREATE INDEX IF NOT EXISTS idx_approvals_status ON approval_requests (status);
CREATE INDEX IF NOT EXISTS idx_runs_status ON agent_runs (status, created_at);
CREATE INDEX IF NOT EXISTS idx_runs_event ON agent_runs (event_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_venues_university ON venues (university_id);
CREATE INDEX IF NOT EXISTS idx_sop_university ON sop_documents (university_id, kind);
CREATE INDEX IF NOT EXISTS idx_venue_bookings ON venue_bookings (venue_id, date);
CREATE INDEX IF NOT EXISTS idx_rsvps_ticket ON rsvps (ticket);
CREATE INDEX IF NOT EXISTS idx_rsvps_email ON rsvps (event_id, lower(email));

-- The assistant used to be one specific product; sources are now neutral.
UPDATE speakers SET source = 'assistant' WHERE source = 'workbuddy';
UPDATE vendors SET source = 'assistant' WHERE source = 'workbuddy';
UPDATE sponsors SET source = 'assistant' WHERE source = 'workbuddy';
ALTER TABLE sponsors ALTER COLUMN source SET DEFAULT 'assistant';
UPDATE creatives SET image_source = 'assistant' WHERE image_source = 'workbuddy';
UPDATE agent_runs SET source = 'assistant' WHERE source = 'workbuddy';

-- Rows written while the json serializer double-encoded values.
DO $$
DECLARE c record;
BEGIN
  FOR c IN SELECT table_name, column_name FROM information_schema.columns
           WHERE table_schema = current_schema() AND data_type = 'jsonb' LOOP
    BEGIN
    EXECUTE format(
      'UPDATE %I SET %I = (%I #>> ''{}'')::jsonb WHERE jsonb_typeof(%I) = ''string'' AND left(ltrim(%I #>> ''{}''), 1) IN (''['', ''{'')',
      c.table_name, c.column_name, c.column_name, c.column_name, c.column_name);
    EXCEPTION WHEN others THEN RAISE NOTICE 'jsonb repair skipped for %.%', c.table_name, c.column_name;
    END;
  END LOOP;
END $$;
`;
