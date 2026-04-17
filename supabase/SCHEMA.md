# Heavens Diagnostic Services - Database Schema Reference

Quick visual reference of all database tables and relationships.

## Core Tables

### profiles
Extends Supabase `auth.users` with role-based access control.

```
id (UUID, PK) ──→ auth.users.id (FK, CASCADE)
├── full_name (TEXT, NOT NULL)
├── role (user_role ENUM: front_desk, technician, doctor, admin)
├── phone (TEXT, nullable)
├── created_at (TIMESTAMP)
└── updated_at (TIMESTAMP)

Indexes: role
RLS: Enabled (users read own, admin reads all)
```

### patients
Patient demographics and contact information.

```
id (UUID, PK) - auto-generated
├── patient_id (TEXT, UNIQUE) ──→ auto-generated as HDS-0001, HDS-0002, etc.
├── first_name (TEXT, NOT NULL)
├── last_name (TEXT, NOT NULL)
├── date_of_birth (DATE, NOT NULL)
├── gender (TEXT: Male, Female, Other)
├── phone (TEXT, nullable)
├── email (TEXT, nullable)
├── address (TEXT, nullable)
├── emergency_contact_name (TEXT, nullable)
├── emergency_contact_phone (TEXT, nullable)
├── blood_group (TEXT: O+, O-, A+, A-, B+, B-, AB+, AB-, Unknown)
├── allergies (TEXT, nullable)
├── created_by (UUID, FK) ──→ profiles.id (RESTRICT)
├── created_at (TIMESTAMP)
└── updated_at (TIMESTAMP)

Indexes: patient_id, name, email, phone, created_by
RLS: Enabled (front_desk/tech read, doctor read, admin full)
Triggers: set_patient_id(), update_updated_at, audit_log_changes()
```

### test_types
Laboratory test definitions.

```
id (UUID, PK) - auto-generated
├── name (TEXT, NOT NULL, UNIQUE)
├── category (TEXT, NOT NULL) - e.g., "Hematology", "Biochemistry"
├── description (TEXT, nullable)
├── turnaround_hours (INTEGER, NOT NULL) - expected hours to complete
├── price (NUMERIC(10,2), NOT NULL)
├── is_sensitive (BOOLEAN, default: FALSE) - TRUE for HIV, Hepatitis, etc.
├── is_active (BOOLEAN, default: TRUE)
└── created_at (TIMESTAMP)

Indexes: category, is_sensitive, is_active
RLS: Enabled (authenticated read active, doctors read all, admin manage)
Seed Data: 10 test types pre-loaded

Sensitive Tests (is_sensitive=TRUE):
  - HIV Screening (24h, 50.00)
  - Hepatitis B (24h, 60.00)
```

### lab_requests
Lab test requests initiated by healthcare providers.

```
id (UUID, PK) - auto-generated
├── patient_id (UUID, FK) ──→ patients.id (CASCADE)
├── requesting_doctor (TEXT, nullable)
├── clinical_notes (TEXT, nullable)
├── priority (lab_priority ENUM: routine, urgent, stat)
├── status (lab_request_status ENUM: pending, in_progress, completed, approved, delivered)
├── created_by (UUID, FK) ──→ profiles.id (RESTRICT)
├── assigned_to (UUID, FK, nullable) ──→ profiles.id (SET NULL)
├── created_at (TIMESTAMP)
└── updated_at (TIMESTAMP)

Indexes: patient_id, status, priority, assigned_to, created_by, created_at
RLS: Enabled (front_desk create, tech read assigned, doctor full, admin full)
Triggers: update_updated_at, audit_log_changes()
```

### lab_results
Individual test results from submitted lab requests.

```
id (UUID, PK) - auto-generated
├── lab_request_id (UUID, FK) ──→ lab_requests.id (CASCADE)
├── test_type_id (UUID, FK) ──→ test_types.id (RESTRICT)
├── result_value (TEXT, nullable) - e.g., "7.5", "Positive", "95 mg/dL"
├── result_unit (TEXT, nullable) - e.g., "g/dL", "mm Hg"
├── reference_range (TEXT, nullable) - e.g., "12-16 g/dL"
├── is_abnormal (BOOLEAN, default: FALSE)
├── notes (TEXT, nullable)
├── status (lab_result_status ENUM: pending, entered, reviewed, approved)
├── entered_by (UUID, FK, nullable) ──→ profiles.id (SET NULL)
├── reviewed_by (UUID, FK, nullable) ──→ profiles.id (SET NULL)
├── approved_by (UUID, FK, nullable) ──→ profiles.id (SET NULL)
├── entered_at (TIMESTAMP, nullable)
├── reviewed_at (TIMESTAMP, nullable)
├── approved_at (TIMESTAMP, nullable)
└── created_at (TIMESTAMP)

Indexes: lab_request_id, test_type_id, status, entered_by, reviewed_by, approved_by
RLS: Enabled (tech write assigned only, doctor approve, admin full, front_desk NO ACCESS)
Triggers: audit_log_changes()

Approval Workflow:
  pending ──(tech enters)──→ entered ──(doctor reviews)──→ reviewed ──(doctor approves)──→ approved
```

