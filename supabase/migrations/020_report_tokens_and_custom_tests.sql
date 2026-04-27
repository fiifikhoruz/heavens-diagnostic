-- Migration 020: report_tokens table + custom test support in visit_tests
-- ============================================================================

-- ── 1. report_tokens table ────────────────────────────────────────────────────
-- Stores secure one-time download tokens for lab reports.
CREATE TABLE IF NOT EXISTS report_tokens (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  token      TEXT UNIQUE NOT NULL,
  visit_id   UUID NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  used       BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_report_tokens_token ON report_tokens(token);
CREATE INDEX IF NOT EXISTS idx_report_tokens_visit ON report_tokens(visit_id);

-- RLS: allow authenticated staff to INSERT; anyone (even anon) to SELECT
-- by token (for the public download link). Deletion only by service role.
ALTER TABLE report_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can create report tokens"
  ON report_tokens FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Report tokens readable by creator or service role"
  ON report_tokens FOR SELECT
  TO authenticated
  USING (created_by = auth.uid());

-- ── 2. Custom test support in visit_tests ─────────────────────────────────────
-- Make test_type_id nullable so a visit_test can be a free-form custom test.
-- Add custom_name and custom_price for those rows.
ALTER TABLE visit_tests
  ALTER COLUMN test_type_id DROP NOT NULL;

ALTER TABLE visit_tests
  ADD COLUMN IF NOT EXISTS custom_name  TEXT,
  ADD COLUMN IF NOT EXISTS custom_price NUMERIC(10,2);

-- A custom test must have either a test_type_id or a custom_name — not both null.
ALTER TABLE visit_tests
  ADD CONSTRAINT chk_visit_test_has_name
  CHECK (
    test_type_id IS NOT NULL
    OR (custom_name IS NOT NULL AND custom_name <> '')
  );
