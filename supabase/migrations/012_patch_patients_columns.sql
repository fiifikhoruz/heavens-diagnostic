-- Migration 012: Add missing columns to patients table
-- Safe to run multiple times (IF NOT EXISTS guards on each column)

ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS city TEXT,
  ADD COLUMN IF NOT EXISTS state TEXT,
  ADD COLUMN IF NOT EXISTS postal_code TEXT,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
