-- Phase 3: Workflow Engine for Heavens Diagnostic Services
-- Enforces state transitions, role restrictions, payment rules, and technician assignments

-- ============================================================================
-- 1. ADD PAYMENT DEFERRED SUPPORT
-- ============================================================================

-- Add deferred option to payments status
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_status_check;
ALTER TABLE payments ADD CONSTRAINT payments_status_check
  CHECK (status IN ('paid','unpaid','partial','deferred'));

-- ============================================================================
-- 2. VALID STATE TRANSITION FUNCTION
-- ============================================================================

-- Define valid visit status transitions
CREATE OR REPLACE FUNCTION validate_visit_transition()
RETURNS TRIGGER AS $$
DECLARE
  valid_transition BOOLEAN := false;
  user_role TEXT;
BEGIN
  -- Skip if status hasn't changed
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  -- Get the current user's role
  SELECT role INTO user_role FROM profiles WHERE id = auth.uid();

  -- Define valid transitions
  -- created -> collected (technician, admin)
  -- collected -> processing (technician, admin)
  -- processing -> review (technician, admin)
  -- review -> approved (doctor, admin)
  -- approved -> delivered (front_desk, admin)

  CASE
    WHEN OLD.status = 'created' AND NEW.status = 'collected' THEN
      IF user_role IN ('technician', 'admin') THEN
        valid_transition := true;
      END IF;
    WHEN OLD.status = 'collected' AND NEW.status = 'processing' THEN
      IF user_role IN ('technician', 'admin') THEN
        valid_transition := true;
      END IF;
    WHEN OLD.status = 'processing' AND NEW.status = 'review' THEN
      IF user_role IN ('technician', 'admin') THEN
        valid_transition := true;
      END IF;
    WHEN OLD.status = 'review' AND NEW.status = 'approved' THEN
      IF user_role IN ('doctor', 'admin') THEN
        valid_transition := true;
      END IF;
    WHEN OLD.status = 'review' AND NEW.status = 'processing' THEN
      -- Allow doctor to send back for retesting
      IF user_role IN ('doctor', 'admin') THEN
        valid_transition := true;
      END IF;
    WHEN OLD.status = 'approved' AND NEW.status = 'delivered' THEN
      IF user_role IN ('front_desk', 'admin') THEN
        valid_transition := true;
      END IF;
    ELSE
      valid_transition := false;
  END CASE;

  IF NOT valid_transition THEN
    RAISE EXCEPTION 'Invalid status transition from % to % for role %', OLD.status, NEW.status, user_role;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger for visit status transition validation
DROP TRIGGER IF EXISTS tr_validate_visit_transition ON visits;
CREATE TRIGGER tr_validate_visit_transition
BEFORE UPDATE ON visits
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION validate_visit_transition();

-- ============================================================================
-- 3. PAYMENT GATE FUNCTION
-- ============================================================================

-- Prevent processing unless payment is paid or deferred
CREATE OR REPLACE FUNCTION check_payment_before_processing()
RETURNS TRIGGER AS $$
DECLARE
  payment_status TEXT;
BEGIN
  -- Only check when transitioning from collected to processing
  IF OLD.status = 'collected' AND NEW.status = 'processing' THEN
    SELECT p.status INTO payment_status
    FROM payments p
    WHERE p.visit_id = NEW.id
    LIMIT 1;

    IF payment_status IS NULL THEN
      RAISE EXCEPTION 'No payment record found for this visit. Create a payment before processing.';
    END IF;

    IF payment_status NOT IN ('paid', 'deferred') THEN
      RAISE EXCEPTION 'Visit cannot proceed to processing. Payment must be paid or marked as deferred. Current status: %', payment_status;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger for payment gate (runs before the transition validator)
DROP TRIGGER IF EXISTS tr_check_payment_before_processing ON visits;
CREATE TRIGGER tr_check_payment_before_processing
BEFORE UPDATE ON visits
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION check_payment_before_processing();

-- ============================================================================
-- 4. TECHNICIAN CANNOT APPROVE FUNCTION
-- ============================================================================

-- Prevent technicians from changing visit_test status to 'approved'
CREATE OR REPLACE FUNCTION prevent_technician_approve()
RETURNS TRIGGER AS $$
DECLARE
  user_role TEXT;
BEGIN
  IF NEW.status = 'approved' THEN
    SELECT role INTO user_role FROM profiles WHERE id = auth.uid();
    IF user_role = 'technician' THEN
      RAISE EXCEPTION 'Technicians cannot approve test results. Only doctors and admins can approve.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS tr_prevent_technician_approve ON visit_tests;
CREATE TRIGGER tr_prevent_technician_approve
BEFORE UPDATE ON visit_tests
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION prevent_technician_approve();

-- ============================================================================
-- 5. DOCTOR CANNOT EDIT RAW RESULTS
-- ============================================================================

