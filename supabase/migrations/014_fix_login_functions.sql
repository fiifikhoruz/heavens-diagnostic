-- Migration 014: Fix check_account_lock and record_login_attempt
-- Root cause: both functions queried profiles.email which doesn't exist.
-- Fix: join auth.users to find the profile by email instead.
-- Safe to run multiple times (CREATE OR REPLACE).

-- ── check_account_lock ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION check_account_lock(user_email TEXT)
RETURNS TABLE(is_locked BOOLEAN, failed_count INTEGER, lock_until TIMESTAMPTZ) AS $$
DECLARE
  v_failed_count  INTEGER;
  v_is_locked     BOOLEAN;
  v_locked_at     TIMESTAMPTZ;
  v_profile_id    UUID;
BEGIN
  -- Count recent failed login attempts for this email
  SELECT COUNT(*) INTO v_failed_count
  FROM login_attempts
  WHERE email = user_email
    AND success = false
    AND attempted_at > now() - interval '15 minutes';

  -- Find the matching profile via auth.users (profiles has no email column)
  SELECT p.id, p.is_locked, p.locked_at
    INTO v_profile_id, v_is_locked, v_locked_at
  FROM profiles p
  JOIN auth.users u ON u.id = p.id
  WHERE u.email = user_email
  LIMIT 1;

  IF v_failed_count >= 5 THEN
    -- Auto-lock the account
    IF v_profile_id IS NOT NULL THEN
      UPDATE profiles
        SET is_locked        = true,
            locked_at        = now(),
            lock_reason      = 'Too many failed login attempts',
            failed_login_count = v_failed_count
      WHERE id = v_profile_id;
    END IF;
    RETURN QUERY SELECT true, v_failed_count, (now() + interval '30 minutes')::TIMESTAMPTZ;
  ELSE
    RETURN QUERY SELECT
      COALESCE(v_is_locked, false),
      v_failed_count,
      CASE WHEN v_locked_at IS NOT NULL
           THEN v_locked_at + interval '30 minutes'
           ELSE NULL::TIMESTAMPTZ
      END;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── record_login_attempt ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION record_login_attempt(
  p_email      TEXT,
  p_ip         TEXT    DEFAULT NULL,
  p_user_agent TEXT    DEFAULT NULL,
  p_success    BOOLEAN DEFAULT false
) RETURNS VOID AS $$
BEGIN
  INSERT INTO login_attempts (email, ip_address, user_agent, success)
  VALUES (p_email, p_ip, p_user_agent, p_success);

  -- On successful login, clear the lock on the matching profile
  IF p_success THEN
    UPDATE profiles p
       SET failed_login_count = 0,
           is_locked          = false,
           locked_at          = NULL,
           lock_reason        = NULL
      FROM auth.users u
     WHERE u.id = p.id
       AND u.email = p_email;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
