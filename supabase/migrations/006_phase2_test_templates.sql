-- Migration: Phase 2 - Test Templates System
-- Description: Add test templates and template fields to auto-load field definitions for each test type
-- This enables clinicians to select a test and have all fields, units, and reference ranges auto-populate

-- ============================================================================
-- 1. CREATE test_templates TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS test_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  test_type_id uuid NOT NULL UNIQUE REFERENCES test_types(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamp DEFAULT now()
);

COMMENT ON TABLE test_templates IS 'Template definitions for each test type with standard fields and reference ranges';
COMMENT ON COLUMN test_templates.test_type_id IS 'One-to-one relationship with test_types (one template per test type)';
COMMENT ON COLUMN test_templates.name IS 'Display name for the template (e.g., "Full Blood Count")';

-- ============================================================================
-- 2. CREATE test_template_fields TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS test_template_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES test_templates(id) ON DELETE CASCADE,
  field_name text NOT NULL,
  unit text,
  normal_min numeric,
  normal_max numeric,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamp DEFAULT now()
);

COMMENT ON TABLE test_template_fields IS 'Field definitions for each test template with units and normal reference ranges';
COMMENT ON COLUMN test_template_fields.template_id IS 'Foreign key to test_templates';
COMMENT ON COLUMN test_template_fields.field_name IS 'Field name (e.g., "WBC", "Hemoglobin")';
COMMENT ON COLUMN test_template_fields.unit IS 'Unit of measurement (e.g., "x10^9/L", "g/dL")';
COMMENT ON COLUMN test_template_fields.normal_min IS 'Lower bound of normal reference range';
COMMENT ON COLUMN test_template_fields.normal_max IS 'Upper bound of normal reference range';
COMMENT ON COLUMN test_template_fields.display_order IS 'Order in which fields are displayed in UI';

-- Create index on template_id and display_order for efficient querying
CREATE INDEX IF NOT EXISTS idx_test_template_fields_template_display ON test_template_fields(template_id, display_order);

-- ============================================================================
-- 3. ENABLE ROW LEVEL SECURITY (RLS)
-- ============================================================================
ALTER TABLE test_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE test_template_fields ENABLE ROW LEVEL SECURITY;

-- RLS Policy: All authenticated users can SELECT
CREATE POLICY "Allow authenticated users to read test templates"
ON test_templates FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Allow authenticated users to read test template fields"
ON test_template_fields FOR SELECT
TO authenticated
USING (true);

-- RLS Policy: Only admins can INSERT/UPDATE/DELETE on test_templates
CREATE POLICY "Allow only admins to insert test templates"
ON test_templates FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND get_user_role() = 'admin'
  )
);

CREATE POLICY "Allow only admins to update test templates"
ON test_templates FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND get_user_role() = 'admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND get_user_role() = 'admin'
  )
);

CREATE POLICY "Allow only admins to delete test templates"
ON test_templates FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND get_user_role() = 'admin'
  )
);

-- RLS Policy: Only admins can INSERT/UPDATE/DELETE on test_template_fields
CREATE POLICY "Allow only admins to insert test template fields"
ON test_template_fields FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND get_user_role() = 'admin'
  )
);

CREATE POLICY "Allow only admins to update test template fields"
ON test_template_fields FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND get_user_role() = 'admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND get_user_role() = 'admin'
  )
);

CREATE POLICY "Allow only admins to delete test template fields"
ON test_template_fields FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND get_user_role() = 'admin'
  )
);

