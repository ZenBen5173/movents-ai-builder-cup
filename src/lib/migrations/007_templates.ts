// A society's own document templates (pre-event proposal, post-event report,
// speaker profile, risk list...) and the copies Gemini filled for each event.
export default `
CREATE TABLE IF NOT EXISTS society_templates (
  id text PRIMARY KEY,
  society_id text NOT NULL,
  kind text NOT NULL,
  name text NOT NULL,
  filename text,
  text text NOT NULL,
  uploaded_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_society_templates ON society_templates (society_id, created_at DESC);
CREATE TABLE IF NOT EXISTS filled_templates (
  id text PRIMARY KEY,
  event_id text NOT NULL,
  template_id text NOT NULL,
  doc jsonb NOT NULL,
  gaps jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_filled_templates_event ON filled_templates (event_id, created_at DESC);
`;
