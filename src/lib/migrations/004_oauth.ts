// OAuth 2.1 for MCP clients that connect with a "Connect" button
// (Claude.ai, ChatGPT and others) instead of a pasted token.
export default `
CREATE TABLE IF NOT EXISTS oauth_clients (
  id text PRIMARY KEY,
  name text NOT NULL,
  redirect_uris jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS oauth_codes (
  code_hash text PRIMARY KEY,
  client_id text NOT NULL,
  user_id text NOT NULL,
  redirect_uri text NOT NULL,
  code_challenge text NOT NULL,
  scope text,
  resource text,
  expires_at timestamptz NOT NULL,
  used_at timestamptz
);
CREATE TABLE IF NOT EXISTS oauth_tokens (
  id text PRIMARY KEY,
  client_id text NOT NULL,
  user_id text NOT NULL,
  access_hash text NOT NULL UNIQUE,
  refresh_hash text UNIQUE,
  scope text,
  access_expires_at timestamptz NOT NULL,
  refresh_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_oauth_tokens_user ON oauth_tokens (user_id);
`;