-- ============================================================================
-- 4. CREATE auto_detect_abnormal() TRIGGER FUNCTION
-- ============================================================================
CREATE OR REPLACE FUNCTION auto_detect_abnormal()
RETURNS TRIGGER AS $$
BEGIN
  -- Only set is_abnormal if we have numeric value and at least one reference range boundary
  IF NEW.value IS NOT NULL AND (NEW.normal_min IS NOT NULL OR NEW.normal_max IS NOT NULL) THEN
    BEGIN
      -- Attempt to cast value to numeric
      DECLARE
        numeric_value numeric;
      BEGIN
        numeric_value := NEW.value::numeric;

        -- Check if value is below minimum
        IF NEW.normal_min IS NOT NULL AND numeric_value < NEW.normal_min THEN
          NEW.is_abnormal := true;
        -- Check if value is above maximum
        ELSIF NEW.normal_max IS NOT NULL AND numeric_value > NEW.normal_max THEN
          NEW.is_abnormal := true;
        -- Value is within normal range
        ELSE
          NEW.is_abnormal := false;
        END IF;
      EXCEPTION
        WHEN OTHERS THEN
          -- If cast fails, value is non-numeric (e.g., qualitative result)
          -- Leave is_abnormal as-is or set to false if null
          IF NEW.is_abnormal IS NULL THEN
            NEW.is_abnormal := false;
          END IF;
      END;
    END;
  ELSIF NEW.is_abnormal IS NULL THEN
    -- No numeric comparison possible; default to false
    NEW.is_abnormal := false;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION auto_detect_abnormal() IS 'Automatically detects if a test result is abnormal based on reference ranges';

-- Create trigger on test_results for auto_detect_abnormal
DROP TRIGGER IF EXISTS trigger_auto_detect_abnormal ON test_results;
CREATE TRIGGER trigger_auto_detect_abnormal
BEFORE INSERT OR UPDATE ON test_results
FOR EACH ROW
EXECUTE FUNCTION auto_detect_abnormal();

-- ============================================================================
-- 5. SEED DATA - TEST TEMPLATES AND FIELDS
-- ============================================================================

-- ============================================================================
-- 5.1 Full Blood Count (FBC / Hematology)
-- ============================================================================
INSERT INTO test_templates (test_type_id, name)
SELECT id, name FROM test_types WHERE name = 'Full Blood Count'
ON CONFLICT (test_type_id) DO NOTHING;

INSERT INTO test_template_fields (template_id, field_name, unit, normal_min, normal_max, display_order)
SELECT tt.id, 'WBC', 'x10^9/L', 4.0, 11.0, 1
FROM test_templates tt
JOIN test_types t ON tt.test_type_id = t.id
WHERE t.name = 'Full Blood Count'
ON CONFLICT DO NOTHING;

INSERT INTO test_template_fields (template_id, field_name, unit, normal_min, normal_max, display_order)
SELECT tt.id, 'RBC', 'x10^12/L', 4.5, 6.5, 2
FROM test_templates tt
JOIN test_types t ON tt.test_type_id = t.id
WHERE t.name = 'Full Blood Count'
ON CONFLICT DO NOTHING;

INSERT INTO test_template_fields (template_id, field_name, unit, normal_min, normal_max, display_order)
SELECT tt.id, 'Hemoglobin', 'g/dL', 12.0, 17.5, 3
FROM test_templates tt
JOIN test_types t ON tt.test_type_id = t.id
WHERE t.name = 'Full Blood Count'
ON CONFLICT DO NOTHING;

INSERT INTO test_template_fields (template_id, field_name, unit, normal_min, normal_max, display_order)
SELECT tt.id, 'Hematocrit', '%', 36.0, 54.0, 4
FROM test_templates tt
JOIN test_types t ON tt.test_type_id = t.id
WHERE t.name = 'Full Blood Count'
ON CONFLICT DO NOTHING;

INSERT INTO test_template_fields (template_id, field_name, unit, normal_min, normal_max, display_order)
SELECT tt.id, 'MCV', 'fL', 80.0, 100.0, 5
FROM test_templates tt
JOIN test_types t ON tt.test_type_id = t.id
WHERE t.name = 'Full Blood Count'
ON CONFLICT DO NOTHING;

INSERT INTO test_template_fields (template_id, field_name, unit, normal_min, normal_max, display_order)
SELECT tt.id, 'MCH', 'pg', 27.0, 33.0, 6
FROM test_templates tt
JOIN test_types t ON tt.test_type_id = t.id
WHERE t.name = 'Full Blood Count'
ON CONFLICT DO NOTHING;

INSERT INTO test_template_fields (template_id, field_name, unit, normal_min, normal_max, display_order)
SELECT tt.id, 'MCHC', 'g/dL', 32.0, 36.0, 7
FROM test_templates tt
JOIN test_types t ON tt.test_type_id = t.id
WHERE t.name = 'Full Blood Count'
ON CONFLICT DO NOTHING;

