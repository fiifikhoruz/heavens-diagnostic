-- Phase 6: Result Revision Tracking
-- Rule: No silent edits. Every change must be tracked.
-- IDEMPOTENT: safe to run multiple times

CREATE TABLE IF NOT EXISTS result_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  result_id UUID NOT NULL REFERENCES test_results(id) ON DELETE CASCADE,
  test_id UUID NOT NULL REFERENCES visit_tests(id),
  field_name TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT NOT NULL,
  old_is_abnormal BOOLEAN,
  new_is_abnormal BOOLEAN,
  changed_by UUID NOT NULL REFERENCES profiles(id),
  reason TEXT NOT NULL CHECK (char_length(reason) >= 5),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_result_revisions_result ON result_revisions(result_id);
CREATE INDEX IF NOT EXISTS idx_result_revisions_test ON result_revisions(test_id);
CREATE INDEX IF NOT EXISTS idx_result_revisions_changed_by ON result_revisions(changed_by);
CREATE INDEX IF NOT EXISTS idx_result_revisions_created_at ON result_revisions(created_at DESC);

-- Trigger: log revisions automatically when test_results are updated
CREATE OR REPLACE FUNCTION log_result_revision()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.value IS DISTINCT FROM NEW.value THEN
    INSERT INTO result_revisions (
      result_id, test_id, field_name,
      old_value, new_value,
      old_is_abnormal, new_is_abnormal,
      changed_by, reason
    ) VALUES (
      NEW.id, NEW.test_id, NEW.field_name,
      OLD.value, NEW.value,
      OLD.is_abnormal, NEW.is_abnormal,
      COALESCE(current_setting('app.current_user_id', true)::UUID, '00000000-0000-0000-0000-000000000000'),
      COALESCE(NULLIF(current_setting('app.revision_reason', true), ''), 'System update')
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_log_result_revision ON test_results;
CREATE TRIGGER trg_log_result_revision
  BEFORE UPDATE ON test_results
  FOR EACH ROW EXECUTE FUNCTION log_result_revision();

-- Prevent direct deletes on test_results
CREATE OR REPLACE FUNCTION prevent_result_deletion()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Test results cannot be deleted. Use revision system to correct values.';
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_result_deletion ON test_results;
CREATE TRIGGER trg_prevent_result_deletion
  BEFORE DELETE ON test_results
  FOR EACH ROW EXECUTE FUNCTION prevent_result_deletion();

-- RLS
ALTER TABLE result_revisions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view revisions" ON result_revisions;
CREATE POLICY "Authenticated users can view revisions"
  ON result_revisions FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Technicians and doctors can create revisions" ON result_revisions;
CREATE POLICY "Technicians and doctors can create revisions"
  ON result_revisions FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('technician', 'doctor', 'admin')
    )
  );

-- Audit trail view
CREATE OR REPLACE VIEW v_result_audit_trail AS
SELECT
  rr.id AS revision_id,
  rr.result_id,
  rr.test_id,
  rr.field_name,
  rr.old_value,
  rr.new_value,
  rr.old_is_abnormal,
  rr.new_is_abnormal,
  rr.reason,
  rr.created_at AS revised_at,
  p.full_name AS changed_by_name,
  p.role AS changed_by_role,
  vt.visit_id,
  tt.name AS test_name
FROM result_revisions rr
JOIN profiles p ON p.id = rr.changed_by
JOIN visit_tests vt ON vt.id = rr.test_id
JOIN test_types tt ON tt.id = vt.test_type_id
ORDER BY rr.created_at DESC;
