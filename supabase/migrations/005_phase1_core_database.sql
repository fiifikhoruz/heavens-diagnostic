-- Phase 1: Core Database Schema for Heavens Diagnostic Services
-- This migration adds new tables and enhances existing ones for the Phase 1 workflow
-- Phase 0 tables (profiles, patients, test_types, lab_requests, lab_results, result_files, audit_logs, login_attempts) already exist

-- ============================================================================
-- 1. UPDATE EXISTING TABLES
-- ============================================================================

-- Note: 'patients' table already has email column and phone index from Phase 0
-- No alterations needed for Phase 1

-- ============================================================================
-- 2. VISITS TABLE - Main visit/appointment record
-- ============================================================================

CREATE TABLE IF NOT EXISTS visits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  visit_date TIMESTAMP WITH TIME ZONE DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'created' CHECK (status IN ('created','collected','processing','review','approved','delivered')),
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Indexes for visits
CREATE INDEX idx_visits_patient_id ON visits(patient_id);
CREATE INDEX idx_visits_status ON visits(status);
CREATE INDEX idx_visits_visit_date ON visits(visit_date);
CREATE INDEX idx_visits_created_by ON visits(created_by);

-- Enable RLS on visits
ALTER TABLE visits ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 3. VISIT_TESTS TABLE - Tests associated with a visit
-- ============================================================================