INSERT INTO test_template_fields (template_id, field_name, unit, normal_min, normal_max, display_order)
SELECT tt.id, 'Platelets', 'x10^9/L', 150.0, 400.0, 8
FROM test_templates tt
JOIN test_types t ON tt.test_type_id = t.id
WHERE t.name = 'Full Blood Count'
ON CONFLICT DO NOTHING;

INSERT INTO test_template_fields (template_id, field_name, unit, normal_min, normal_max, display_order)
SELECT tt.id, 'Neutrophils', '%', 40.0, 70.0, 9
FROM test_templates tt
JOIN test_types t ON tt.test_type_id = t.id
WHERE t.name = 'Full Blood Count'
ON CONFLICT DO NOTHING;

INSERT INTO test_template_fields (template_id, field_name, unit, normal_min, normal_max, display_order)
SELECT tt.id, 'Lymphocytes', '%', 20.0, 40.0, 10
FROM test_templates tt
JOIN test_types t ON tt.test_type_id = t.id
WHERE t.name = 'Full Blood Count'
ON CONFLICT DO NOTHING;

INSERT INTO test_template_fields (template_id, field_name, unit, normal_min, normal_max, display_order)
SELECT tt.id, 'Monocytes', '%', 2.0, 8.0, 11
FROM test_templates tt
JOIN test_types t ON tt.test_type_id = t.id
WHERE t.name = 'Full Blood Count'
ON CONFLICT DO NOTHING;

INSERT INTO test_template_fields (template_id, field_name, unit, normal_min, normal_max, display_order)
SELECT tt.id, 'Eosinophils', '%', 1.0, 4.0, 12
FROM test_templates tt
JOIN test_types t ON tt.test_type_id = t.id
WHERE t.name = 'Full Blood Count'
ON CONFLICT DO NOTHING;

INSERT INTO test_template_fields (template_id, field_name, unit, normal_min, normal_max, display_order)
SELECT tt.id, 'Basophils', '%', 0.0, 1.0, 13
FROM test_templates tt
JOIN test_types t ON tt.test_type_id = t.id
WHERE t.name = 'Full Blood Count'
ON CONFLICT DO NOTHING;

INSERT INTO test_template_fields (template_id, field_name, unit, normal_min, normal_max, display_order)
SELECT tt.id, 'ESR', 'mm/hr', 0.0, 20.0, 14
FROM test_templates tt
JOIN test_types t ON tt.test_type_id = t.id
WHERE t.name = 'Full Blood Count'
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 5.2 Malaria Parasite (Parasitology)
-- ============================================================================
INSERT INTO test_templates (test_type_id, name)
SELECT id, name FROM test_types WHERE name = 'Malaria Parasite'
ON CONFLICT (test_type_id) DO NOTHING;

INSERT INTO test_template_fields (template_id, field_name, unit, normal_min, normal_max, display_order)
SELECT tt.id, 'Malaria Parasite', NULL, NULL, NULL, 1
FROM test_templates tt
JOIN test_types t ON tt.test_type_id = t.id
WHERE t.name = 'Malaria Parasite'
ON CONFLICT DO NOTHING;

INSERT INTO test_template_fields (template_id, field_name, unit, normal_min, normal_max, display_order)
SELECT tt.id, 'Parasite Species', NULL, NULL, NULL, 2
FROM test_templates tt
JOIN test_types t ON tt.test_type_id = t.id
WHERE t.name = 'Malaria Parasite'
ON CONFLICT DO NOTHING;

INSERT INTO test_template_fields (template_id, field_name, unit, normal_min, normal_max, display_order)
SELECT tt.id, 'Parasite Density', '/uL', NULL, NULL, 3
FROM test_templates tt
JOIN test_types t ON tt.test_type_id = t.id
WHERE t.name = 'Malaria Parasite'
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 5.3 Urinalysis
-- ============================================================================
INSERT INTO test_templates (test_type_id, name)
SELECT id, name FROM test_types WHERE name = 'Urinalysis'
ON CONFLICT (test_type_id) DO NOTHING;

INSERT INTO test_template_fields (template_id, field_name, unit, normal_min, normal_max, display_order)
SELECT tt.id, 'Color', NULL, NULL, NULL, 1
FROM test_templates tt
JOIN test_types t ON tt.test_type_id = t.id
WHERE t.name = 'Urinalysis'
ON CONFLICT DO NOTHING;

