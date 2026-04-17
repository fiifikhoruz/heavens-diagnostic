-- Heavens Diagnostic Services - Initial Schema
-- Migration 001: Create tables, enums, and initial seed data

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- 1. ENUM TYPES
-- ============================================================================

-- User role enumeration
CREATE TYPE user_role AS ENUM ('front_desk', 'technician', 'doctor', 'admin');

-- Lab request priority
CREATE TYPE lab_priority AS ENUM ('routine', 'urgent', 'stat');

-- Lab request status
CREATE TYPE lab_request_status AS ENUM ('pending', 'in_progress', 'completed', 'approved', 'delivered');

-- Lab result status
CREATE TYPE lab_result_status AS ENUM ('pending', 'entered', 'reviewed', 'approved');

-- ============================================================================
-- 2. PROFILES TABLE (extends auth.users)
-- ============================================================================

CREATE TABLE profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    role user_role NOT NULL,
    phone TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Enable RLS on profiles
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Create index for role-based queries
CREATE INDEX idx_profiles_role ON profiles(role);

-- ============================================================================
-- 3. PATIENTS TABLE
-- ============================================================================

CREATE TABLE patients (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id TEXT NOT NULL UNIQUE,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    date_of_birth DATE NOT NULL,
    gender TEXT CHECK (gender IN ('Male', 'Female', 'Other')),
    phone TEXT,
    email TEXT,
    address TEXT,
    emergency_contact_name TEXT,
    emergency_contact_phone TEXT,
    blood_group TEXT CHECK (blood_group IN ('O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'Unknown')),
    allergies TEXT,
    created_by UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Enable RLS on patients
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;

-- Indexes for patient searches
CREATE INDEX idx_patients_patient_id ON patients(patient_id);
CREATE INDEX idx_patients_name ON patients(first_name, last_name);
CREATE INDEX idx_patients_email ON patients(email);
CREATE INDEX idx_patients_phone ON patients(phone);
CREATE INDEX idx_patients_created_by ON patients(created_by);

-- ============================================================================
-- 4. TEST TYPES TABLE
-- ============================================================================

CREATE TABLE test_types (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL UNIQUE,
    category TEXT NOT NULL,
    description TEXT,
    turnaround_hours INTEGER NOT NULL,
    price NUMERIC(10, 2) NOT NULL,
    is_sensitive BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Enable RLS on test_types
ALTER TABLE test_types ENABLE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX idx_test_types_category ON test_types(category);
CREATE INDEX idx_test_types_is_sensitive ON test_types(is_sensitive);
CREATE INDEX idx_test_types_is_active ON test_types(is_active);

-- ============================================================================
-- 5. LAB REQUESTS TABLE
-- ============================================================================

CREATE TABLE lab_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    requesting_doctor TEXT,
    clinical_notes TEXT,
    priority lab_priority NOT NULL DEFAULT 'routine',
    status lab_request_status NOT NULL DEFAULT 'pending',
    created_by UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
    assigned_to UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Enable RLS on lab_requests
ALTER TABLE lab_requests ENABLE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX idx_lab_requests_patient_id ON lab_requests(patient_id);
CREATE INDEX idx_lab_requests_status ON lab_requests(status);
CREATE INDEX idx_lab_requests_priority ON lab_requests(priority);
CREATE INDEX idx_lab_requests_assigned_to ON lab_requests(assigned_to);
CREATE INDEX idx_lab_requests_created_by ON lab_requests(created_by);
CREATE INDEX idx_lab_requests_created_at ON lab_requests(created_at);

-- ============================================================================
-- 6. LAB RESULTS TABLE
-- ============================================================================

CREATE TABLE lab_results (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lab_request_id UUID NOT NULL REFERENCES lab_requests(id) ON DELETE CASCADE,
    test_type_id UUID NOT NULL REFERENCES test_types(id) ON DELETE RESTRICT,
    result_value TEXT,
    result_unit TEXT,
    reference_range TEXT,
    is_abnormal BOOLEAN DEFAULT FALSE,
    notes TEXT,
    status lab_result_status NOT NULL DEFAULT 'pending',
    entered_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    reviewed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    approved_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    entered_at TIMESTAMP WITH TIME ZONE,
    reviewed_at TIMESTAMP WITH TIME ZONE,
    approved_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Enable RLS on lab_results
ALTER TABLE lab_results ENABLE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX idx_lab_results_lab_request_id ON lab_results(lab_request_id);
CREATE INDEX idx_lab_results_test_type_id ON lab_results(test_type_id);
CREATE INDEX idx_lab_results_status ON lab_results(status);
CREATE INDEX idx_lab_results_entered_by ON lab_results(entered_by);
CREATE INDEX idx_lab_results_reviewed_by ON lab_results(reviewed_by);
CREATE INDEX idx_lab_results_approved_by ON lab_results(approved_by);

-- ============================================================================
-- 7. RESULT FILES TABLE
-- ============================================================================

CREATE TABLE result_files (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lab_result_id UUID NOT NULL REFERENCES lab_results(id) ON DELETE CASCADE,
    file_path TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_size INTEGER,
    mime_type TEXT,
    uploaded_by UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Enable RLS on result_files
ALTER TABLE result_files ENABLE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX idx_result_files_lab_result_id ON result_files(lab_result_id);
CREATE INDEX idx_result_files_uploaded_by ON result_files(uploaded_by);

-- ============================================================================
-- 8. SEED TEST TYPES DATA
-- ============================================================================

INSERT INTO test_types (name, category, description, turnaround_hours, price, is_sensitive, is_active)
VALUES
    ('Full Blood Count', 'Hematology', 'Complete blood cell count and hemoglobin analysis', 4, 45.00, FALSE, TRUE),
    ('Malaria Parasite', 'Parasitology', 'Microscopy examination for malaria parasites', 4, 25.00, FALSE, TRUE),
    ('Urinalysis', 'Urinalysis', 'Complete urine test for protein, glucose, and bacteria', 4, 20.00, FALSE, TRUE),
    ('Liver Function Test', 'Biochemistry', 'AST, ALT, Bilirubin, and Albumin levels', 8, 75.00, FALSE, TRUE),
    ('Kidney Function Test', 'Biochemistry', 'Creatinine, BUN, and electrolyte analysis', 8, 65.00, FALSE, TRUE),
    ('Blood Sugar', 'Biochemistry', 'Fasting and random glucose levels', 2, 15.00, FALSE, TRUE),
    ('HIV Screening', 'Serology', 'Rapid HIV antibody test', 24, 50.00, TRUE, TRUE),
    ('Hepatitis B', 'Serology', 'HBsAg and HBsAb screening', 24, 60.00, TRUE, TRUE),
    ('Pregnancy Test', 'Immunology', 'Beta-hCG serum test', 2, 30.00, FALSE, TRUE),
    ('Widal Test', 'Serology', 'Typhoid and paratyphoid antibodies', 8, 35.00, FALSE, TRUE);

-- ============================================================================
-- 9. HELPER FUNCTION FOR AUTO-INCREMENTING PATIENT ID
-- ============================================================================

CREATE OR REPLACE FUNCTION generate_patient_id()
RETURNS TEXT AS $$
DECLARE
    new_id TEXT;
    next_sequence INTEGER;
BEGIN
    -- Get the count of existing patients and add 1
    next_sequence := (SELECT COUNT(*) + 1 FROM patients);
    new_id := 'HDS-' || LPAD(next_sequence::TEXT, 4, '0');
    RETURN new_id;
END;
$$ LANGUAGE plpgsql;

-- Create a trigger to auto-generate patient IDs
CREATE OR REPLACE FUNCTION set_patient_id()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.patient_id IS NULL THEN
        NEW.patient_id := generate_patient_id();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_set_patient_id
BEFORE INSERT ON patients
FOR EACH ROW
EXECUTE FUNCTION set_patient_id();

-- ============================================================================
-- 10. UPDATE TRIGGER FOR UPDATED_AT COLUMNS
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_profiles_updated_at BEFORE UPDATE ON profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_update_patients_updated_at BEFORE UPDATE ON patients
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_update_lab_requests_updated_at BEFORE UPDATE ON lab_requests
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 11. COMMENTS FOR DOCUMENTATION
-- ============================================================================

COMMENT ON TABLE profiles IS 'User profiles extending Supabase auth.users with role-based access control';
COMMENT ON TABLE patients IS 'Patient records with auto-generated HDS IDs and demographic information';
COMMENT ON TABLE test_types IS 'Laboratory test definitions with pricing and turnaround times';
COMMENT ON TABLE lab_requests IS 'Lab requests initiated by healthcare providers';
COMMENT ON TABLE lab_results IS 'Individual test results with multi-stage approval workflow';
COMMENT ON TABLE result_files IS 'Attached files for lab results (PDFs, images, etc.)';

COMMENT ON COLUMN profiles.role IS 'User role: front_desk, technician, doctor, or admin';
COMMENT ON COLUMN patients.patient_id IS 'Auto-generated unique identifier in format HDS-XXXX';
COMMENT ON COLUMN test_types.is_sensitive IS 'Flag for sensitive tests (HIV, Hepatitis) requiring stricter access control';
COMMENT ON COLUMN lab_requests.priority IS 'Priority level: routine, urgent, or stat';
COMMENT ON COLUMN lab_requests.status IS 'Request status: pending, in_progress, completed, approved, or delivered';
COMMENT ON COLUMN lab_results.status IS 'Result status: pending, entered, reviewed, or approved';
