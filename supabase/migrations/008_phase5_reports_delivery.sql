-- Phase 5: Reports Delivery System
-- Enables secure report downloads and SMS notifications
-- IDEMPOTENT: safe to run multiple times

-- Create report_tokens table
CREATE TABLE IF NOT EXISTS report_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id UUID NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  is_used BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL
);

-- Create notifications table
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id UUID NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'logged')),
  sent_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_report_tokens_token ON report_tokens(token);
CREATE INDEX IF NOT EXISTS idx_report_tokens_visit ON report_tokens(visit_id);
CREATE INDEX IF NOT EXISTS idx_report_tokens_expires_at ON report_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_notifications_visit ON notifications(visit_id);
CREATE INDEX IF NOT EXISTS idx_notifications_phone ON notifications(phone);

-- Enable RLS
ALTER TABLE report_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- RLS Policies for report_tokens
DROP POLICY IF EXISTS "Authenticated users can create report tokens" ON report_tokens;
CREATE POLICY "Authenticated users can create report tokens"
  ON report_tokens FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Users can view tokens for their visits" ON report_tokens;
CREATE POLICY "Users can view tokens for their visits"
  ON report_tokens FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Service role can read all tokens" ON report_tokens;
CREATE POLICY "Service role can read all tokens"
  ON report_tokens FOR SELECT
  USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Service role can update tokens" ON report_tokens;
CREATE POLICY "Service role can update tokens"
  ON report_tokens FOR UPDATE
  USING (auth.role() = 'service_role');

-- RLS Policies for notifications
DROP POLICY IF EXISTS "Authenticated users can create notifications" ON notifications;
CREATE POLICY "Authenticated users can create notifications"
  ON notifications FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Users can view notifications for their visits" ON notifications;
CREATE POLICY "Users can view notifications for their visits"
  ON notifications FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Service role can access all notifications" ON notifications;
CREATE POLICY "Service role can access all notifications"
  ON notifications FOR ALL
  USING (auth.role() = 'service_role');

-- Function to clean up expired tokens
CREATE OR REPLACE FUNCTION delete_expired_tokens()
RETURNS void AS $$
BEGIN
  DELETE FROM report_tokens WHERE expires_at < now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION delete_expired_tokens TO authenticated, service_role;

COMMENT ON TABLE report_tokens IS 'Secure tokens for report downloads. Expires after 72 hours.';
COMMENT ON TABLE notifications IS 'Log of all SMS/email notifications sent to patients.';
