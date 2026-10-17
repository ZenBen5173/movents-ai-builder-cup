// Documents the committee uploads to an event's Files tab, shared with everyone
// on the event. Kept in the database (bytea), so they work wherever the app runs.
export default `
CREATE TABLE IF NOT EXISTS event_files (
  id text PRIMARY KEY,
  event_id text NOT NULL,
  name text NOT NULL,
  mime text NOT NULL,
  size integer NOT NULL,
  data bytea NOT NULL,
  uploaded_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_event_files_event ON event_files (event_id, created_at DESC);
`;
