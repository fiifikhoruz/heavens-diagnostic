# Heavens Diagnostic Services - Supabase Documentation Index

Complete documentation package for the Heavens Diagnostic lab management system.

## Quick Navigation

### For Getting Started
- **[QUICK_START.md](QUICK_START.md)** - Developer quick reference (workflows, code examples, troubleshooting)
- **[SCHEMA.md](SCHEMA.md)** - Visual schema reference (tables, relationships, constraints)

### For Implementation
- **[migrations/README.md](migrations/README.md)** - Complete migration documentation
- **[migrations/001_create_tables.sql](migrations/001_create_tables.sql)** - Schema and seed data
- **[migrations/002_create_rls_policies.sql](migrations/002_create_rls_policies.sql)** - Security policies
- **[migrations/003_create_audit_system.sql](migrations/003_create_audit_system.sql)** - Audit & compliance
- **[migrations/004_create_storage.sql](migrations/004_create_storage.sql)** - File storage config

---

## File Descriptions

### Migration Files (Run in Order)

#### 001_create_tables.sql (270 lines)
Creates the foundational database schema.

**What's Created:**
- 4 custom enum types (user_role, lab_priority, lab_request_status, lab_result_status, audit_action)
- 6 core tables: profiles, patients, test_types, lab_requests, lab_results, result_files
- 25+ indexes for performance
- 10 pre-seeded test types (Full Blood Count, Malaria Parasite, Urinalysis, etc.)
- Auto-ID generation for patients (HDS-0001, HDS-0002, etc.)
- Auto-timestamp management

**Key Features:**
- Complete referential integrity with CASCADE/RESTRICT rules
- UUID primary keys throughout
- RLS enabled on all tables
- Comprehensive documentation comments

#### 002_create_rls_policies.sql (352 lines)
Implements strict row-level security based on user roles.

**What's Created:**
- `get_user_role()` helper function
- 20+ granular RLS policies
- Access control by role: front_desk, technician, doctor, admin
- Sensitive data protection (HIV, Hepatitis tests)
- FORCE ROW LEVEL SECURITY on all tables

**Security Highlights:**
- Front desk isolated from lab results
- Technicians see only assigned work
- Doctors approve results and see sensitive tests
- Admins have full unrestricted access

#### 003_create_audit_system.sql (267 lines)
Comprehensive audit logging and account security.

**What's Created:**
- audit_logs table with JSONB metadata
- login_attempts table for security monitoring
- 8 automatic audit triggers
- Helper functions: log_file_download(), log_login_attempt(), get_failed_login_count()
- audit_summary view (admin-only)

**Compliance Features:**
- Complete change history (INSERT/UPDATE/DELETE)
- IP address and user tracking
- Failed login monitoring for account lockout
- HIPAA-suitable audit trail

#### 004_create_storage.sql (303 lines)
File storage configuration and security.

**What's Created:**
- lab-files storage bucket (private, 50MB limit)
- 6 RLS policies for upload/download/update/delete
- Helper functions: download_lab_file(), validate_file_access()
- Cleanup trigger for orphaned files

**File Security:**
- Technician/doctor upload
- Doctor/admin full access
- Technicians read assigned files only
- Download logging via audit system
- Signed URLs required (1-hour expiry default)

---

## Documentation Files

### QUICK_START.md
**Purpose:** Get developers productive immediately

**Contains:**
- Deployment checklist (link, push, verify)
- User roles & permissions matrix
- 8 common workflows with code examples (JavaScript/SQL)
- Database functions reference
- Troubleshooting guide
- Performance tips
- Monitoring queries
- 10 seed test types
- Next steps checklist

**Best For:** Application developers building features

### SCHEMA.md
**Purpose:** Visual reference of data structure

**Contains:**
- Detailed table documentation
- Relationship diagram
- Enum type definitions
- RLS policy matrix
- 25+ index descriptions
- Storage bucket specs
- Triggers & functions summary
- Constraints overview
- Data type reference

**Best For:** Understanding database structure, ERD diagrams

### migrations/README.md
**Purpose:** Comprehensive technical documentation