INSERT INTO test_template_fields (template_id, field_name, unit, normal_min, normal_max, display_order)
SELECT tt.id, 'Appearance', NULL, NULL, NULL, 2
FROM test_templates tt
JOIN test_types t ON tt.test_type_id = t.id
WHERE t.name = 'Urinalysis'
ON CONFLICT DO NOTHING;

INSERT INTO test_template_fields (template_id, field_name, unit, normal_min, normal_max, display_order)
SELECT tt.id, 'pH', NULL, 4.5, 8.0, 3
FROM test_templates tt
JOIN test_types t ON tt.test_type_id = t.id
WHERE t.name = 'Urinalysis'
ON CONFLICT DO NOTHING;

INSERT INTO test_template_fields (template_id, field_name, unit, normal_min, normal_max, display_order)
SELECT tt.id, 'Specific Gravity', NULL, 1.005, 1.030, 4
FROM test_templates tt
JOIN test_types t ON tt.test_type_id = t.id
WHERE t.name = 'Urinalysis'
ON CONFLICT DO NOTHING;

INSERT INTO test_template_fields (template_id, field_name, unit, normal_min, normal_max, display_order)
SELECT tt.id, 'Protein', NULL, NULL, NULL, 5
FROM test_templates tt
JOIN test_types t ON tt.test_type_id = t.id
WHERE t.name = 'Urinalysis'
ON CONFLICT DO NOTHING;

INSERT INTO test_template_fields (template_id, field_name, unit, normal_min, normal_max, display_order)
SELECT tt.id, 'Glucose', NULL, NULL, NULL, 6
FROM test_templates tt
JOIN test_types t ON tt.test_type_id = t.id
WHERE t.name = 'Urinalysis'
ON CONFLICT DO NOTHING;

INSERT INTO test_template_fields (template_id, field_name, unit, normal_min, normal_max, display_order)
SELECT tt.id, 'Blood', NULL, NULL, NULL, 7
FROM test_templates tt
JOIN test_types t ON tt.test_type_id = t.id
WHERE t.name = 'Urinalysis'
ON CONFLICT DO NOTHING;

INSERT INTO test_template_fields (template_id, field_name, unit, normal_min, normal_max, display_order)
SELECT tt.id, 'Ketones', NULL, NULL, NULL, 8
FROM test_templates tt
JOIN test_types t ON tt.test_type_id = t.id
WHERE t.name = 'Urinalysis'
ON CONFLICT DO NOTHING;

INSERT INTO test_template_fields (template_id, field_name, unit, normal_min, normal_max, display_order)
SELECT tt.id, 'Bilirubin', NULL, NULL, NULL, 9
FROM test_templates tt
JOIN test_types t ON tt.test_type_id = t.id
WHERE t.name = 'Urinalysis'
ON CONFLICT DO NOTHING;

INSERT INTO test_template_fields (template_id, field_name, unit, normal_min, normal_max, display_order)
SELECT tt.id, 'Urobilinogen', 'mg/dL', 0.1, 1.0, 10
FROM test_templates tt
JOIN test_types t ON tt.test_type_id = t.id
WHERE t.name = 'Urinalysis'
ON CONFLICT DO NOTHING;

INSERT INTO test_template_fields (template_id, field_name, unit, normal_min, normal_max, display_order)
SELECT tt.id, 'Nitrite', NULL, NULL, NULL, 11
FROM test_templates tt
JOIN test_types t ON tt.test_type_id = t.id
WHERE t.name = 'Urinalysis'
ON CONFLICT DO NOTHING;

INSERT INTO test_template_fields (template_id, field_name, unit, normal_min, normal_max, display_order)
SELECT tt.id, 'Leukocytes', NULL, NULL, NULL, 12
FROM test_templates tt
JOIN test_types t ON tt.test_type_id = t.id
WHERE t.name = 'Urinalysis'
ON CONFLICT DO NOTHING;

INSERT INTO test_template_fields (template_id, field_name, unit, normal_min, normal_max, display_order)
SELECT tt.id, 'WBC (Microscopy)', '/hpf', 0, 5, 13
FROM test_templates tt
JOIN test_types t ON tt.test_type_id = t.id
WHERE t.name = 'Urinalysis'
ON CONFLICT DO NOTHING;

