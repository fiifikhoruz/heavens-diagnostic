# Heavens Diagnostic Services - Supabase Migrations

Complete database schema and infrastructure for the Heavens Diagnostic Services medical laboratory management system.

## Migration Overview

### Migration 001: Create Tables (`001_create_tables.sql`)
**Status:** Core Schema Foundation | **Lines:** 270

Creates the foundational database structure with 6 main tables:

#### Tables Created:
- **profiles** - User profiles extending auth.users (front_desk, technician, doctor, admin)
- **patients** - Patient records with auto-generated HDS-XXXX IDs
- **test_types** - Laboratory test definitions (10 seed records)
- **lab_requests** - Lab test requests with priority and status tracking
- **lab_results** - Individual test results with multi-stage approval workflow
- **result_files** - Attachments for lab results (PDFs, images, etc.)

#### Custom Types:
- `user_role` - Enum for access control roles
- `lab_priority` - Enum for request urgency (routine, urgent, stat)
- `lab_request_status` - Enum for request lifecycle (pending → delivered)
- `lab_result_status` - Enum for result approval workflow (pending → approved)

#### Key Features:
- UUID primary keys with auto-generation
- Auto-incrementing patient IDs in format "HDS-0001"
- Comprehensive indexing for performance
- Foreign key constraints with CASCADE/RESTRICT rules
- Updated_at timestamps with automatic triggers
- 10 seed test types including sensitive tests (HIV, Hepatitis B)

**Sensitive Test Markers:**
- HIV Screening (is_sensitive = TRUE)
- Hepatitis B (is_sensitive = TRUE)

---

### Migration 002: Create RLS Policies (`002_create_rls_policies.sql`)
**Status:** Security Layer | **Lines:** 352

Implements strict Row Level Security based on user roles:

#### Helper Functions:
- `get_user_role()` - Retrieves current user's role from profiles

#### Access Control by Role:

**Front Desk:**
- Create patients and lab requests
- Read basic patient info
- No access to lab results

**Technician:**
- Read-only patient access
- View assigned lab requests
- Enter results for assigned tests only
- Cannot see sensitive test results

**Doctor:**
- Full read access to patients and requests
- Approve lab results
- Can see all test results including sensitive
- Can read and manage result files

**Admin:**
- Full unrestricted access to all tables
- Can manage users and test definitions
- Full audit log access

#### Sensitive Data Protection:
- Sensitive tests (HIV, Hepatitis) visible only to doctors and admins
- Front desk completely blocked from lab results
- Technicians cannot see sensitive test results

#### Policy Coverage:
- 20+ granular RLS policies
- Explicit deny-by-default approach
- Role-based access with auth.uid() checks
- FORCE ROW LEVEL SECURITY on all tables

---

### Migration 003: Create Audit System (`003_create_audit_system.sql`)
**Status:** Compliance & Security | **Lines:** 267

Comprehensive audit logging and account security tracking:

#### Tables:
- **audit_logs** - Complete change history (insert/update/delete/view/download)
- **login_attempts** - Failed login tracking for account lockout logic

#### Audit Features:
- Automatic trigger-based logging on: patients, lab_requests, lab_results, result_files
- Captures full before/after state in JSONB metadata
- IP address tracking
- Searchable by user, action, table, or record

#### Security Functions:
- `audit_log_changes()` - Automatic trigger function
- `log_file_download(file_id, ip)` - Explicit download logging
- `log_login_attempt(email, success, ip, user_agent)` - Authentication tracking
- `get_failed_login_count(email, minutes)` - Account lockout checks

#### Views:
- `audit_summary` - Aggregated audit data by user/action/date (admin-only)

#### Indexing:
- Performance indexes on user_id, action, table_name, created_at
- Optimized for security queries and compliance reports

---

### Migration 004: Create Storage (`004_create_storage.sql`)
**Status:** File Management | **Lines:** 303

Configures Supabase Storage for lab result files:

#### Storage Bucket:
- **Bucket Name:** lab-files
- **Privacy:** Private (RLS enforced)
- **Size Limit:** 50MB per file
- **Allowed Types:** PDF, JPEG, PNG, TIFF, CSV, Excel

#### Upload Access:
- Technicians: Can upload
- Doctors: Can upload
- Admins: Can upload

#### Download Access:
- Doctors: Full read access
- Admins: Full read access
- Technicians: Can read only for assigned lab requests
- All users: Can read their own uploads

#### Security Functions:
- `download_lab_file(file_id, ip)` - Validates access + logs download
- `validate_file_access(file_id)` - Permission check before signed URL
- `cleanup_deleted_files()` - Trigger for orphaned file cleanup

#### Implementation Notes:
- Signed URLs required for all downloads (generated in app code)
- Download logging via audit_logs table
- Path format: `lab-results/{lab_result_id}/{filename}`
- All deletions require admin role

---

## Database Statistics

| Aspect | Count |
|--------|-------|
| **Total Migrations** | 4 |
| **Total SQL Lines** | 1,192 |
| **Tables Created** | 6 core + 2 audit |
| **Custom Types** | 4 enums |
| **Indexes Created** | 25+ |
| **RLS Policies** | 20+ |
| **Triggers** | 8 |
| **Functions** | 9 |
| **Seed Records** | 10 test types |