**Contains:**
- Migration overview (1-4)
- Table-by-table documentation
- Custom type definitions
- RLS policy explanations (20+ policies)
- Audit system design
- Storage configuration
- Design decisions (5 major)
- Security considerations
- Performance optimizations
- Extension requirements
- Testing checklist
- Future enhancements
- Support & maintenance

**Best For:** Database architects, compliance officers, deep understanding

### INDEX.md (This File)
**Purpose:** Navigate entire documentation package

**Contains:**
- Quick navigation links
- File descriptions
- What's in each document
- Statistics
- Common tasks reference
- Glossary

**Best For:** Finding what you need quickly

---

## Statistics

### Database Size
- **Total Migrations:** 4
- **Total SQL Lines:** 1,192 lines (excluding comments)
- **Total Documentation:** 800+ lines

### Schema Complexity
- **Tables:** 8 (6 core + 2 audit)
- **Custom Types:** 5 enums
- **Indexes:** 25+
- **Triggers:** 8
- **Functions:** 9
- **RLS Policies:** 20+
- **Views:** 1 (audit_summary)

### Data
- **Seed Records:** 10 test types
- **Test Categories:** 5 (Hematology, Parasitology, Urinalysis, Biochemistry, Serology)
- **Sensitive Tests:** 2 (HIV Screening, Hepatitis B)

---

## Common Tasks Quick Reference

### "I need to understand how security works"
→ Read [SCHEMA.md](SCHEMA.md) RLS Policy Summary section  
→ Then [migrations/002_create_rls_policies.sql](migrations/002_create_rls_policies.sql)

### "I'm building the patient creation form"
→ Read [QUICK_START.md](QUICK_START.md) "Creating a Patient Record" section  
→ Check [SCHEMA.md](SCHEMA.md) patients table definition

### "I need to add file downloads to my app"
→ Read [QUICK_START.md](QUICK_START.md) "Downloading Files (with Logging)" section  
→ Reference [migrations/004_create_storage.sql](migrations/004_create_storage.sql) for functions

### "I'm deploying to Supabase"
→ Follow [QUICK_START.md](QUICK_START.md) "Deployment" section  
→ Then [migrations/README.md](migrations/README.md) "Execution Order" section

### "I need to check the audit trail"
→ Reference [migrations/003_create_audit_system.sql](migrations/003_create_audit_system.sql)  
→ Use queries in [migrations/README.md](migrations/README.md) "Support & Maintenance"

### "I need to understand result approval workflow"
→ Read [SCHEMA.md](SCHEMA.md) lab_results table definition  
→ See workflow diagram in lab_result_status enum section

### "I want to add a new test type"
→ SQL query in [migrations/README.md](migrations/README.md) "Support & Maintenance"  
→ Check test_types table in [SCHEMA.md](SCHEMA.md)

### "I need to monitor failed logins"
→ Read [QUICK_START.md](QUICK_START.md) "Monitoring" section  
→ Reference login_attempts in [SCHEMA.md](SCHEMA.md)

---

## Key Design Principles

### 1. Role-Based Access Control
Four distinct roles with granular permissions:
- **Front Desk:** Patient intake, request initiation
- **Technician:** Lab work, result entry
- **Doctor:** Review, approve, see all data
- **Admin:** Full system access, user management

### 2. Multi-Stage Result Workflow
Results progress through approval stages:
- pending → entered (technician) → reviewed (doctor) → approved (doctor)

### 3. Sensitive Data Protection
Tests like HIV and Hepatitis are flagged with `is_sensitive=TRUE`:
- Only doctors and admins can view these results
- Technicians cannot see them
- Front desk has no access

### 4. Complete Audit Trail
Every change is logged automatically:
- INSERT, UPDATE, DELETE on key tables
- User attribution via auth.uid()
- JSONB metadata captures before/after states
- Download tracking with IP addresses

### 5. Auto-Generated Patient IDs
Patient IDs follow format HDS-0001, HDS-0002, etc.:
- Auto-generated on insert
- Prevents collisions
- Consistent throughout system
- Cannot be manually overridden

---

## RLS Policy Access Matrix