INSERT INTO test_template_fields (template_id, field_name, unit, normal_min, normal_max, display_order)
SELECT tt.id, 'RBC (Microscopy)', '/hpf', 0, 2, 14
FROM test_templates tt
JOIN test_types t ON tt.test_type_id = t.id
WHERE t.name = 'Urinalysis'
ON CONFLICT DO NOTHING;

INSERT INTO test_template_fields (template_id, field_name, unit, normal_min, normal_max, display_order)
SELECT tt.id, 'Epithelial Cells', '/hpf', NULL, NULL, 15
FROM test_templates tt
JOIN test_types t ON tt.test_type_id = t.id
WHERE t.name = 'Urinalysis'
ON CONFLICT DO NOTHING;

INSERT INTO test_template_fields (template_id, field_name, unit, normal_min, normal_max, display_order)
SELECT tt.id, 'Casts', '/lpf', NULL, NULL, 16
FROM test_templates tt
JOIN test_types t ON tt.test_type_id = t.id
WHERE t.name = 'Urinalysis'
ON CONFLICT DO NOTHING;

INSERT INTO test_template_fields (template_id, field_name, unit, normal_min, normal_max, display_order)
SELECT tt.id, 'Crystals', NULL, NULL, NULL, 17
FROM test_templates tt
JOIN test_types t ON tt.test_type_id = t.id
WHERE t.name = 'Urinalysis'
ON CONFLICT DO NOTHING;

INSERT INTO test_template_fields (template_id, field_name, unit, normal_min, normal_max, display_order)
SELECT tt.id, 'Bacteria', NULL, NULL, NULL, 18
FROM test_templates tt
JOIN test_types t ON tt.test_type_id = t.id
WHERE t.name = 'Urinalysis'
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 5.4 Liver Function Test (LFT / Biochemistry)
-- ============================================================================
INSERT INTO test_templates (test_type_id, name)
SELECT id, name FROM test_types WHERE name = 'Liver Function Test'
ON CONFLICT (test_type_id) DO NOTHING;

INSERT INTO test_template_fields (template_id, field_name, unit, normal_min, normal_max, display_order)
SELECT tt.id, 'Total Bilirubin', 'mg/dL', 0.1, 1.2, 1
FROM test_templates tt
JOIN test_types t ON tt.test_type_id = t.id
WHERE t.name = 'Liver Function Test'
ON CONFLICT DO NOTHING;

INSERT INTO test_template_fields (template_id, field_name, unit, normal_min, normal_max, display_order)
SELECT tt.id, 'Direct Bilirubin', 'mg/dL', 0.0, 0.3, 2
FROM test_templates tt
JOIN test_types t ON tt.test_type_id = t.id
WHERE t.name = 'Liver Function Test'
ON CONFLICT DO NOTHING;

INSERT INTO test_template_fields (template_id, field_name, unit, normal_min, normal_max, display_order)
SELECT tt.id, 'Indirect Bilirubin', 'mg/dL', 0.1, 0.9, 3
FROM test_templates tt
JOIN test_types t ON tt.test_type_id = t.id
WHERE t.name = 'Liver Function Test'
ON CONFLICT DO NOTHING;

INSERT INTO test_template_fields (template_id, field_name, unit, normal_min, normal_max, display_order)
SELECT tt.id, 'AST', 'U/L', 5.0, 40.0, 4
FROM test_templates tt
JOIN test_types t ON tt.test_type_id = t.id
WHERE t.name = 'Liver Function Test'
ON CONFLICT DO NOTHING;

INSERT INTO test_template_fields (template_id, field_name, unit, normal_min, normal_max, display_order)
SELECT tt.id, 'ALT', 'U/L', 7.0, 56.0, 5
FROM test_templates tt
JOIN test_types t ON tt.test_type_id = t.id
WHERE t.name = 'Liver Function Test'
ON CONFLICT DO NOTHING;

INSERT INTO test_template_fields (template_id, field_name, unit, normal_min, normal_max, display_order)
SELECT tt.id, 'ALP', 'U/L', 44.0, 147.0, 6
FROM test_templates tt
JOIN test_types t ON tt.test_type_id = t.id
WHERE t.name = 'Liver Function Test'
ON CONFLICT DO NOTHING;