### result_files
File attachments for lab results (PDFs, images, etc.).

```
id (UUID, PK) - auto-generated
├── lab_result_id (UUID, FK) ──→ lab_results.id (CASCADE)
├── file_path (TEXT, NOT NULL) - path in storage bucket, e.g., "lab-results/uuid/file.pdf"
├── file_name (TEXT, NOT NULL) - original filename
├── file_size (INTEGER, nullable) - size in bytes
├── mime_type (TEXT, nullable) - e.g., "application/pdf"
├── uploaded_by (UUID, FK, NOT NULL) ──→ profiles.id (RESTRICT)
└── created_at (TIMESTAMP)

Indexes: lab_result_id, uploaded_by
RLS: Enabled (tech/doctor/admin upload, doctor/admin read, tech read assigned, uploader read own)
Storage: lab-files bucket (private, 50MB limit)
Triggers: audit_log_changes()
```

---

## Audit & Security Tables

### audit_logs
Complete change history for compliance and security.

```
id (UUID, PK) - auto-generated
├── user_id (UUID, FK) ──→ profiles.id (CASCADE)
├── action (audit_action ENUM: view, create, update, delete, download)
├── table_name (TEXT, NOT NULL) - which table was affected
├── record_id (UUID, nullable) - which record in that table
├── metadata (JSONB, nullable) - full record state (before/after for updates)
├── ip_address (TEXT, nullable) - IP address of user
└── created_at (TIMESTAMP)

Indexes: user_id, action, table_name, record_id, created_at, user_action
RLS: Enabled (users read own, admins read all)

Audited Tables (auto-triggers):
  - patients (on INSERT, UPDATE, DELETE)
  - lab_requests (on INSERT, UPDATE, DELETE)
  - lab_results (on INSERT, UPDATE, DELETE)
  - result_files (on INSERT, UPDATE, DELETE)

Views:
  - audit_summary : Aggregated by user/action/date (admin-only)
```

### login_attempts
Login event tracking for account security.

```
id (UUID, PK) - auto-generated
├── email (TEXT, NOT NULL)
├── success (BOOLEAN, NOT NULL, default: FALSE)
├── ip_address (TEXT, nullable)
├── user_agent (TEXT, nullable)
└── created_at (TIMESTAMP)

Indexes: email, created_at, success, email+created_at
RLS: Enabled (admins read all, system insert)
Purpose: Account lockout detection, security monitoring
```

---

## Relationship Diagram

```
┌──────────────┐
│   auth.users │
└──────┬───────┘
       │ (references)
       │
┌──────▼──────────┐
│    profiles     │
└────┬─────────┬──┘
     │         │
     │         │
┌────▼─────┐   │
│ patients  │   │
└────┬──────┘   │
     │          │
     │      ┌───▼──────────────┐
     │      │   lab_requests   │
     │      └────┬──────┬──────┘
     │           │      │
     │           │      │ assigned_to
     │      ┌────▼──────▼──────┐
     │      │   lab_results    │
     │      └────┬──────┬──────┘
     │           │      │
     │      ┌────▼──────▼──────┐
     │      │  result_files    │
     │      └────────┬─────────┘
     │              │
     ├──────────────┤ (all tables referenced)
     │              │
┌────▼──────┬──────▼──────┐
│ audit_logs│login_attempts│
└───────────┴──────────────┘

test_types ──→ lab_results

profiles:
  - Admin, Doctor, Technician, Front Desk roles
  - Full RLS enforcement throughout
```

---

## Enum Types

### user_role
```sql
CREATE TYPE user_role AS ENUM (
    'front_desk',   -- Patient intake, request creation
    'technician',   -- Lab work, data entry
    'doctor',       -- Result review and approval
    'admin'         -- System administration
);
```

### lab_priority
```sql
CREATE TYPE lab_priority AS ENUM (
    'routine',      -- Standard processing
    'urgent',       -- High priority
    'stat'          -- Emergency, immediate
);
```

### lab_request_status
```sql
CREATE TYPE lab_request_status AS ENUM (
    'pending',      -- Awaiting lab work
    'in_progress',  -- Currently being tested
    'completed',    -- Testing finished
    'approved',     -- Doctor approved
    'delivered'     -- Results delivered to patient
);
```

### lab_result_status
```sql
CREATE TYPE lab_result_status AS ENUM (
    'pending',      -- Awaiting entry
    'entered',      -- Data entered, awaiting review
    'reviewed',     -- Doctor reviewed, awaiting approval
    'approved'      -- Approved and final
);
```

