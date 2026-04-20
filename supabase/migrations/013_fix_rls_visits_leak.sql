-- Migration 013: Remove overly-permissive RLS policies that leaked data across roles
-- Safe to run multiple times (DROP POLICY IF EXISTS)
--
-- Context:
--   005_phase1_core_database.sql lines 344-346 created a policy that allowed ANY
--   authenticated user to SELECT every visit in the database. This overrode the
--   correct role-based SELECT policies (front_desk_visits_read, technician_visits_read,
--   doctor_visits_read, admin_visits_all) because RLS policies are OR-combined.
--
--   The same mistake exists on test_results (authenticated_test_results_read).
--
-- After this migration, visits and test_results are readable only to the four
-- role-based policies that already exist. No new policies are added — we rely on
-- the ones defined in migration 005.

DROP POLICY IF EXISTS authenticated_visits_own_patient ON visits;
DROP POLICY IF EXISTS authenticated_test_results_read ON test_results;

-- Verification (optional, run in SQL editor to confirm):
-- SELECT polname FROM pg_policy
--  WHERE polrelid = 'public.visits'::regclass ORDER BY polname;
-- Expected: admin_visits_all, doctor_visits_read, doctor_visits_update,
--           front_desk_visits_create, front_desk_visits_read, front_desk_visits_update,
--           technician_visits_read, technician_visits_update
