-- Phase 7: Security Hardening
-- IDEMPOTENT: safe to run multiple times

-- Login attempt tracking
DROP TABLE IF EXISTS login_attempts CASCADE;
CREATE TABLE login_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  success BOOLEAN NOT NULL DEFAULT false,
  attempted_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_login_attempts_email ON login_attempts(email, attempted_at DESC);
CREATE INDEX idx_login_attempts_ip ON login_attempts(ip_address, attempted_at DESC);

-- Account lock columns
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_locked BOOLEAN DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS lock_reason TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS failed_login_count INTEGER DEFAULT 0;

-- Check account lock status
CREATE OR REPLACE FUNCTION check_account_lock(user_email TEXT)
RETURNS TABLE(is_locked BOOLEAN, failed_count INTEGER, lock_until TIMESTAMPTZ) AS $$
DECLARE
  v_failed_count INTEGER;
  v_is_locked BOOLEAN;
  v_locked_at TIMESTAMPTZ;
BEGIN
  SELECT COUNT(*) INTO v_failed_count
  FROM login_attempts
  WHERE email = user_email
    AND success = false
    AND attempted_at > now() - interval '15 minutes';

  SELECT p.is_locked, p.locked_at INTO v_is_locked, v_locked_at
  FROM profiles p WHERE p.email = user_email;

  IF v_failed_count >= 5 THEN
    UPDATE profiles
    SET is_locked = true, locked_at = now(),
        lock_reason = 'Too many failed login attempts',
        failed_login_count = v_failed_count
    WHERE email = user_email;
    RETURN QUERY SELECT true, v_failed_count, (now() + interval '30 minutes')::TIMESTAMPTZ;
  ELSE
    RETURN QUERY SELECT COALESCE(v_is_locked, false), v_failed_count,
      CASE WHEN v_locked_at IS NOT NULL THEN v_locked_at + interval '30 minutes' ELSE NULL END;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Record a login attempt
CREATE OR REPLACE FUNCTION record_login_attempt(
  p_email TEXT,
  p_ip TEXT DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL,
  p_success BOOLEAN DEFAULT false
) RETURNS VOID AS $$
BEGIN
  INSERT INTO login_attempts (email, ip_address, user_agent, success)
  VALUES (p_email, p_ip, p_user_agent, p_success);

  IF p_success THEN
    UPDATE profiles
    SET failed_login_count = 0, is_locked = false, locked_at = NULL, lock_reason = NULL
    WHERE email = p_email;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Admin activity log
DROP TABLE IF EXISTS admin_activity_log CASCADE;
CREATE TABLE admin_activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES profiles(id),
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  details JSONB,
  ip_address TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_admin_activity_admin ON admin_activity_log(admin_id, created_at DESC);
CREATE INDEX idx_admin_activity_action ON admin_activity_log(action, created_at DESC);

-- Log admin activity
CREATE OR REPLACE FUNCTION log_admin_activity(
  p_admin_id UUID,
  p_action TEXT,
  p_target_type TEXT DEFAULT NULL,
  p_target_id TEXT DEFAULT NULL,
  p_details JSONB DEFAULT NULL
) RETURNS UUID AS $$
DECLARE v_id UUID;
BEGIN
  INSERT INTO admin_activity_log (admin_id, action, target_type, target_id, details)
  VALUES (p_admin_id, p_action, p_target_type, p_target_id, p_details)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Sensitive data masking view
CREATE OR REPLACE VIEW v_safe_test_results AS
SELECT
  tr.id,
  tr.test_id,
  tr.field_name,
  CASE
    WHEN tt.is_sensitive = true
      AND NOT EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
        AND role IN ('doctor', 'admin')
      )
    THEN '***RESTRICTED***'
    ELSE tr.value
  END AS value,
  tr.unit,
  tr.normal_min,
  tr.normal_max,
  CASE
    WHEN tt.is_sensitive = true
      AND NOT EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
        AND role IN ('doctor', 'admin')
      )
    THEN NULL
    ELSE tr.is_abnormal
  END AS is_abnormal,
  tt.is_sensitive
FROM test_results tr
JOIN visit_tests vt ON vt.id = tr.test_id
JOIN test_types tt ON tt.id = vt.test_type_id;

-- RLS
ALTER TABLE login_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_activity_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Only admins can view login attempts" ON login_attempts;
CREATE POLICY "Only admins can view login attempts"
  ON login_attempts FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "Service can insert login attempts" ON login_attempts;
CREATE POLICY "Service can insert login attempts"
  ON login_attempts FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Admins can view all admin activity" ON admin_activity_log;
CREATE POLICY "Admins can view all admin activity"
  ON admin_activity_log FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "Admins can insert activity logs" ON admin_activity_log;
CREATE POLICY "Admins can insert activity logs"
  ON admin_activity_log FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Rate limit check
CREATE OR REPLACE FUNCTION check_rate_limit(
  p_ip TEXT,
  p_window_minutes INTEGER DEFAULT 15,
  p_max_attempts INTEGER DEFAULT 10
) RETURNS BOOLEAN AS $$
DECLARE v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM login_attempts
  WHERE ip_address = p_ip
    AND attempted_at > now() - (p_window_minutes || ' minutes')::interval;
  RETURN v_count < p_max_attempts;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
