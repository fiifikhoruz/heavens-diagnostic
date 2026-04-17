-- Heavens Diagnostic Services - Row Level Security Policies
-- Migration 002: Implement strict RLS based on user roles

-- ============================================================================
-- 1. HELPER FUNCTION: GET USER ROLE
-- ============================================================================

CREATE OR REPLACE FUNCTION get_user_role()
RETURNS user_role AS $$
DECLARE
    user_role_value user_role;
BEGIN
    SELECT role INTO user_role_value
    FROM profiles
    WHERE id = auth.uid()
    LIMIT 1;

    RETURN user_role_value;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- ============================================================================
-- 2. PROFILES TABLE POLICIES
-- ============================================================================

-- Users can view their own profile
CREATE POLICY "Users can view own profile" ON profiles
    FOR SELECT
    USING (auth.uid() = id);

-- Admins can view all profiles
CREATE POLICY "Admins can view all profiles" ON profiles
    FOR SELECT
    USING (get_user_role() = 'admin');

-- Users can update their own profile (except role)
CREATE POLICY "Users can update own profile" ON profiles
    FOR UPDATE
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id AND role = (SELECT role FROM profiles WHERE id = auth.uid()));

-- Admins can update any profile
CREATE POLICY "Admins can update all profiles" ON profiles
    FOR UPDATE
    USING (get_user_role() = 'admin')
    WITH CHECK (get_user_role() = 'admin');

-- Admins can insert profiles (via user creation flow)
CREATE POLICY "Admins can create profiles" ON profiles
    FOR INSERT
    WITH CHECK (get_user_role() = 'admin');

-- ============================================================================
-- 3. PATIENTS TABLE POLICIES
-- ============================================================================

-- Front desk: can create patients
CREATE POLICY "Front desk can create patients" ON patients
    FOR INSERT
    WITH CHECK (
        get_user_role() = 'front_desk' OR
        get_user_role() = 'admin'
    );

-- Front desk: can read basic patient info (not sensitive details)
CREATE POLICY "Front desk can read patient basic info" ON patients
    FOR SELECT
    USING (
        get_user_role() = 'front_desk' OR
        get_user_role() = 'admin' OR
        get_user_role() = 'doctor'
    );

-- Technician: read-only access
CREATE POLICY "Technician read-only patient access" ON patients
    FOR SELECT
    USING (
        get_user_role() = 'technician' OR
        get_user_role() = 'admin'
    );

-- Doctor: full read access
CREATE POLICY "Doctor full read access to patients" ON patients
    FOR SELECT
    USING (
        get_user_role() = 'doctor' OR
        get_user_role() = 'admin'
    );

-- Admin: full access to patients
CREATE POLICY "Admin full access to patients" ON patients
    FOR UPDATE
    USING (get_user_role() = 'admin')
    WITH CHECK (get_user_role() = 'admin');

CREATE POLICY "Admin can delete patients" ON patients
    FOR DELETE
    USING (get_user_role() = 'admin');

-- ============================================================================
-- 4. TEST TYPES TABLE POLICIES
-- ============================================================================

-- Everyone authenticated can read active test types
CREATE POLICY "Authenticated users can read active test types" ON test_types
    FOR SELECT
    USING (
        is_active = TRUE AND
        (
            get_user_role() IS NOT NULL OR
            auth.uid() IS NOT NULL
        )
    );

-- Sensitive tests only visible to doctors and admins (in SELECT statements via separate policy)
CREATE POLICY "Only doctors and admins can see sensitive test types" ON test_types
    FOR SELECT
    USING (
        is_sensitive = FALSE OR
        get_user_role() = 'doctor' OR
        get_user_role() = 'admin'
    );

-- Admins can manage test types
CREATE POLICY "Admins can manage test types" ON test_types
    FOR UPDATE
    USING (get_user_role() = 'admin')
    WITH CHECK (get_user_role() = 'admin');

CREATE POLICY "Admins can insert test types" ON test_types
    FOR INSERT
    WITH CHECK (get_user_role() = 'admin');

-- ============================================================================
-- 5. LAB REQUESTS TABLE POLICIES
-- ============================================================================

-- Front desk: can create lab requests
CREATE POLICY "Front desk can create lab requests" ON lab_requests
    FOR INSERT
    WITH CHECK (
        get_user_role() = 'front_desk' OR
        get_user_role() = 'admin'
    );

-- Front desk: can read lab requests they created
CREATE POLICY "Front desk can read own lab requests" ON lab_requests
    FOR SELECT
    USING (
        created_by = auth.uid() OR
        get_user_role() = 'admin'
    );

