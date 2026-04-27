-- Migration 019: Fix is_active on profiles + auto-advance visit status trigger
-- ============================================================================

-- ── 1. Add is_active column to profiles ──────────────────────────────────────
-- The column was missing from the original schema. All existing staff are active.
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

-- Back-fill: any existing rows that somehow got NULL become active
UPDATE profiles SET is_active = TRUE WHERE is_active IS NULL;

-- ── 2. Auto-advance visits.status when all tests are completed ───────────────
-- When the last test in a visit is marked 'completed', the DB automatically
-- moves the visit to 'review' so the doctor queue picks it up instantly.
-- Using SECURITY DEFINER so the trigger runs as the owner even under RLS.

CREATE OR REPLACE FUNCTION auto_advance_visit_to_review()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total     INT;
  v_completed INT;
BEGIN
  -- Only fire when a test transitions INTO 'completed'
  IF NEW.status = 'completed' AND (OLD.status IS DISTINCT FROM 'completed') THEN

    SELECT COUNT(*)
      INTO v_total
      FROM visit_tests
     WHERE visit_id = NEW.visit_id;

    SELECT COUNT(*)
      INTO v_completed
      FROM visit_tests
     WHERE visit_id = NEW.visit_id
       AND status = 'completed';

    -- If every test in the visit is now done → move visit to 'review'
    IF v_total > 0 AND v_total = v_completed THEN
      UPDATE visits
         SET status     = 'review',
             updated_at = NOW()
       WHERE id = NEW.visit_id
         -- Never downgrade a visit that's already past 'review'
         AND status NOT IN ('review', 'approved', 'delivered');
    END IF;

  END IF;

  RETURN NEW;
END;
$$;

-- Drop old trigger if it exists (idempotent)
DROP TRIGGER IF EXISTS trg_advance_visit_on_test_complete ON visit_tests;

CREATE TRIGGER trg_advance_visit_on_test_complete
  AFTER UPDATE ON visit_tests
  FOR EACH ROW
  EXECUTE FUNCTION auto_advance_visit_to_review();

-- ── 3. Enable Realtime on the relevant tables ────────────────────────────────
-- Required for Supabase Realtime postgres_changes subscriptions to work.
ALTER PUBLICATION supabase_realtime ADD TABLE visit_tests;
ALTER PUBLICATION supabase_realtime ADD TABLE visits;
ALTER PUBLICATION supabase_realtime ADD TABLE patients;
