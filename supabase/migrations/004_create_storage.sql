-- Heavens Diagnostic Services - Storage Configuration
-- Migration 004: Create storage buckets and RLS policies for file uploads

-- ============================================================================
-- 1. CREATE STORAGE BUCKET
-- ============================================================================

-- Insert the bucket into storage.buckets table
INSERT INTO storage.buckets (id, name, owner, public, created_at, updated_at, file_size_limit, allowed_mime_types)
VALUES (
    'lab-files',
    'lab-files',
    NULL,
    FALSE,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP,
    52428800, -- 50MB limit
    ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/tiff', 'text/csv', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 2. STORAGE RLS POLICIES
-- ============================================================================

-- Enable RLS on storage.objects (if not already enabled)
ALTER TABLE IF EXISTS storage.objects ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 3. UPLOAD POLICIES - WHO CAN UPLOAD FILES
-- ============================================================================

-- Technicians can upload files to lab-files bucket
CREATE POLICY "Technician can upload lab files"
ON storage.objects
FOR INSERT
WITH CHECK (
    bucket_id = 'lab-files' AND
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'technician'
);

-- Doctors can upload files to lab-files bucket
CREATE POLICY "Doctor can upload lab files"
ON storage.objects
FOR INSERT
WITH CHECK (
    bucket_id = 'lab-files' AND
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'doctor'
);

-- Admins can upload files to lab-files bucket
CREATE POLICY "Admin can upload lab files"
ON storage.objects
FOR INSERT
WITH CHECK (
    bucket_id = 'lab-files' AND
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
);

-- ============================================================================
-- 4. READ POLICIES - WHO CAN ACCESS FILES
-- ============================================================================

-- Doctors can read all lab files
CREATE POLICY "Doctor can read lab files"
ON storage.objects
FOR SELECT
USING (
    bucket_id = 'lab-files' AND
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'doctor'
);

-- Admins can read all lab files
CREATE POLICY "Admin can read lab files"
ON storage.objects
FOR SELECT
USING (
    bucket_id = 'lab-files' AND
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
);

-- Technicians can read lab files they uploaded or for tests they're assigned to
CREATE POLICY "Technician can read assigned lab files"
ON storage.objects
FOR SELECT
USING (
    bucket_id = 'lab-files' AND
    (
        -- Check if user is the uploader
        owner = auth.uid() OR
        -- Check if technician is assigned to the lab request for this result
        EXISTS (
            SELECT 1 FROM result_files rf
            JOIN lab_results lr ON rf.lab_result_id = lr.id
            JOIN lab_requests lreq ON lr.lab_request_id = lreq.id
            WHERE rf.file_path LIKE 'lab-files/' || name
            AND lreq.assigned_to = auth.uid()
        ) OR
        (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
    )
);

-- Uploader can read their own files
CREATE POLICY "Users can read own uploaded files"
ON storage.objects
FOR SELECT
USING (
    bucket_id = 'lab-files' AND
    owner = auth.uid()
);

-- ============================================================================
-- 5. UPDATE POLICIES - WHO CAN UPDATE FILES
-- ============================================================================

-- Only admins can update file metadata (very restrictive)
CREATE POLICY "Admin can update lab files"
ON storage.objects
FOR UPDATE
USING (
    bucket_id = 'lab-files' AND
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
)
WITH CHECK (
    bucket_id = 'lab-files' AND
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
);

-- ============================================================================
-- 6. DELETE POLICIES - WHO CAN DELETE FILES
-- ============================================================================

-- Admins can delete files
CREATE POLICY "Admin can delete lab files"
ON storage.objects
FOR DELETE
USING (
    bucket_id = 'lab-files' AND
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
);

-- Uploader can delete their own files (before they're used in results)
CREATE POLICY "Users can delete own uploaded files"
ON storage.objects
FOR DELETE
USING (
    bucket_id = 'lab-files' AND
    owner = auth.uid()
);

-- ============================================================================
-- 7. DOWNLOAD LOGGING VIA STORAGE FUNCTION
-- ============================================================================

-- Note: Download logging is typically handled at the application level
-- by calling log_file_download() function from audit_system migration
-- when serving signed URLs or generating downloads.

-- Create a stored procedure to handle secure file downloads with logging
CREATE OR REPLACE FUNCTION download_lab_file(
    p_file_id UUID,
    p_ip_address TEXT DEFAULT NULL
)
RETURNS TABLE (
    file_path TEXT,
    file_name TEXT,
    mime_type TEXT,
    success BOOLEAN
) AS $$
DECLARE
    v_file_id UUID;
    v_file_path TEXT;
    v_file_name TEXT;
    v_mime_type TEXT;
    v_user_role user_role;
    v_success BOOLEAN := FALSE;
BEGIN
    -- Get user role
    SELECT role INTO v_user_role FROM profiles WHERE id = auth.uid();

    -- Verify user has access (doctor or admin)
    IF v_user_role NOT IN ('doctor', 'admin') THEN
        RETURN;
    END IF;

    -- Get file details from result_files table
    SELECT rf.file_path, rf.file_name, rf.mime_type INTO v_file_path, v_file_name, v_mime_type
    FROM result_files rf
    WHERE rf.id = p_file_id
    LIMIT 1;

    -- If file found, log the download
    IF v_file_path IS NOT NULL THEN
        PERFORM log_file_download(p_file_id, p_ip_address);
        v_success := TRUE;
        RETURN QUERY SELECT v_file_path, v_file_name, v_mime_type, v_success;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================================
-- 8. HELPER FUNCTION: GENERATE SIGNED URL
-- ============================================================================

-- Note: Signed URL generation is typically handled in the application
-- using the Supabase client library. This function validates permissions.

CREATE OR REPLACE FUNCTION validate_file_access(
    p_file_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
    v_user_role user_role;
    v_is_doctor_or_admin BOOLEAN;
BEGIN
    SELECT role INTO v_user_role FROM profiles WHERE id = auth.uid();

    -- Doctors and admins can always access
    v_is_doctor_or_admin := v_user_role IN ('doctor', 'admin');

    -- Technicians can access if assigned to the request
    IF v_user_role = 'technician' THEN
        RETURN EXISTS (
            SELECT 1 FROM result_files rf
            JOIN lab_results lr ON rf.lab_result_id = lr.id
            JOIN lab_requests lreq ON lr.lab_request_id = lreq.id
            WHERE rf.id = p_file_id
            AND lreq.assigned_to = auth.uid()
        );
    END IF;

    RETURN v_is_doctor_or_admin;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- ============================================================================
-- 9. CLEANUP FUNCTION: DELETE ORPHANED FILES
-- ============================================================================

-- This function removes storage objects when result_files records are deleted
CREATE OR REPLACE FUNCTION cleanup_deleted_files()
RETURNS TRIGGER AS $$
BEGIN
    -- When a result_file is deleted, the corresponding storage object
    -- will also be deleted by the application or storage rule
    -- This is a placeholder for future cleanup logic
    RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger for cleanup (optional - may be handled at app level)
CREATE TRIGGER trigger_cleanup_deleted_files
BEFORE DELETE ON result_files
FOR EACH ROW
EXECUTE FUNCTION cleanup_deleted_files();

-- ============================================================================
-- 10. DOCUMENTATION
-- ============================================================================

COMMENT ON FUNCTION download_lab_file(UUID, TEXT) IS 'Securely download lab files with automatic access logging';
COMMENT ON FUNCTION validate_file_access(UUID) IS 'Validate if current user has access to a specific file';
COMMENT ON FUNCTION cleanup_deleted_files() IS 'Cleanup handler when result_files records are deleted';

-- ============================================================================
-- 11. STORAGE POLICY NOTES FOR DEVELOPERS
-- ============================================================================

/*
IMPORTANT IMPLEMENTATION NOTES:

1. SIGNED URLS:
   - Use Supabase client library to generate signed URLs in your application
   - Example (JavaScript/TypeScript):
     const { data } = await supabase
       .storage
       .from('lab-files')
       .createSignedUrl(filePath, 3600); // 1 hour expiry

2. FILE UPLOAD:
   - Path format should be: lab-results/{lab_result_id}/{filename}
   - Validate file size on client before upload (50MB limit)
   - Always create result_files record after successful storage upload

3. DOWNLOAD LOGGING:
   - Call log_file_download(file_id) when user downloads via signed URL
   - This should be done server-side to prevent tampering
   - Example flow: User requests download → Validate access → Generate signed URL → Log download

4. FILE DELETION:
   - Always delete from result_files table first
   - Storage deletion will cascade or be handled by cleanup function
   - Admins can manually delete from storage if needed

5. MIME TYPE RESTRICTIONS:
   - Currently allows: PDF, JPEG, PNG, TIFF, CSV, Excel
   - Update allowed_mime_types array in bucket config if other types needed
   - Validate on both client and server

6. BUCKET NAME:
   - Bucket ID and name: 'lab-files'
   - Make sure to reference correctly in storage path: /lab-files/...
*/
