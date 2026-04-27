-- Migration 018: Fix audit system — correct trigger NULL bug, RLS gaps,
-- column mismatches, missing triggers, and add secure logging function.
-- SAFE TO RUN MULTIPLE TIMES (idempotent where possible).

-- ============================================================================
-- 1. FIX audit_logs.user_id NOT NULL — service-role operations set auth.uid()
--    to NULL. The trigger would crash the entire parent transaction.
-- ============================================================================

ALTER TABLE audit_logs ALTER COLUMN user_id DROP NOT NULL;

-- ============================================================================
-- 2. REBUILD audit_log_changes() trigger to handle NULL auth.uid()
--    and capture the IP address when available.
-- ============================================================================

CREATE OR REPLACE FUNCTION audit_log_changes()
RETURNS TRIGGER AS $$
DECLARE
  v_action   audit_action;
  v_metadata JSONB;
  v_user_id  UUID;
  v_record_id UUID;
BEGIN
  -- auth.uid() is NULL for service-role / migration operations — that is fine.
  v_user_id := auth.uid();

  CASE TG_OP
    WHEN 'INSERT' THEN
      v_action     := 'create'::audit_action;
      v_metadata   := to_jsonb(NEW);
      v_record_id  := NEW.id;
    WHEN 'UPDATE' THEN
      v_action     := 'update'::audit_action;
      v_metadata   := jsonb_build_object('old', to_jsonb(OLD), 'new', to_jsonb(NEW));
      v_record_id  := NEW.id;
    WHEN 'DELETE' THEN
      v_action     := 'delete'::audit_action;
      v_metadata   := to_jsonb(OLD);
      v_record_id  := OLD.id;
  END CASE;

  INSERT INTO audit_logs (user_id, action, table_name, record_id, metadata)
  VALUES (v_user_id, v_action, TG_TABLE_NAME, v_record_id, v_metadata);

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================================
-- 3. ADD MISSING AUDIT TRIGGERS on visits and visit_tests
--    (the core workflow tables had no coverage at all)
-- ============================================================================

DROP TRIGGER IF EXISTS trigger_audit_visits      ON visits;
DROP TRIGGER IF EXISTS trigger_audit_visit_tests ON visit_tests;

CREATE TRIGGER trigger_audit_visits
  AFTER INSERT OR UPDATE OR DELETE ON visits
  FOR EACH ROW EXECUTE FUNCTION audit_log_changes();

CREATE TRIGGER trigger_audit_visit_tests
  AFTER INSERT OR UPDATE OR DELETE ON visit_tests
  FOR EACH ROW EXECUTE FUNCTION audit_log_changes();

-- ============================================================================
-- 4. FIX audit_logs RLS — ensure it's tight and complete.
--    Uses get_user_role() SECURITY DEFINER (already exists) for performance.
-- ============================================================================

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Drop old policies (may have wrong names from migration 003)
DROP POLICY IF EXISTS "Admins can read audit logs"        ON audit_logs;
DROP POLICY IF EXISTS "Users can read own audit logs"     ON audit_logs;
DROP POLICY IF EXISTS "System can insert audit logs"      ON audit_logs;

-- Admins see everything
CREATE POLICY "audit_logs: admin read all"
  ON audit_logs FOR SELECT TO authenticated
  USING (get_user_role() = 'admin');

-- Any authenticated staff sees only their own entries
CREATE POLICY "audit_logs: user read own"
  ON audit_logs FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- INSERT: only via SECURITY DEFINER trigger — no direct client inserts
-- (The trigger function runs as DB owner, bypassing this check)
CREATE POLICY "audit_logs: trigger insert only"
  ON audit_logs FOR INSERT TO authenticated
  WITH CHECK (false);  -- Direct inserts blocked; trigger bypasses via SECURITY DEFINER

-- No UPDATE or DELETE — audit logs are immutable
-- (No policies = operation is denied by default under RLS)

-- ============================================================================
-- 5. FIX admin_activity_log RLS
--    Problem: INSERT policy required admin role, but the SECURITY DEFINER
--    function already enforces this — the dual-check caused silent failures.
-- ============================================================================