-- Prevent doctors from inserting or updating test_results directly
CREATE OR REPLACE FUNCTION prevent_doctor_edit_results()
RETURNS TRIGGER AS $$
DECLARE
  user_role TEXT;
BEGIN
  SELECT role INTO user_role FROM profiles WHERE id = auth.uid();
  IF user_role = 'doctor' THEN
    RAISE EXCEPTION 'Doctors cannot edit raw test results. Only technicians and admins can enter results.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS tr_prevent_doctor_edit_results ON test_results;
CREATE TRIGGER tr_prevent_doctor_edit_results
BEFORE INSERT OR UPDATE ON test_results
FOR EACH ROW
EXECUTE FUNCTION prevent_doctor_edit_results();

-- ============================================================================
-- 6. FRONT DESK CANNOT SEE RESULTS - Already handled by RLS in Phase 1
-- But add explicit RLS policy denial for front_desk on test_results
-- ============================================================================

-- Drop any existing permissive front_desk policy on test_results if it exists
DROP POLICY IF EXISTS front_desk_test_results_read ON test_results;

-- Explicitly deny front_desk from reading test_results
-- (No SELECT policy for front_desk means they can't read test_results)

-- ============================================================================
-- 7. AUTO-ASSIGN TECHNICIAN HELPER
-- ============================================================================

-- Function to assign a test to a technician
CREATE OR REPLACE FUNCTION assign_test_to_technician(
  p_test_id UUID,
  p_technician_id UUID
)
RETURNS VOID AS $$
DECLARE
  tech_role TEXT;
BEGIN
  -- Verify the assignee is actually a technician
  SELECT role INTO tech_role FROM profiles WHERE id = p_technician_id;
  IF tech_role NOT IN ('technician', 'admin') THEN
    RAISE EXCEPTION 'Can only assign tests to technicians or admins';
  END IF;

  UPDATE visit_tests
  SET assigned_to = p_technician_id, updated_at = now()
  WHERE id = p_test_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================================
-- 8. ABNORMAL PRIORITY VIEW FOR DOCTORS
-- ============================================================================

-- Create a view that shows visits with abnormal results for doctor prioritization
CREATE OR REPLACE VIEW v_abnormal_visits AS
SELECT DISTINCT
  v.id AS visit_id,
  v.patient_id,
  v.status AS visit_status,
  v.visit_date,
  p.first_name,
  p.last_name,
  p.phone,
  COUNT(DISTINCT tr.id) FILTER (WHERE tr.is_abnormal = true) AS abnormal_count,
  COUNT(DISTINCT vt.id) AS total_tests,
  ARRAY_AGG(DISTINCT tt.name) FILTER (WHERE tr.is_abnormal = true) AS abnormal_test_names,
  MAX(tr.created_at) AS last_result_time
FROM visits v
JOIN patients p ON v.patient_id = p.id
JOIN visit_tests vt ON v.id = vt.visit_id
JOIN test_types tt ON vt.test_type_id = tt.id
LEFT JOIN test_results tr ON vt.id = tr.test_id
WHERE v.status IN ('review', 'processing')
GROUP BY v.id, v.patient_id, v.status, v.visit_date, p.first_name, p.last_name, p.phone
ORDER BY
  -- Prioritize: abnormal cases first, then oldest first
  COUNT(DISTINCT tr.id) FILTER (WHERE tr.is_abnormal = true) DESC,
  v.visit_date ASC;

-- ============================================================================
-- 9. TECHNICIAN QUEUE VIEW
-- ============================================================================

CREATE OR REPLACE VIEW v_technician_queue AS
SELECT
  vt.id AS test_id,
  vt.visit_id,
  vt.test_type_id,
  vt.assigned_to,
  vt.status AS test_status,
  vt.created_at AS test_created_at,
  v.status AS visit_status,
  v.visit_date,
  v.patient_id,
  p.first_name AS patient_first_name,
  p.last_name AS patient_last_name,
  p.phone AS patient_phone,
  tt.name AS test_name,
  tt.code AS test_code,
  tt.category AS test_category,
  pay.status AS payment_status
FROM visit_tests vt
JOIN visits v ON vt.visit_id = v.id
JOIN patients p ON v.patient_id = p.id
JOIN test_types tt ON vt.test_type_id = tt.id
LEFT JOIN payments pay ON v.id = pay.visit_id
WHERE vt.status IN ('pending', 'in_progress')
  AND v.status IN ('collected', 'processing')
ORDER BY
  -- Oldest first
  vt.created_at ASC;

-- ============================================================================
-- 10. GRANT ACCESS TO VIEWS
-- ============================================================================

-- Grant select access on views to authenticated users
-- (RLS on underlying tables still applies)
GRANT SELECT ON v_abnormal_visits TO authenticated;
GRANT SELECT ON v_technician_queue TO authenticated;

-- ============================================================================
-- END OF PHASE 3 MIGRATION
-- ============================================================================