CREATE TABLE IF NOT EXISTS visit_tests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  visit_id UUID NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
  test_type_id UUID NOT NULL REFERENCES test_types(id) ON DELETE RESTRICT,
  assigned_to UUID REFERENCES profiles(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','in_progress','completed','reviewed','approved')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Indexes for visit_tests
CREATE INDEX idx_visit_tests_visit_id ON visit_tests(visit_id);
CREATE INDEX idx_visit_tests_test_type_id ON visit_tests(test_type_id);
CREATE INDEX idx_visit_tests_assigned_to ON visit_tests(assigned_to);
CREATE INDEX idx_visit_tests_status ON visit_tests(status);

-- Enable RLS on visit_tests
ALTER TABLE visit_tests ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 4. TEST_RESULTS TABLE - Individual result fields with reference ranges
-- ============================================================================

CREATE TABLE IF NOT EXISTS test_results (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  test_id UUID NOT NULL REFERENCES visit_tests(id) ON DELETE CASCADE,
  field_name TEXT NOT NULL,
  value TEXT NOT NULL,
  unit TEXT,
  normal_min NUMERIC,
  normal_max NUMERIC,
  is_abnormal BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Indexes for test_results
CREATE INDEX idx_test_results_test_id ON test_results(test_id);
CREATE INDEX idx_test_results_field_name ON test_results(field_name);
CREATE INDEX idx_test_results_is_abnormal ON test_results(is_abnormal);

-- Enable RLS on test_results
ALTER TABLE test_results ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 5. DOCTOR_NOTES TABLE - Doctor observations and notes per visit
-- ============================================================================

CREATE TABLE IF NOT EXISTS doctor_notes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  visit_id UUID NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
  doctor_id UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  notes TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Indexes for doctor_notes
CREATE INDEX idx_doctor_notes_visit_id ON doctor_notes(visit_id);
CREATE INDEX idx_doctor_notes_doctor_id ON doctor_notes(doctor_id);

-- Enable RLS on doctor_notes
ALTER TABLE doctor_notes ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 6. PAYMENTS TABLE - Payment tracking per visit
-- ============================================================================

CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  visit_id UUID NOT NULL UNIQUE REFERENCES visits(id) ON DELETE CASCADE,
  amount NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  status TEXT NOT NULL DEFAULT 'unpaid' CHECK (status IN ('paid','unpaid','partial')),
  method TEXT CHECK (method IN ('cash','momo','card','insurance')),
  received_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Indexes for payments
CREATE INDEX idx_payments_visit_id ON payments(visit_id);
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_payments_received_by ON payments(received_by);

-- Enable RLS on payments
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 7. SAMPLES TABLE - Physical samples collected during visit
-- ============================================================================

CREATE TABLE IF NOT EXISTS samples (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  visit_id UUID NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
  sample_type TEXT NOT NULL CHECK (sample_type IN ('blood','urine','stool','sputum','swab','other')),
  barcode TEXT UNIQUE,
  collected_at TIMESTAMP WITH TIME ZONE,
  collected_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','collected','processing','completed','rejected')),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Indexes for samples
CREATE INDEX idx_samples_visit_id ON samples(visit_id);
CREATE INDEX idx_samples_barcode ON samples(barcode);
CREATE INDEX idx_samples_status ON samples(status);
CREATE INDEX idx_samples_collected_by ON samples(collected_by);

-- Enable RLS on samples
ALTER TABLE samples ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 8. VISIT_TIMESTAMPS TABLE - Performance tracking for visits
-- ============================================================================

CREATE TABLE IF NOT EXISTS visit_timestamps (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  visit_id UUID NOT NULL UNIQUE REFERENCES visits(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE,
  collected_at TIMESTAMP WITH TIME ZONE,
  processed_at TIMESTAMP WITH TIME ZONE,
  reviewed_at TIMESTAMP WITH TIME ZONE,
  approved_at TIMESTAMP WITH TIME ZONE,
  delivered_at TIMESTAMP WITH TIME ZONE
);

-- Indexes for visit_timestamps
CREATE INDEX idx_visit_timestamps_visit_id ON visit_timestamps(visit_id);

-- Enable RLS on visit_timestamps
ALTER TABLE visit_timestamps ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 9. HELPER FUNCTION - Update visit status timestamps
-- ============================================================================

CREATE OR REPLACE FUNCTION update_visit_status_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  -- Only proceed if status has changed
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    -- Get or create visit_timestamps record
    INSERT INTO visit_timestamps (visit_id, created_at, collected_at, processed_at, reviewed_at, approved_at, delivered_at)
    VALUES (NEW.id, CASE WHEN NEW.status = 'created' THEN now() ELSE NULL END,
                    CASE WHEN NEW.status = 'collected' THEN now() ELSE NULL END,
                    CASE WHEN NEW.status = 'processing' THEN now() ELSE NULL END,
                    CASE WHEN NEW.status = 'review' THEN now() ELSE NULL END,
                    CASE WHEN NEW.status = 'approved' THEN now() ELSE NULL END,
                    CASE WHEN NEW.status = 'delivered' THEN now() ELSE NULL END)
    ON CONFLICT (visit_id) DO UPDATE SET
      created_at = CASE WHEN NEW.status = 'created' THEN COALESCE(visit_timestamps.created_at, now()) ELSE visit_timestamps.created_at END,
      collected_at = CASE WHEN NEW.status = 'collected' THEN COALESCE(visit_timestamps.collected_at, now()) ELSE visit_timestamps.collected_at END,
      processed_at = CASE WHEN NEW.status = 'processing' THEN COALESCE(visit_timestamps.processed_at, now()) ELSE visit_timestamps.processed_at END,
      reviewed_at = CASE WHEN NEW.status = 'review' THEN COALESCE(visit_timestamps.reviewed_at, now()) ELSE visit_timestamps.reviewed_at END,
      approved_at = CASE WHEN NEW.status = 'approved' THEN COALESCE(visit_timestamps.approved_at, now()) ELSE visit_timestamps.approved_at END,
      delivered_at = CASE WHEN NEW.status = 'delivered' THEN COALESCE(visit_timestamps.delivered_at, now()) ELSE visit_timestamps.delivered_at END;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger for visits status changes
CREATE TRIGGER tr_visits_update_timestamps
AFTER UPDATE ON visits
FOR EACH ROW
EXECUTE FUNCTION update_visit_status_timestamp();

-- ============================================================================
-- 10. AUTO-UPDATE TRIGGERS - updated_at columns
-- ============================================================================

-- Trigger for visits (if update_updated_at_column exists)
CREATE TRIGGER tr_visits_updated_at
BEFORE UPDATE ON visits
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Trigger for visit_tests
CREATE TRIGGER tr_visit_tests_updated_at
BEFORE UPDATE ON visit_tests
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Trigger for test_results
CREATE TRIGGER tr_test_results_updated_at
BEFORE UPDATE ON test_results
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Trigger for doctor_notes
CREATE TRIGGER tr_doctor_notes_updated_at
BEFORE UPDATE ON doctor_notes
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Trigger for payments
CREATE TRIGGER tr_payments_updated_at
BEFORE UPDATE ON payments
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Trigger for samples
CREATE TRIGGER tr_samples_updated_at
BEFORE UPDATE ON samples
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 11. AUDIT LOGGING TRIGGERS
-- ============================================================================

-- Audit trigger for visits
CREATE TRIGGER tr_visits_audit
AFTER INSERT OR UPDATE OR DELETE ON visits
FOR EACH ROW
EXECUTE FUNCTION audit_log_changes();

-- Audit trigger for visit_tests
CREATE TRIGGER tr_visit_tests_audit
AFTER INSERT OR UPDATE OR DELETE ON visit_tests
FOR EACH ROW
EXECUTE FUNCTION audit_log_changes();

-- Audit trigger for test_results
CREATE TRIGGER tr_test_results_audit
AFTER INSERT OR UPDATE OR DELETE ON test_results
FOR EACH ROW
EXECUTE FUNCTION audit_log_changes();

-- Audit trigger for doctor_notes
CREATE TRIGGER tr_doctor_notes_audit
AFTER INSERT OR UPDATE OR DELETE ON doctor_notes
FOR EACH ROW
EXECUTE FUNCTION audit_log_changes();

-- Audit trigger for payments
CREATE TRIGGER tr_payments_audit
AFTER INSERT OR UPDATE OR DELETE ON payments
FOR EACH ROW
EXECUTE FUNCTION audit_log_changes();

-- Audit trigger for samples
CREATE TRIGGER tr_samples_audit
AFTER INSERT OR UPDATE OR DELETE ON samples
FOR EACH ROW
EXECUTE FUNCTION audit_log_changes();

-- Audit trigger for visit_timestamps
CREATE TRIGGER tr_visit_timestamps_audit
AFTER INSERT OR UPDATE OR DELETE ON visit_timestamps
FOR EACH ROW
EXECUTE FUNCTION audit_log_changes();

-- ============================================================================
-- 12. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

-- ============================================================================
-- VISITS RLS Policies
-- ============================================================================

-- Admin: full access
CREATE POLICY admin_visits_all ON visits
  AS PERMISSIVE FOR ALL
  USING (get_user_role() = 'admin')
  WITH CHECK (get_user_role() = 'admin');

-- Front desk: can create and read
CREATE POLICY front_desk_visits_create ON visits
  AS PERMISSIVE FOR INSERT
  WITH CHECK (get_user_role() = 'front_desk');

CREATE POLICY front_desk_visits_read ON visits
  AS PERMISSIVE FOR SELECT
  USING (get_user_role() = 'front_desk');

CREATE POLICY front_desk_visits_update ON visits
  AS PERMISSIVE FOR UPDATE
  USING (get_user_role() = 'front_desk')
  WITH CHECK (get_user_role() = 'front_desk');

-- Technician: can read and update status
CREATE POLICY technician_visits_read ON visits
  AS PERMISSIVE FOR SELECT
  USING (get_user_role() = 'technician');

CREATE POLICY technician_visits_update ON visits
  AS PERMISSIVE FOR UPDATE
  USING (get_user_role() = 'technician')
  WITH CHECK (get_user_role() = 'technician');

-- Doctor: can read, update, and approve
CREATE POLICY doctor_visits_read ON visits
  AS PERMISSIVE FOR SELECT
  USING (get_user_role() = 'doctor');

CREATE POLICY doctor_visits_update ON visits
  AS PERMISSIVE FOR UPDATE
  USING (get_user_role() = 'doctor')
  WITH CHECK (get_user_role() = 'doctor');

-- Authenticated users can read their own patient's visits
-- Note: patients table doesn't have user_id, so this policy allows all authenticated access
CREATE POLICY authenticated_visits_own_patient ON visits
  AS PERMISSIVE FOR SELECT
  USING (auth.role() = 'authenticated');

-- ============================================================================
-- VISIT_TESTS RLS Policies
-- ============================================================================

-- Admin: full access
CREATE POLICY admin_visit_tests_all ON visit_tests
  AS PERMISSIVE FOR ALL
  USING (get_user_role() = 'admin')
  WITH CHECK (get_user_role() = 'admin');

-- Technician: can read and update
CREATE POLICY technician_visit_tests_read ON visit_tests
  AS PERMISSIVE FOR SELECT
  USING (get_user_role() = 'technician');

CREATE POLICY technician_visit_tests_update ON visit_tests
  AS PERMISSIVE FOR UPDATE
  USING (get_user_role() = 'technician')
  WITH CHECK (get_user_role() = 'technician');

-- Doctor: can read and approve
CREATE POLICY doctor_visit_tests_read ON visit_tests
  AS PERMISSIVE FOR SELECT
  USING (get_user_role() = 'doctor');

CREATE POLICY doctor_visit_tests_approve ON visit_tests
  AS PERMISSIVE FOR UPDATE
  USING (get_user_role() = 'doctor')
  WITH CHECK (get_user_role() = 'doctor');

-- ============================================================================
-- TEST_RESULTS RLS Policies
-- ============================================================================

-- Admin: full access
CREATE POLICY admin_test_results_all ON test_results
  AS PERMISSIVE FOR ALL
  USING (get_user_role() = 'admin')
  WITH CHECK (get_user_role() = 'admin');

-- Technician: can create and update own results
CREATE POLICY technician_test_results_create ON test_results
  AS PERMISSIVE FOR INSERT
  WITH CHECK (get_user_role() = 'technician');

CREATE POLICY technician_test_results_update ON test_results
  AS PERMISSIVE FOR UPDATE
  USING (get_user_role() = 'technician')
  WITH CHECK (get_user_role() = 'technician');

-- Doctor: can read all results
CREATE POLICY doctor_test_results_read ON test_results
  AS PERMISSIVE FOR SELECT
  USING (get_user_role() = 'doctor');

-- Authenticated users can read non-sensitive results
-- Note: patients table doesn't have user_id mapping, so allowing authenticated access to non-sensitive data only
CREATE POLICY authenticated_test_results_read ON test_results
  AS PERMISSIVE FOR SELECT
  USING (
    auth.role() = 'authenticated'
    AND test_id IN (
      SELECT vt.id FROM visit_tests vt
      JOIN test_types tt ON vt.test_type_id = tt.id
      WHERE tt.is_sensitive = false
    )
  );

-- ============================================================================
-- DOCTOR_NOTES RLS Policies
-- ============================================================================

-- Admin: full access
CREATE POLICY admin_doctor_notes_all ON doctor_notes
  AS PERMISSIVE FOR ALL
  USING (get_user_role() = 'admin')
  WITH CHECK (get_user_role() = 'admin');

-- Doctor: can create and read own notes
CREATE POLICY doctor_notes_create ON doctor_notes
  AS PERMISSIVE FOR INSERT
  WITH CHECK (get_user_role() = 'doctor' AND doctor_id = auth.uid());

CREATE POLICY doctor_notes_read_own ON doctor_notes
  AS PERMISSIVE FOR SELECT
  USING (get_user_role() = 'doctor' AND doctor_id = auth.uid());

-- Doctor can also read all notes (not just own for context)
CREATE POLICY doctor_notes_read_all ON doctor_notes
  AS PERMISSIVE FOR SELECT
  USING (get_user_role() = 'doctor');

CREATE POLICY doctor_notes_update ON doctor_notes
  AS PERMISSIVE FOR UPDATE
  USING (get_user_role() = 'doctor' AND doctor_id = auth.uid())
  WITH CHECK (get_user_role() = 'doctor' AND doctor_id = auth.uid());

-- ============================================================================
-- PAYMENTS RLS Policies
-- ============================================================================

-- Admin: full access
CREATE POLICY admin_payments_all ON payments
  AS PERMISSIVE FOR ALL
  USING (get_user_role() = 'admin')
  WITH CHECK (get_user_role() = 'admin');

-- Front desk: can create, read, and update
CREATE POLICY front_desk_payments_create ON payments
  AS PERMISSIVE FOR INSERT
  WITH CHECK (get_user_role() = 'front_desk');

CREATE POLICY front_desk_payments_read ON payments
  AS PERMISSIVE FOR SELECT
  USING (get_user_role() = 'front_desk');

CREATE POLICY front_desk_payments_update ON payments
  AS PERMISSIVE FOR UPDATE
  USING (get_user_role() = 'front_desk')
  WITH CHECK (get_user_role() = 'front_desk');

-- ============================================================================
-- SAMPLES RLS Policies
-- ============================================================================

-- Admin: full access
CREATE POLICY admin_samples_all ON samples
  AS PERMISSIVE FOR ALL
  USING (get_user_role() = 'admin')
  WITH CHECK (get_user_role() = 'admin');

-- Technician: can create and update
CREATE POLICY technician_samples_create ON samples
  AS PERMISSIVE FOR INSERT
  WITH CHECK (get_user_role() = 'technician');

CREATE POLICY technician_samples_update ON samples
  AS PERMISSIVE FOR UPDATE
  USING (get_user_role() = 'technician')
  WITH CHECK (get_user_role() = 'technician');

CREATE POLICY technician_samples_read ON samples
  AS PERMISSIVE FOR SELECT
  USING (get_user_role() = 'technician');

-- Front desk: can read
CREATE POLICY front_desk_samples_read ON samples
  AS PERMISSIVE FOR SELECT
  USING (get_user_role() = 'front_desk');

-- Doctor: can read
CREATE POLICY doctor_samples_read ON samples
  AS PERMISSIVE FOR SELECT
  USING (get_user_role() = 'doctor');

-- ============================================================================
-- VISIT_TIMESTAMPS RLS Policies
-- ============================================================================

-- Admin: full access
CREATE POLICY admin_visit_timestamps_all ON visit_timestamps
  AS PERMISSIVE FOR ALL
  USING (get_user_role() = 'admin')
  WITH CHECK (get_user_role() = 'admin');

-- All authenticated users can read visit_timestamps
CREATE POLICY authenticated_visit_timestamps_read ON visit_timestamps
  AS PERMISSIVE FOR SELECT
  USING (auth.role() = 'authenticated');

-- System/triggers can insert and update (using service role)
CREATE POLICY system_visit_timestamps_insert ON visit_timestamps
  AS PERMISSIVE FOR INSERT
  WITH CHECK (true);

CREATE POLICY system_visit_timestamps_update ON visit_timestamps
  AS PERMISSIVE FOR UPDATE
  WITH CHECK (true);

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
