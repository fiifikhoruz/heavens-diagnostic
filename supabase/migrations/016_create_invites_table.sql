-- 016_create_invites_table.sql
-- Custom token-based invite system.
-- Admins generate a one-time link; the user lands on /set-password?token=...
-- and sets their password without ever needing to be authenticated first.

CREATE TABLE IF NOT EXISTS invites (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token       TEXT        NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  used        BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index so token lookups are fast
CREATE INDEX IF NOT EXISTS invites_token_idx ON invites (token);

-- Only service-role (backend) should touch this table.
-- Disable all RLS policies — API routes use the admin client.
ALTER TABLE invites ENABLE ROW LEVEL SECURITY;
-- No policies = no access for anon/authenticated roles (service_role bypasses RLS).