INSERT INTO test_template_fields (template_id, field_name, unit, normal_min, normal_max, display_order)
SELECT tt.id, 'GGT', 'U/L', 9.0, 48.0, 7
FROM test_templates tt
JOIN test_types t ON tt.test_type_id = t.id
WHERE t.name = 'Liver Function Test'
ON CONFLICT DO NOTHING;

INSERT INTO test_template_fields (template_id, field_name, unit, normal_min, normal_max, display_order)
SELECT tt.id, 'Total Protein', 'g/dL', 6.0, 8.3, 8
FROM test_templates tt
JOIN test_types t ON tt.test_type_id = t.id
WHERE t.name = 'Liver Function Test'
ON CONFLICT DO NOTHING;

INSERT INTO test_template_fields (template_id, field_name, unit, normal_min, normal_max, display_order)
SELECT tt.id, 'Albumin', 'g/dL', 3.5, 5.5, 9
FROM test_templates tt
JOIN test_types t ON tt.test_type_id = t.id
WHERE t.name = 'Liver Function Test'
ON CONFLICT DO NOTHING;

INSERT INTO test_template_fields (template_id, field_name, unit, normal_min, normal_max, display_order)
SELECT tt.id, 'Globulin', 'g/dL', 2.0, 3.5, 10
FROM test_templates tt
JOIN test_types t ON tt.test_type_id = t.id
WHERE t.name = 'Liver Function Test'
ON CONFLICT DO NOTHING;

INSERT INTO test_template_fields (template_id, field_name, unit, normal_min, normal_max, display_order)
SELECT tt.id, 'A/G Ratio', NULL, 1.0, 2.5, 11
FROM test_templates tt
JOIN test_types t ON tt.test_type_id = t.id
WHERE t.name = 'Liver Function Test'
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 5.5 Kidney Function Test
-- ============================================================================
INSERT INTO test_templates (test_type_id, name)
SELECT id, name FROM test_types WHERE name = 'Kidney Function Test'
ON CONFLICT (test_type_id) DO NOTHING;

INSERT INTO test_template_fields (template_id, field_name, unit, normal_min, normal_max, display_order)
SELECT tt.id, 'Urea', 'mg/dL', 7.0, 20.0, 1
FROM test_templates tt
JOIN test_types t ON tt.test_type_id = t.id
WHERE t.name = 'Kidney Function Test'
ON CONFLICT DO NOTHING;

INSERT INTO test_template_fields (template_id, field_name, unit, normal_min, normal_max, display_order)
SELECT tt.id, 'Creatinine', 'mg/dL', 0.7, 1.3, 2
FROM test_templates tt
JOIN test_types t ON tt.test_type_id = t.id
WHERE t.name = 'Kidney Function Test'
ON CONFLICT DO NOTHING;

INSERT INTO test_template_fields (template_id, field_name, unit, normal_min, normal_max, display_order)
SELECT tt.id, 'BUN', 'mg/dL', 7.0, 20.0, 3
FROM test_templates tt
JOIN test_types t ON tt.test_type_id = t.id
WHERE t.name = 'Kidney Function Test'
ON CONFLICT DO NOTHING;

INSERT INTO test_template_fields (template_id, field_name, unit, normal_min, normal_max, display_order)
SELECT tt.id, 'Uric Acid', 'mg/dL', 3.5, 7.2, 4
FROM test_templates tt
JOIN test_types t ON tt.test_type_id = t.id
WHERE t.name = 'Kidney Function Test'
ON CONFLICT DO NOTHING;

INSERT INTO test_template_fields (template_id, field_name, unit, normal_min, normal_max, display_order)
SELECT tt.id, 'Sodium', 'mEq/L', 136.0, 145.0, 5
FROM test_templates tt
JOIN test_types t ON tt.test_type_id = t.id
WHERE t.name = 'Kidney Function Test'
ON CONFLICT DO NOTHING;

INSERT INTO test_template_fields (template_id, field_name, unit, normal_min, normal_max, display_order)
SELECT tt.id, 'Potassium', 'mEq/L', 3.5, 5.0, 6
FROM test_templates tt
JOIN test_types t ON tt.test_type_id = t.id
WHERE t.name = 'Kidney Function Test'
ON CONFLICT DO NOTHING;