### audit_action
```sql
CREATE TYPE audit_action AS ENUM (
    'view',         -- Data viewed/read
    'create',       -- New record inserted
    'update',       -- Record modified
    'delete',       -- Record deleted
    'download'      -- File downloaded
);
```

---

## RLS Policy Summary

| Table | Front Desk | Technician | Doctor | Admin |
|-------|-----------|------------|--------|-------|
| **profiles** | R(own) | R(own) | R(own) | CRUD |
| **patients** | CR(basic) | R | R | CRUD |
| **test_types** | R(active) | R(active) | R(all) | CRUD |
| **lab_requests** | CR(own) | RU(assigned) | RU | CRUD |
| **lab_results** | ✗ | CU(assigned) | RU(approve) | CRUD |
| **result_files** | ✗ | RU(assigned) | RU | CRUD |
| **audit_logs** | R(own) | ✗ | ✗ | R(all) |
| **login_attempts** | ✗ | ✗ | ✗ | R(all) |

Legend: C=Create, R=Read, U=Update, D=Delete, ✗=No Access

---

## Key Indexes

**Performance Optimizations:**

- **Primary Key Indexes** (automatic):
  - All UUID PKs indexed for fast lookups

- **Foreign Key Indexes** (automatic):
  - patient_id → patients
  - lab_request_id → lab_requests
  - test_type_id → test_types
  - user_id → profiles

- **Filter Indexes**:
  - profiles.role (role-based queries)
  - test_types.is_sensitive (sensitive test filtering)
  - lab_requests.status (workflow filtering)
  - lab_results.status (result filtering)
  - login_attempts.success (security queries)

- **Composite Indexes**:
  - audit_logs(user_id, action)
  - lab_requests(patient_id, status)
  - login_attempts(email, created_at)

---

## Storage Bucket

### lab-files
```
Bucket Name: lab-files
Privacy: Private (RLS enforced)
Max File Size: 50MB
File Size Limit: 52,428,800 bytes

Allowed MIME Types:
  - application/pdf
  - image/jpeg
  - image/png
  - image/tiff
  - text/csv
  - application/vnd.ms-excel
  - application/vnd.openxmlformats-officedocument.spreadsheetml.sheet

Path Format: lab-results/{lab_result_id}/{filename}
Signed URL Expiry: 1 hour (configurable)
```

---

## Triggers & Functions

**Automatic Triggers:**
- `trigger_set_patient_id` - Auto-generate patient IDs
- `trigger_update_*_updated_at` - Update timestamps on modification
- `trigger_audit_*` - Log all changes to audit_logs

**Helper Functions:**
- `get_user_role()` - Retrieve current user's role
- `generate_patient_id()` - Generate HDS-XXXX format IDs
- `log_file_download()` - Log file downloads
- `log_login_attempt()` - Log authentication events
- `get_failed_login_count()` - Count failed login attempts
- `validate_file_access()` - Check file access permissions
- `download_lab_file()` - Secure file download with logging

---

## Constraints

**Referential Integrity:**
- profiles → auth.users (CASCADE on delete)
- patients → profiles (RESTRICT on delete - preserve history)
- lab_requests → patients (CASCADE on delete)
- lab_requests → profiles (RESTRICT on delete)
- lab_results → lab_requests (CASCADE on delete)
- lab_results → test_types (RESTRICT on delete)
- lab_results → profiles (SET NULL on delete)
- result_files → lab_results (CASCADE on delete)
- result_files → profiles (RESTRICT on delete)
- audit_logs → profiles (CASCADE on delete)

**Domain Constraints:**
- gender: Male, Female, Other
- blood_group: O+, O-, A+, A-, B+, B-, AB+, AB-, Unknown
- Enum types enforce valid values for roles and statuses

---

## Data Types

- **UUID**: All primary and foreign keys
- **TEXT**: Names, descriptions, notes
- **NUMERIC(10, 2)**: Prices (supports up to 99,999,999.99)
- **INTEGER**: File sizes, hours
- **BOOLEAN**: Flags (is_sensitive, is_abnormal, success)
- **DATE**: Date of birth
- **TIMESTAMP WITH TIME ZONE**: All timestamps (allows time zone info)
- **JSONB**: Audit metadata (efficient querying and indexing)
- **ENUM**: Roles, statuses, priorities

---

## Notes for Developers

1. **Always use auth.uid()** for current user checks
2. **RLS is enforced** - some queries may return empty if user lacks access
3. **Sensitive tests** have separate policies - check is_sensitive flag
4. **File operations** require signed URLs - generate server-side
5. **Audit logs** capture everything - plan retention policy
6. **Patient IDs** are auto-generated - never insert manually
7. **Timestamps** are auto-managed - don't set manually in most cases
8. **Foreign keys** use proper cascade rules - understand before deleting

---

Generated: 2026-04-12  
For: Heavens Diagnostic Services, Sunyani