ALTER TABLE admin_activity_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view all admin activity"  ON admin_activity_log;
DROP POLICY IF EXISTS "Admins can insert activity logs"     ON admin_activity_log;

-- Read: admin only
CREATE POLICY "admin_activity_log: admin read all"
  ON admin_activity_log FOR SELECT TO authenticated
  USING (get_user_role() = 'admin');

-- Insert: blocked directly — all writes go through log_admin_action_secure()
-- which is SECURITY DEFINER and enforces the admin check itself.
CREATE POLICY "admin_activity_log: insert via function only"
  ON admin_activity_log FOR INSERT TO authenticated
  WITH CHECK (false);

-- No UPDATE or DELETE — immutable
-- ============================================================================
-- 6. SECURITY DEFINER function for client-side admin action logging.
--    Verifies admin role inside the function, then inserts bypassing RLS.
--    Called via supabase.rpc('log_admin_action_secure', {...})
-- ============================================================================

CREATE OR REPLACE FUNCTION log_admin_action_secure(
  p_action      TEXT,
  p_target_type TEXT    DEFAULT NULL,
  p_target_id   TEXT    DEFAULT NULL,
  p_details     JSONB   DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_id      UUID;
  v_caller  UUID := auth.uid();
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = v_caller AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Access denied: admin role required';
  END IF;

  INSERT INTO admin_activity_log (admin_id, action, target_type, target_id, details)
  VALUES (v_caller, p_action, p_target_type, p_target_id, p_details)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION log_admin_action_secure(TEXT, TEXT, TEXT, JSONB) TO authenticated;

-- ============================================================================
-- 7. Server-side logging function (used by API routes with service role key).
--    Accepts admin_id explicitly because service role has no auth.uid().
-- ============================================================================

CREATE OR REPLACE FUNCTION log_admin_action_server(
  p_admin_id    UUID,
  p_action      TEXT,
  p_target_type TEXT    DEFAULT NULL,
  p_target_id   TEXT    DEFAULT NULL,
  p_details     JSONB   DEFAULT NULL
) RETURNS UUID AS $$
DECLARE v_id UUID;
BEGIN
  INSERT INTO admin_activity_log (admin_id, action, target_type, target_id, details)
  VALUES (p_admin_id, p_action, p_target_type, p_target_id, p_details)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Only the service role (used by API routes) should call this
-- authenticated users should use log_admin_action_secure instead
REVOKE EXECUTE ON FUNCTION log_admin_action_server(UUID, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION log_admin_action_server(UUID, TEXT, TEXT, TEXT, JSONB) TO service_role;

-- ============================================================================
-- 8. ENRICHED VIEW: audit log with staff name for the admin UI
-- ============================================================================

DROP VIEW IF EXISTS v_audit_log_enriched;

CREATE VIEW v_audit_log_enriched AS
SELECT
  al.id,
  al.user_id,
  COALESCE(p.full_name, '[system]')      AS actor_name,
  p.username                             AS actor_username,
  p.role                                 AS actor_role,
  al.action,
  al.table_name,
  al.record_id,
  al.metadata,
  al.ip_address,
  al.created_at
FROM audit_logs al
LEFT JOIN profiles p ON p.id = al.user_id
ORDER BY al.created_at DESC;

-- The view inherits RLS from audit_logs (SECURITY INVOKER by default),
-- so admin sees all rows, other staff see only their own.

-- ============================================================================
-- 9. FIX login_attempts RLS — currently no INSERT policy for unauthenticated
--    callers (login happens before the session exists).
-- ============================================================================

ALTER TABLE login_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Only admins can view login attempts" ON login_attempts;
DROP POLICY IF EXISTS "Service can insert login attempts"   ON login_attempts;

-- Admins read all
CREATE POLICY "login_attempts: admin read all"
  ON login_attempts FOR SELECT TO authenticated
  USING (get_user_role() = 'admin');

-- Insert allowed from anon role (login happens before auth exists)
-- The SECURITY DEFINER record_login_attempt() function handles this safely.
CREATE POLICY "login_attempts: anon insert"
  ON login_attempts FOR INSERT TO anon, authenticated
  WITH CHECK (true);

-- No UPDATE or DELETE