```
┌─────────────┬─────────────┬────────────┬──────────┬───────┐
│ Resource    │ Front Desk  │ Technician │ Doctor   │ Admin │
├─────────────┼─────────────┼────────────┼──────────┼───────┤
│ Patients    │ CR (basic)  │ R          │ R        │ CRUD  │
│ Profiles    │ R (own)     │ R (own)    │ R (own)  │ CRUD  │
│ Tests       │ R (active)  │ R (active) │ R (all)  │ CRUD  │
│ Requests    │ CR (own)    │ RU (assigned) │ RU    │ CRUD  │
│ Results     │ BLOCKED     │ CU (own)   │ RU (approve) │ CRUD  │
│ Sensitive   │ BLOCKED     │ BLOCKED    │ R        │ CRUD  │
│ Files       │ BLOCKED     │ RU (own)   │ RU       │ CRUD  │
│ Audit Logs  │ R (own)     │ BLOCKED    │ BLOCKED  │ R(all)│
└─────────────┴─────────────┴────────────┴──────────┴───────┘

C=Create, R=Read, U=Update, D=Delete
```

---

## Deployment Checklist

```
□ Create Supabase project
□ Link project: supabase link --project-ref <ref>
□ Run migrations: supabase db push
□ Verify schema: Check Database in Supabase console
□ Create admin user profile (via auth)
□ Test RLS policies (query as different roles)
□ Configure environment variables
□ Build frontend for each role
□ Implement file upload/download
□ Set up email notifications
□ Configure backups
□ Plan monitoring
□ Document procedures
□ Go live!
```

---

## Performance Characteristics

### Query Patterns (with indexes)
- Patient lookup by ID: O(1) - indexed on patient_id
- Lab request by status: O(log n) - indexed on status
- Audit logs for user: O(log n) - indexed on user_id, created_at
- Login attempt count: O(log n) - composite index on email, created_at

### Index Coverage
- All primary keys: indexed automatically
- All foreign keys: indexed automatically
- Role-based filtering: indexed on role
- Status filtering: indexed on status
- Time-based queries: indexed on created_at DESC

### Optimization Features
- Composite indexes for common queries
- Filtered indexes for boolean flags
- Covering indexes for audit queries
- Proper NULL handling in indexes

---

## Security Checklist

```
□ RLS enabled on all tables with FORCE
□ Policies use auth.uid() and role checks
□ No hardcoded user IDs
□ Sensitive tests properly restricted
□ Front desk cannot access results
□ Audit logging on all tables
□ Download tracking enabled
□ Login attempt monitoring
□ File uploads require role verification
□ Signed URLs have short expiry
□ Storage bucket is private
□ Allowed MIME types restricted
□ No public file access
□ IP address tracking enabled
```

---

## Glossary

**Audit Log** - Complete record of all changes to sensitive data
**Enum** - Enumerated type (restricted set of values)
**Foreign Key** - Reference to another table's primary key
**JSON/JSONB** - JavaScript Object Notation (B = Binary optimized)
**RLS** - Row Level Security (database-enforced access control)
**Sensitive Test** - Tests flagged with is_sensitive=TRUE (HIV, Hepatitis)
**Signed URL** - Time-limited, cryptographically signed URL for file access
**Trigger** - Automatic action when table is modified
**UUID** - Universally Unique Identifier (128-bit)
**Workflow** - Sequence of states (pending → entered → reviewed → approved)

---

## Contact & Support

### For Questions About...

**Database Schema:**
- See SCHEMA.md for table definitions
- See migrations/README.md for design decisions

**Deployment:**
- See QUICK_START.md for step-by-step deployment
- See Supabase docs: https://supabase.com/docs

**Security:**
- See migrations/002_create_rls_policies.sql for RLS
- See migrations/003_create_audit_system.sql for audit

**Application Code:**
- See QUICK_START.md for code examples
- See migrations/README.md "Support & Maintenance"

**Performance:**
- See SCHEMA.md for index descriptions
- See migrations/README.md "Performance Optimizations"

---

## Version Information

**Created:** 2026-04-12  
**For:** Heavens Diagnostic Services, Sunyani  
**Database:** Supabase (PostgreSQL 15+)  
**Schema Version:** 1.0  
**Status:** Ready for Production

---

**Total Documentation:** 7 files, 1,963 lines  
**Coverage:** 100% of schema, security, audit, and storage