INSERT INTO test_template_fields (template_id, field_name, unit, normal_min, normal_max, display_order)
SELECT tt.id, 'Chloride', 'mEq/L', 98.0, 106.0, 7
FROM test_templates tt
JOIN test_types t ON tt.test_type_id = t.id
WHERE t.name = 'Kidney Function Test'
ON CONFLICT DO NOTHING;

INSERT INTO test_template_fields (template_id, field_name, unit, normal_min, normal_max, display_order)
SELECT tt.id, 'Bicarbonate', 'mEq/L', 22.0, 29.0, 8
FROM test_templates tt
JOIN test_types t ON tt.test_type_id = t.id
WHERE t.name = 'Kidney Function Test'
ON CONFLICT DO NOTHING;

INSERT INTO test_template_fields (template_id, field_name, unit, normal_min, normal_max, display_order)
SELECT tt.id, 'eGFR', 'mL/min/1.73m2', 90.0, NULL, 9
FROM test_templates tt
JOIN test_types t ON tt.test_type_id = t.id
WHERE t.name = 'Kidney Function Test'
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 5.6 Blood Sugar (Biochemistry)
-- ============================================================================
INSERT INTO test_templates (test_type_id, name)
SELECT id, name FROM test_types WHERE name = 'Blood Sugar'
ON CONFLICT (test_type_id) DO NOTHING;

INSERT INTO test_template_fields (template_id, field_name, unit, normal_min, normal_max, display_order)
SELECT tt.id, 'Fasting Blood Sugar', 'mg/dL', 70.0, 100.0, 1
FROM test_templates tt
JOIN test_types t ON tt.test_type_id = t.id
WHERE t.name = 'Blood Sugar'
ON CONFLICT DO NOTHING;

INSERT INTO test_template_fields (template_id, field_name, unit, normal_min, normal_max, display_order)
SELECT tt.id, 'Random Blood Sugar', 'mg/dL', 70.0, 140.0, 2
FROM test_templates tt
JOIN test_types t ON tt.test_type_id = t.id
WHERE t.name = 'Blood Sugar'
ON CONFLICT DO NOTHING;

INSERT INTO test_template_fields (template_id, field_name, unit, normal_min, normal_max, display_order)
SELECT tt.id, 'HbA1c', '%', 4.0, 5.6, 3
FROM test_templates tt
JOIN test_types t ON tt.test_type_id = t.id
WHERE t.name = 'Blood Sugar'
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 5.7 HIV Screening (Serology - SENSITIVE)
-- ============================================================================
INSERT INTO test_templates (test_type_id, name)
SELECT id, name FROM test_types WHERE name = 'HIV Screening'
ON CONFLICT (test_type_id) DO NOTHING;

INSERT INTO test_template_fields (template_id, field_name, unit, normal_min, normal_max, display_order)
SELECT tt.id, 'HIV 1/2 Antibody', NULL, NULL, NULL, 1
FROM test_templates tt
JOIN test_types t ON tt.test_type_id = t.id
WHERE t.name = 'HIV Screening'
ON CONFLICT DO NOTHING;

INSERT INTO test_template_fields (template_id, field_name, unit, normal_min, normal_max, display_order)
SELECT tt.id, 'Confirmatory Test', NULL, NULL, NULL, 2
FROM test_templates tt
JOIN test_types t ON tt.test_type_id = t.id
WHERE t.name = 'HIV Screening'
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 5.8 Hepatitis B (Serology - SENSITIVE)
-- ============================================================================
INSERT INTO test_templates (test_type_id, name)
SELECT id, name FROM test_types WHERE name = 'Hepatitis B'
ON CONFLICT (test_type_id) DO NOTHING;

INSERT INTO test_template_fields (template_id, field_name, unit, normal_min, normal_max, display_order)
SELECT tt.id, 'HBsAg', NULL, NULL, NULL, 1
FROM test_templates tt
JOIN test_types t ON tt.test_type_id = t.id
WHERE t.name = 'Hepatitis B'
ON CONFLICT DO NOTHING;

