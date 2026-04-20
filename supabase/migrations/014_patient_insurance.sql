-- 014_patient_insurance.sql
-- Adds optional insurance fields to patients. Idempotent.
ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS insurance_provider TEXT,
  ADD COLUMN IF NOT EXISTS insurance_id TEXT;