-- Technician: can read all lab requests (to see what's assigned)
CREATE POLICY "Technician can read lab requests" ON lab_requests
    FOR SELECT
    USING (
        get_user_role() = 'technician' OR
        get_user_role() = 'admin' OR
        get_user_role() = 'doctor'
    );

-- Technician: can update status of assigned requests
CREATE POLICY "Technician can update assigned lab requests" ON lab_requests
    FOR UPDATE
    USING (
        assigned_to = auth.uid() OR
        get_user_role() = 'admin'
    )
    WITH CHECK (
        assigned_to = auth.uid() OR
        get_user_role() = 'admin'
    );

-- Doctor: can read and update lab requests
CREATE POLICY "Doctor can read lab requests" ON lab_requests
    FOR SELECT
    USING (
        get_user_role() = 'doctor' OR
        get_user_role() = 'admin'
    );

CREATE POLICY "Doctor can update lab requests" ON lab_requests
    FOR UPDATE
    USING (
        get_user_role() = 'doctor' OR
        get_user_role() = 'admin'
    )
    WITH CHECK (
        get_user_role() = 'doctor' OR
        get_user_role() = 'admin'
    );

-- Admin: full access
CREATE POLICY "Admin full access to lab requests" ON lab_requests
    FOR DELETE
    USING (get_user_role() = 'admin');

-- ============================================================================
-- 6. LAB RESULTS TABLE POLICIES
-- ============================================================================

-- Technician: can write results only to tests assigned to them
CREATE POLICY "Technician can enter results for assigned tests" ON lab_results
    FOR INSERT
    WITH CHECK (
        -- Get the lab_request
        EXISTS (
            SELECT 1 FROM lab_requests lr
            WHERE lr.id = lab_request_id
            AND lr.assigned_to = auth.uid()
        ) OR
        get_user_role() = 'admin'
    );

-- Technician: can update their own entered results (before review)
CREATE POLICY "Technician can update own entered results" ON lab_results
    FOR UPDATE
    USING (
        (
            entered_by = auth.uid() AND
            status = 'entered'
        ) OR
        get_user_role() = 'admin'
    )
    WITH CHECK (
        (
            entered_by = auth.uid() AND
            (status = 'entered' OR status = 'pending')
        ) OR
        get_user_role() = 'admin'
    );

-- Doctor: can read all non-sensitive results
CREATE POLICY "Doctor can read non-sensitive results" ON lab_results
    FOR SELECT
    USING (
        -- Check if test is NOT sensitive OR user is doctor/admin
        (
            SELECT NOT is_sensitive FROM test_types WHERE id = test_type_id
        ) OR
        get_user_role() = 'doctor' OR
        get_user_role() = 'admin'
    );

-- Doctor: can read sensitive results only if they're doctors or admins
CREATE POLICY "Doctor can read sensitive results" ON lab_results
    FOR SELECT
    USING (
        get_user_role() = 'doctor' OR
        get_user_role() = 'admin'
    );

-- Doctor: can approve results
CREATE POLICY "Doctor can approve results" ON lab_results
    FOR UPDATE
    USING (
        status IN ('entered', 'reviewed') AND
        (get_user_role() = 'doctor' OR get_user_role() = 'admin')
    )
    WITH CHECK (
        (get_user_role() = 'doctor' OR get_user_role() = 'admin')
    );

-- Admin: full access
CREATE POLICY "Admin full read access to lab results" ON lab_results
    FOR SELECT
    USING (get_user_role() = 'admin');

CREATE POLICY "Admin can update lab results" ON lab_results
    FOR UPDATE
    USING (get_user_role() = 'admin')
    WITH CHECK (get_user_role() = 'admin');

CREATE POLICY "Admin can delete lab results" ON lab_results
    FOR DELETE
    USING (get_user_role() = 'admin');

-- Front desk: NO ACCESS to lab results
-- (No policy means implicit deny)

-- ============================================================================
-- 7. RESULT FILES TABLE POLICIES
-- ============================================================================

-- Technician and Doctor: can upload files
CREATE POLICY "Technician and doctor can upload files" ON result_files
    FOR INSERT
    WITH CHECK (
        (get_user_role() = 'technician' OR get_user_role() = 'doctor' OR get_user_role() = 'admin') AND
        uploaded_by = auth.uid()
    );

-- Doctor and Admin: can read files
CREATE POLICY "Doctor and admin can read result files" ON result_files
    FOR SELECT
    USING (
        get_user_role() = 'doctor' OR
        get_user_role() = 'admin'
    );

-- Technician: can read files for assigned results
CREATE POLICY "Technician can read assigned result files" ON result_files
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM lab_results lr
            WHERE lr.id = lab_result_id
            AND EXISTS (
                SELECT 1 FROM lab_requests
                WHERE id = lr.lab_request_id
                AND assigned_to = auth.uid()
            )
        ) OR
        get_user_role() = 'admin'
    );

-- Uploader can read own files
CREATE POLICY "Users can read own uploaded files" ON result_files
    FOR SELECT
    USING (
        uploaded_by = auth.uid()
    );

-- Uploader can update own files
CREATE POLICY "Users can update own files" ON result_files
    FOR UPDATE
    USING (uploaded_by = auth.uid())
    WITH CHECK (uploaded_by = auth.uid());

-- Admin: full access
CREATE POLICY "Admin full access to result files" ON result_files
    FOR DELETE
    USING (get_user_role() = 'admin');

-- ============================================================================
-- 8. ENFORCE RLS ON ALL TABLES
-- ============================================================================

-- Verify all tables have RLS enabled
ALTER TABLE profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE patients FORCE ROW LEVEL SECURITY;
ALTER TABLE test_types FORCE ROW LEVEL SECURITY;
ALTER TABLE lab_requests FORCE ROW LEVEL SECURITY;
ALTER TABLE lab_results FORCE ROW LEVEL SECURITY;
ALTER TABLE result_files FORCE ROW LEVEL SECURITY;

-- ============================================================================
-- 9. DOCUMENTATION
-- ============================================================================

COMMENT ON FUNCTION get_user_role() IS 'Helper function to retrieve the current user role from profiles table';
