-- Migration 015: Username-to-email lookup function
-- SECURITY DEFINER means it runs as the DB owner and can read auth.users
-- even when called with the anon key — no service role needed for login.
-- Safe to run multiple times (CREATE OR REPLACE).

CREATE OR REPLACE FUNCTION lookup_email_by_username(p_username TEXT)
RETURNS TEXT AS $$
  SELECT u.email
  FROM auth.users u
  JOIN profiles p ON p.id = u.id
  WHERE p.username ILIKE p_username
  LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Grant execute to the anon and authenticated roles so the login API
-- can call it via the public Supabase client (no service role key needed).
GRANT EXECUTE ON FUNCTION lookup_email_by_username(TEXT) TO anon, authenticated;
