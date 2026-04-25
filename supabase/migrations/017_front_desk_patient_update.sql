-- Migration 017: Grant front_desk UPDATE access on patients
-- Context:
--   Migration 002 created SELECT and INSERT policies for front_desk on patients
--   but omitted UPDATE. This means front desk staff could register a new patient
--   but could not correct any information afterwards (phone, address, insurance, etc.).
--   Admin already has UPDATE via "Admin full access to patients" (migration 002).
--
-- Scope: full row UPDATE — front desk handles patient intake and corrections.
--   There is no column-level RLS in Postgres; restricting specific columns
--   (e.g. preventing front_desk from changing is_active) is enforced in the API layer.

CREATE POLICY "Front desk can update patients" ON patients
  FOR UPDATE
  USING (get_user_role() = 'front_desk')
  WITH CHECK (get_user_role() = 'front_desk');
