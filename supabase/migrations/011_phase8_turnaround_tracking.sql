-- Phase 8: Turnaround Time Tracking & Operational Enhancements
--
-- The visit_timestamps table already exists with schema:
--   id, visit_id (UNIQUE), created_at, collected_at, processed_at,
--   reviewed_at, approved_at, delivered_at
-- And a trigger (tr_visits_update_timestamps) already auto-records
-- timestamps on visit status changes via update_visit_status_timestamp().
--
-- This migration adds analytics views and functions on top of that.

-- 1. View for turnaround time analytics
CREATE OR REPLACE VIEW v_turnaround_times AS
SELECT
  v.id AS visit_id,
  v.patient_id,
  p.first_name || ' ' || p.last_name AS patient_name,
  v.visit_date,
  v.status AS current_status,
  -- Stage timestamps
  vts.created_at AS created_at_ts,
  vts.collected_at AS collected_at_ts,
  vts.processed_at AS processing_at_ts,
  vts.reviewed_at AS review_at_ts,
  vts.approved_at AS approved_at_ts,
  vts.delivered_at AS delivered_at_ts,
  -- Total time from first to latest timestamp (hours)
  EXTRACT(EPOCH FROM (
    GREATEST(
      COALESCE(vts.delivered_at, '1970-01-01'),
      COALESCE(vts.approved_at, '1970-01-01'),
      COALESCE(vts.reviewed_at, '1970-01-01'),
      COALESCE(vts.processed_at, '1970-01-01'),
      COALESCE(vts.collected_at, '1970-01-01'),
      COALESCE(vts.created_at, '1970-01-01')
    )
    - COALESCE(vts.created_at, v.created_at)
  )) / 3600.0 AS total_hours,
  -- Registration to collection (hours)
  EXTRACT(EPOCH FROM (vts.collected_at - vts.created_at)) / 3600.0
    AS registration_to_collection_hours,
  -- Collection to processing
  EXTRACT(EPOCH FROM (vts.processed_at - vts.collected_at)) / 3600.0
    AS collection_to_processing_hours,
  -- Processing to review
  EXTRACT(EPOCH FROM (vts.reviewed_at - vts.processed_at)) / 3600.0
    AS processing_to_review_hours,
  -- Review to approval
  EXTRACT(EPOCH FROM (vts.approved_at - vts.reviewed_at)) / 3600.0
    AS review_to_approval_hours,
  -- Approval to delivery
  EXTRACT(EPOCH FROM (vts.delivered_at - vts.approved_at)) / 3600.0
    AS approval_to_delivery_hours
FROM visits v
JOIN patients p ON p.id = v.patient_id
LEFT JOIN visit_timestamps vts ON vts.visit_id = v.id;

-- 2. Function to get average turnaround by date range
CREATE OR REPLACE FUNCTION get_avg_turnaround(
  p_start_date DATE DEFAULT (CURRENT_DATE - interval '30 days')::DATE,
  p_end_date DATE DEFAULT CURRENT_DATE
) RETURNS TABLE(
  avg_total_hours NUMERIC,
  avg_registration_to_collection NUMERIC,
  avg_collection_to_processing NUMERIC,
  avg_processing_to_review NUMERIC,
  avg_review_to_approval NUMERIC,
  avg_approval_to_delivery NUMERIC,
  total_visits BIGINT,
  completed_visits BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ROUND(AVG(tat.total_hours)::NUMERIC, 2),
    ROUND(AVG(tat.registration_to_collection_hours)::NUMERIC, 2),
    ROUND(AVG(tat.collection_to_processing_hours)::NUMERIC, 2),
    ROUND(AVG(tat.processing_to_review_hours)::NUMERIC, 2),
    ROUND(AVG(tat.review_to_approval_hours)::NUMERIC, 2),
    ROUND(AVG(tat.approval_to_delivery_hours)::NUMERIC, 2),
    COUNT(*),
    COUNT(*) FILTER (WHERE tat.current_status = 'delivered')
  FROM v_turnaround_times tat
  WHERE tat.visit_date BETWEEN p_start_date AND p_end_date;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Overdue visits view (visits that exceeded expected turnaround)
CREATE OR REPLACE VIEW v_overdue_visits AS
SELECT
  v.id AS visit_id,
  v.patient_id,
  p.first_name || ' ' || p.last_name AS patient_name,
  v.visit_date,
  v.status,
  EXTRACT(EPOCH FROM (now() - v.created_at)) / 3600.0 AS hours_since_creation,
  COALESCE(
    (SELECT MAX(tt.turnaround_hours)
     FROM visit_tests vt2
     JOIN test_types tt ON tt.id = vt2.test_type_id
     WHERE vt2.visit_id = v.id),
    24
  ) AS expected_hours,
  CASE
    WHEN EXTRACT(EPOCH FROM (now() - v.created_at)) / 3600.0 >
      COALESCE(
        (SELECT MAX(tt.turnaround_hours)
         FROM visit_tests vt2
         JOIN test_types tt ON tt.id = vt2.test_type_id
         WHERE vt2.visit_id = v.id),
        24)
    THEN true
    ELSE false
  END AS is_overdue
FROM visits v
JOIN patients p ON p.id = v.patient_id
WHERE v.status NOT IN ('delivered', 'approved')
ORDER BY hours_since_creation DESC;
