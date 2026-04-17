-- Heavens Diagnostic Services - Audit System
-- Migration 003: Create audit logging and account security tracking

-- ============================================================================
-- 1. AUDIT ACTION ENUM
-- ============================================================================

CREATE TYPE audit_action AS ENUM ('view', 'create', 'update', 'delete', 'download');

-- ============================================================================
-- 2. AUDIT LOGS TABLE
-- ============================================================================

CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    action audit_action NOT NULL,
    table_name TEXT NOT NULL,
    record_id UUID,
    metadata JSONB,
    ip_address TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Enable RLS on audit_logs (admins only)
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Indexes for efficient querying
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_table_name ON audit_logs(table_name);
CREATE INDEX idx_audit_logs_record_id ON audit_logs(record_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX idx_audit_logs_user_action ON audit_logs(user_id, action);

-- ============================================================================
-- 3. AUDIT LOG POLICIES
-- ============================================================================

-- Admins can read all audit logs
CREATE POLICY "Admins can read audit logs" ON audit_logs
    FOR SELECT
    USING (
        (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
    );

-- Users can read own audit logs
CREATE POLICY "Users can read own audit logs" ON audit_logs
    FOR SELECT
    USING (user_id = auth.uid());

-- System can insert audit logs (bypass RLS with SECURITY DEFINER)
CREATE POLICY "System can insert audit logs" ON audit_logs
    FOR INSERT
    WITH CHECK (true);

-- ============================================================================
-- 4. LOGIN ATTEMPTS TABLE
-- ============================================================================

CREATE TABLE login_attempts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email TEXT NOT NULL,
    success BOOLEAN NOT NULL DEFAULT FALSE,
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Enable RLS on login_attempts
ALTER TABLE login_attempts ENABLE ROW LEVEL SECURITY;

-- Indexes for efficient account lockout checking
CREATE INDEX idx_login_attempts_email ON login_attempts(email);
CREATE INDEX idx_login_attempts_created_at ON login_attempts(created_at DESC);
CREATE INDEX idx_login_attempts_success ON login_attempts(success);
CREATE INDEX idx_login_attempts_email_created ON login_attempts(email, created_at DESC);

-- ============================================================================
-- 5. LOGIN ATTEMPTS POLICIES
-- ============================================================================

-- Admins can read login attempts
CREATE POLICY "Admins can read login attempts" ON login_attempts
    FOR SELECT
    USING (
        (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
    );

-- System can insert login attempts (bypass RLS)
CREATE POLICY "System can insert login attempts" ON login_attempts
    FOR INSERT
    WITH CHECK (true);

-- ============================================================================
-- 6. AUDIT LOG TRIGGER FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION audit_log_changes()
RETURNS TRIGGER AS $$
DECLARE
    v_action audit_action;
    v_metadata JSONB;
BEGIN
    -- Determine the action
    IF TG_OP = 'INSERT' THEN
        v_action := 'create'::audit_action;
        v_metadata := to_jsonb(NEW);
    ELSIF TG_OP = 'UPDATE' THEN
        v_action := 'update'::audit_action;
        v_metadata := jsonb_build_object(
            'old', to_jsonb(OLD),
            'new', to_jsonb(NEW)
        );
    ELSIF TG_OP = 'DELETE' THEN
        v_action := 'delete'::audit_action;
        v_metadata := to_jsonb(OLD);
    END IF;

    -- Insert audit log
    INSERT INTO audit_logs (user_id, action, table_name, record_id, metadata)
    VALUES (
        auth.uid(),
        v_action,
        TG_TABLE_NAME,
        CASE
            WHEN TG_OP = 'DELETE' THEN OLD.id
            ELSE NEW.id
        END,
        v_metadata
    );

    -- Return appropriate row for trigger
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================================
-- 7. APPLY AUDIT TRIGGERS TO TABLES
-- ============================================================================

-- Audit patients table
CREATE TRIGGER trigger_audit_patients
AFTER INSERT OR UPDATE OR DELETE ON patients
FOR EACH ROW
EXECUTE FUNCTION audit_log_changes();

-- Audit lab_requests table
CREATE TRIGGER trigger_audit_lab_requests
AFTER INSERT OR UPDATE OR DELETE ON lab_requests
FOR EACH ROW
EXECUTE FUNCTION audit_log_changes();

-- Audit lab_results table
CREATE TRIGGER trigger_audit_lab_results
AFTER INSERT OR UPDATE OR DELETE ON lab_results
FOR EACH ROW
EXECUTE FUNCTION audit_log_changes();

-- Audit result_files table
CREATE TRIGGER trigger_audit_result_files
AFTER INSERT OR UPDATE OR DELETE ON result_files
FOR EACH ROW
EXECUTE FUNCTION audit_log_changes();

-- ============================================================================
-- 8. HELPER FUNCTION: LOG FILE DOWNLOAD
-- ============================================================================

CREATE OR REPLACE FUNCTION log_file_download(
    p_file_id UUID,
    p_ip_address TEXT DEFAULT NULL
)
RETURNS void AS $$
BEGIN
    INSERT INTO audit_logs (user_id, action, table_name, record_id, ip_address)
    VALUES (
        auth.uid(),
        'download'::audit_action,
        'result_files',
        p_file_id,
        p_ip_address
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================================
-- 9. HELPER FUNCTION: LOG LOGIN ATTEMPT
-- ============================================================================

CREATE OR REPLACE FUNCTION log_login_attempt(
    p_email TEXT,
    p_success BOOLEAN,
    p_ip_address TEXT DEFAULT NULL,
    p_user_agent TEXT DEFAULT NULL
)
RETURNS void AS $$
BEGIN
    INSERT INTO login_attempts (email, success, ip_address, user_agent)
    VALUES (p_email, p_success, p_ip_address, p_user_agent);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================================
-- 10. HELPER FUNCTION: GET FAILED LOGIN COUNT
-- ============================================================================

CREATE OR REPLACE FUNCTION get_failed_login_count(
    p_email TEXT,
    p_minutes_back INTEGER DEFAULT 30
)
RETURNS INTEGER AS $$
DECLARE
    v_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_count
    FROM login_attempts
    WHERE email = p_email
    AND success = FALSE
    AND created_at > CURRENT_TIMESTAMP - (p_minutes_back || ' minutes')::INTERVAL;

    RETURN COALESCE(v_count, 0);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- ============================================================================
-- 11. VIEW: AUDIT LOG SUMMARY
-- ============================================================================

CREATE OR REPLACE VIEW audit_summary AS
SELECT
    user_id,
    (SELECT full_name FROM profiles p WHERE p.id = al.user_id) as user_name,
    action,
    table_name,
    COUNT(*) as action_count,
    DATE(created_at) as action_date
FROM audit_logs al
GROUP BY user_id, action, table_name, DATE(created_at)
ORDER BY action_date DESC, user_id;

-- Restrict view access to admins
CREATE POLICY "Admins can query audit_summary" ON audit_summary
    FOR SELECT
    USING (
        (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
    );

-- ============================================================================
-- 12. DOCUMENTATION
-- ============================================================================

COMMENT ON TABLE audit_logs IS 'Comprehensive audit trail for tracking all changes to sensitive data';
COMMENT ON TABLE login_attempts IS 'Login attempt tracking for account security and lockout detection';
COMMENT ON FUNCTION audit_log_changes() IS 'Automatically logs all INSERT, UPDATE, DELETE operations on monitored tables';
COMMENT ON FUNCTION log_file_download(UUID, TEXT) IS 'Explicit logging for file download events';
COMMENT ON FUNCTION log_login_attempt(TEXT, BOOLEAN, TEXT, TEXT) IS 'Log login attempts for security monitoring';
COMMENT ON FUNCTION get_failed_login_count(TEXT, INTEGER) IS 'Check failed login count for account lockout logic';
COMMENT ON VIEW audit_summary IS 'Summarized view of audit logs grouped by user, action, and table';

COMMENT ON COLUMN audit_logs.action IS 'Type of action: view, create, update, delete, download';
COMMENT ON COLUMN audit_logs.metadata IS 'JSON data containing full record state (before/after for updates)';
COMMENT ON COLUMN login_attempts.success IS 'TRUE for successful login, FALSE for failed attempt';