---

## Execution Order

Migrations must be run in numeric order:

```bash
# Run all migrations in sequence
1. 001_create_tables.sql
2. 002_create_rls_policies.sql
3. 003_create_audit_system.sql
4. 004_create_storage.sql
```

### Using Supabase CLI:

```bash
# Navigate to project directory
cd /sessions/keen-bold-allen/heavens-diagnostic

# Run migrations (Supabase CLI handles ordering)
supabase db push
```

### Manual Execution:

```bash
# Using psql with Supabase connection string
psql $SUPABASE_DB_URL -f supabase/migrations/001_create_tables.sql
psql $SUPABASE_DB_URL -f supabase/migrations/002_create_rls_policies.sql
psql $SUPABASE_DB_URL -f supabase/migrations/003_create_audit_system.sql
psql $SUPABASE_DB_URL -f supabase/migrations/004_create_storage.sql
```

---

## Key Design Decisions

### 1. Role-Based Access Control
- Four distinct roles with granular permissions
- Sensitive data (HIV, Hepatitis) restricted to doctors/admins
- Front desk isolated from medical results for privacy

### 2. Multi-Stage Approval Workflow
Lab results pass through: pending → entered → reviewed → approved
- Technicians enter data
- Doctors review and approve
- Admin oversight of all changes

### 3. Audit Trail
- Complete history of all changes
- Login attempt tracking for security
- File download logging for compliance
- Suitable for regulatory requirements

### 4. Auto-Generated Patient IDs
- Format: HDS-0001, HDS-0002, etc.
- Generated on insert, stored for consistency
- Prevents ID gaps or collisions

### 5. Sensitive Test Flagging
- Tests marked with `is_sensitive` flag
- RLS policies enforce doctor-only viewing
- Metadata-based access control

---

## Security Considerations

### RLS Enforcement
- ✅ All tables have RLS enabled with FORCE
- ✅ No super-user bypass in policies
- ✅ Role validation at every access point
- ✅ auth.uid() checks prevent impersonation

### Data Protection
- ✅ Sensitive test results hidden from most users
- ✅ Audit logging captures all modifications
- ✅ File uploads require role verification
- ✅ Downloads logged with IP address

### Account Security
- ✅ Login attempt tracking
- ✅ Failed login counting for lockout logic
- ✅ IP address logging
- ✅ User agent tracking

### Compliance Features
- ✅ Complete audit trail (HIPAA-relevant)
- ✅ User action tracking
- ✅ Data change history with JSONB
- ✅ Secure file management with encryption

---

## Performance Optimizations

### Indexes Created:
- Primary key indexes (UUID)
- Foreign key indexes (patient_id, user_id, etc.)
- Filter indexes (role, status, is_sensitive)
- Composite indexes (user + action, email + date)
- Date indexes for time-range queries

### Query Patterns Optimized:
- Patient lookups by name, email, phone
- Lab request filtering by status/priority
- Audit log searches by user/date
- Login attempt checking for lockout

---

## Extension Requirements

The following PostgreSQL extensions are enabled:
- `uuid-ossp` - UUID generation functions

---

## Testing Checklist

After running migrations:

```sql
-- Verify tables exist
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public';

-- Check RLS is enabled
SELECT schemaname, tablename, rowsecurity 
FROM pg_tables WHERE tablename IN ('profiles', 'patients', 'lab_requests', 'lab_results');

-- Verify seed data
SELECT COUNT(*) FROM test_types;  -- Should be 10

-- Check policies
SELECT tablename, policyname FROM pg_policies;

-- Test patient ID generation
INSERT INTO patients (...) VALUES (...);
SELECT patient_id FROM patients LIMIT 1;  -- Should be HDS-0001, HDS-0002, etc.
```

---

## Future Considerations

### Potential Enhancements:
1. Notification system for result approvals
2. Backup and archival tables
3. Patient consent management
4. Bill/invoice tracking
5. Equipment/sample tracking
6. Quality assurance metrics
7. Statistical reporting views
8. Third-party lab integration

### Scalability:
- Table partitioning by date for large audit_logs table
- Read replicas for heavy analytical queries
- Archive tables for historical data retention

---

## Support & Maintenance

### Common Operations:

**Add a new test type:**
```sql
INSERT INTO test_types (name, category, description, turnaround_hours, price, is_sensitive, is_active)
VALUES ('Test Name', 'Category', 'Description', 24, 100.00, FALSE, TRUE);
```

**Create a new user profile:**
```sql
INSERT INTO profiles (id, full_name, role, phone)
VALUES (auth.uid(), 'Full Name', 'technician', '+233123456789');
```

**Check audit trail:**
```sql
SELECT user_id, action, table_name, created_at 
FROM audit_logs 
WHERE user_id = 'some-uuid' 
ORDER BY created_at DESC;
```

**Monitor failed logins:**
```sql
SELECT email, COUNT(*) as failed_attempts
FROM login_attempts
WHERE success = FALSE 
AND created_at > NOW() - INTERVAL '30 minutes'
GROUP BY email;
```

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-04-12 | Initial schema, RLS, audit system, storage |

---

**Created for Heavens Diagnostic Services, Sunyani**