INSERT INTO test_template_fields (template_id, field_name, unit, normal_min, normal_max, display_order)
SELECT tt.id, 'HBsAb', 'mIU/mL', 10.0, NULL, 2
FROM test_templates tt
JOIN test_types t ON tt.test_type_id = t.id
WHERE t.name = 'Hepatitis B'
ON CONFLICT DO NOTHING;

INSERT INTO test_template_fields (template_id, field_name, unit, normal_min, normal_max, display_order)
SELECT tt.id, 'HBeAg', NULL, NULL, NULL, 3
FROM test_templates tt
JOIN test_types t ON tt.test_type_id = t.id
WHERE t.name = 'Hepatitis B'
ON CONFLICT DO NOTHING;

INSERT INTO test_template_fields (template_id, field_name, unit, normal_min, normal_max, display_order)
SELECT tt.id, 'Anti-HBc', NULL, NULL, NULL, 4
FROM test_templates tt
JOIN test_types t ON tt.test_type_id = t.id
WHERE t.name = 'Hepatitis B'
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 5.9 Pregnancy Test (Immunology)
-- ============================================================================
INSERT INTO test_templates (test_type_id, name)
SELECT id, name FROM test_types WHERE name = 'Pregnancy Test'
ON CONFLICT (test_type_id) DO NOTHING;

INSERT INTO test_template_fields (template_id, field_name, unit, normal_min, normal_max, display_order)
SELECT tt.id, 'Beta-hCG (Qualitative)', NULL, NULL, NULL, 1
FROM test_templates tt
JOIN test_types t ON tt.test_type_id = t.id
WHERE t.name = 'Pregnancy Test'
ON CONFLICT DO NOTHING;

INSERT INTO test_template_fields (template_id, field_name, unit, normal_min, normal_max, display_order)
SELECT tt.id, 'Beta-hCG (Quantitative)', 'mIU/mL', NULL, NULL, 2
FROM test_templates tt
JOIN test_types t ON tt.test_type_id = t.id
WHERE t.name = 'Pregnancy Test'
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 5.10 Widal Test (Serology)
-- ============================================================================
INSERT INTO test_templates (test_type_id, name)
SELECT id, name FROM test_types WHERE name = 'Widal Test'
ON CONFLICT (test_type_id) DO NOTHING;

INSERT INTO test_template_fields (template_id, field_name, unit, normal_min, normal_max, display_order)
SELECT tt.id, 'S. typhi O', NULL, NULL, NULL, 1
FROM test_templates tt
JOIN test_types t ON tt.test_type_id = t.id
WHERE t.name = 'Widal Test'
ON CONFLICT DO NOTHING;

INSERT INTO test_template_fields (template_id, field_name, unit, normal_min, normal_max, display_order)
SELECT tt.id, 'S. typhi H', NULL, NULL, NULL, 2
FROM test_templates tt
JOIN test_types t ON tt.test_type_id = t.id
WHERE t.name = 'Widal Test'
ON CONFLICT DO NOTHING;

INSERT INTO test_template_fields (template_id, field_name, unit, normal_min, normal_max, display_order)
SELECT tt.id, 'S. paratyphi AO', NULL, NULL, NULL, 3
FROM test_templates tt
JOIN test_types t ON tt.test_type_id = t.id
WHERE t.name = 'Widal Test'
ON CONFLICT DO NOTHING;

INSERT INTO test_template_fields (template_id, field_name, unit, normal_min, normal_max, display_order)
SELECT tt.id, 'S. paratyphi AH', NULL, NULL, NULL, 4
FROM test_templates tt
JOIN test_types t ON tt.test_type_id = t.id
WHERE t.name = 'Widal Test'
ON CONFLICT DO NOTHING;

INSERT INTO test_template_fields (template_id, field_name, unit, normal_min, normal_max, display_order)
SELECT tt.id, 'S. paratyphi BO', NULL, NULL, NULL, 5
FROM test_templates tt
JOIN test_types t ON tt.test_type_id = t.id
WHERE t.name = 'Widal Test'
ON CONFLICT DO NOTHING;

INSERT INTO test_template_fields (template_id, field_name, unit, normal_min, normal_max, display_order)
SELECT tt.id, 'S. paratyphi BH', NULL, NULL, NULL, 6
FROM test_templates tt
JOIN test_types t ON tt.test_type_id = t.id
WHERE t.name = 'Widal Test'
ON CONFLICT DO NOTHING;
