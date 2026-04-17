# Heavens Diagnostic Services - Deployment Checklist

Complete checklist for deploying Supabase migrations to production.

## Pre-Deployment (Complete Before Starting)

### Prerequisites
- [ ] Supabase account created
- [ ] Supabase project created
- [ ] Supabase CLI installed (`npm install -g supabase`)
- [ ] PostgreSQL client tools available (optional, for testing)
- [ ] Project directory path: `/sessions/keen-bold-allen/heavens-diagnostic`

### Documentation Review
- [ ] Read `supabase/INDEX.md` (overview)
- [ ] Read `supabase/QUICK_START.md` (deployment section)
- [ ] Read `supabase/migrations/README.md` (execution order)

### Team Alignment
- [ ] All team members aware of deployment
- [ ] Downtime window communicated (if needed)
- [ ] Backup plan discussed
- [ ] Rollback procedure documented

---

## Step 1: Prepare Project (5 minutes)

```bash
cd /sessions/keen-bold-allen/heavens-diagnostic
```

- [ ] Directory exists and is accessible
- [ ] `supabase/` folder contains all 4 migration files
- [ ] All SQL files are readable
- [ ] No unsaved changes in working directory

**Files to verify:**
- [ ] supabase/migrations/001_create_tables.sql (270 lines)
- [ ] supabase/migrations/002_create_rls_policies.sql (352 lines)
- [ ] supabase/migrations/003_create_audit_system.sql (267 lines)
- [ ] supabase/migrations/004_create_storage.sql (303 lines)

---

## Step 2: Link to Supabase (5 minutes)

```bash
supabase link --project-ref your-project-ref
```

- [ ] Project ref obtained from Supabase dashboard
- [ ] Authentication successful
- [ ] Project linked locally

**Verification:**
```bash
supabase projects list  # Should show your project
```

---

## Step 3: Run Migrations (10 minutes)

```bash
supabase db push
```

- [ ] Command executes without errors
- [ ] All 4 migrations run in order
- [ ] No migration failures
- [ ] Completion message displayed

**Watch for:**
- [ ] `001_create_tables.sql` completes successfully
- [ ] `002_create_rls_policies.sql` completes successfully
- [ ] `003_create_audit_system.sql` completes successfully
- [ ] `004_create_storage.sql` completes successfully

---

## Step 4: Verify Schema (15 minutes)

### Check Tables Exist
```sql
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;
```

- [ ] profiles ✓
- [ ] patients ✓
- [ ] test_types ✓
- [ ] lab_requests ✓
- [ ] lab_results ✓
- [ ] result_files ✓
- [ ] audit_logs ✓
- [ ] login_attempts ✓

### Check Enum Types Exist
```sql
SELECT typname FROM pg_type 
WHERE typkind = 'e' 
ORDER BY typname;
```

- [ ] audit_action ✓
- [ ] lab_priority ✓
- [ ] lab_request_status ✓
- [ ] lab_result_status ✓
- [ ] user_role ✓

### Check Seed Data
```sql
SELECT COUNT(*) FROM test_types;  -- Should return 10
```

- [ ] 10 test types seeded ✓
- [ ] HIV Screening exists (is_sensitive = TRUE) ✓
- [ ] Hepatitis B exists (is_sensitive = TRUE) ✓

### Check RLS Is Enabled
```sql
SELECT schemaname, tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
ORDER BY tablename;
```

- [ ] All tables have rowsecurity = TRUE ✓

### Check Indexes
```sql
SELECT schemaname, tablename, indexname 
FROM pg_indexes 
WHERE schemaname = 'public' 
ORDER BY tablename;
```

- [ ] 25+ indexes exist ✓
- [ ] Indexes on: profiles.role ✓
- [ ] Indexes on: patient lookups ✓
- [ ] Indexes on: status filters ✓

### Check Functions Exist
```sql
SELECT routine_name FROM information_schema.routines 
WHERE routine_schema = 'public' 
ORDER BY routine_name;
```

- [ ] get_user_role ✓
- [ ] generate_patient_id ✓
- [ ] set_patient_id ✓
- [ ] log_file_download ✓
- [ ] log_login_attempt ✓
- [ ] get_failed_login_count ✓
- [ ] validate_file_access ✓
- [ ] download_lab_file ✓
- [ ] audit_log_changes ✓

### Check Triggers
```sql
SELECT trigger_name FROM information_schema.triggers 
WHERE trigger_schema = 'public' 
ORDER BY trigger_name;
```

- [ ] trigger_set_patient_id ✓
- [ ] trigger_audit_patients ✓
- [ ] trigger_audit_lab_requests ✓
- [ ] trigger_audit_lab_results ✓
- [ ] trigger_audit_result_files ✓
- [ ] trigger_update_*_updated_at (4 triggers) ✓

### Check RLS Policies
```sql
SELECT schemaname, tablename, policyname 
FROM pg_policies 
WHERE schemaname = 'public' 
ORDER BY tablename, policyname;
```

- [ ] 20+ policies exist ✓
- [ ] Policies per role present ✓
- [ ] Sensitive test policies exist ✓

### Check Storage Bucket
In Supabase Dashboard → Storage:
- [ ] lab-files bucket exists ✓
- [ ] Bucket is private ✓
- [ ] File size limit is 50MB ✓
- [ ] Allowed MIME types configured ✓

---

## Step 5: Test RLS Policies (20 minutes)

### Create Test Users (In Supabase Auth)
- [ ] Admin user created (role: admin)
- [ ] Doctor user created (role: doctor)
- [ ] Technician user created (role: technician)
- [ ] Front desk user created (role: front_desk)

### Create Test Profiles
```sql
-- As Admin, insert profiles for each test user
INSERT INTO profiles (id, full_name, role, phone)
VALUES ('admin-uuid', 'Test Admin', 'admin', '+233123456789');
-- Repeat for other roles
```

- [ ] Admin profile created ✓
- [ ] Doctor profile created ✓
- [ ] Technician profile created ✓
- [ ] Front desk profile created ✓

### Test Patient Access
Switch to front desk user:
```sql
-- Should succeed (front desk can create)
INSERT INTO patients (first_name, last_name, date_of_birth, gender, created_by)
VALUES ('John', 'Doe', '1990-01-15', 'Male', auth.uid());
```

- [ ] Front desk can create patients ✓
- [ ] Front desk can read patients ✓

Switch to technician user:
```sql
-- Should succeed (technician can read)
SELECT COUNT(*) FROM patients;
```

- [ ] Technician can read patients ✓

Switch to front desk user (test negative):
```sql
-- Should fail or return empty (front desk cannot see results)
SELECT COUNT(*) FROM lab_results;
```

- [ ] Front desk cannot see results ✓

### Test Sensitive Tests
Switch to technician user:
```sql
-- Should not see sensitive tests
SELECT COUNT(*) FROM test_types WHERE is_sensitive = TRUE;
```

- [ ] Technician cannot see sensitive tests ✓

Switch to doctor user:
```sql
-- Should see all tests including sensitive
SELECT COUNT(*) FROM test_types WHERE is_sensitive = TRUE;  -- Should return 2
```

- [ ] Doctor can see sensitive tests ✓

---

## Step 6: Test Auto-Generated Patient IDs (5 minutes)

Create three patients as front desk:
```sql
INSERT INTO patients (first_name, last_name, date_of_birth, gender, created_by)
VALUES ('Jane', 'Smith', '1985-03-20', 'Female', auth.uid());
-- Repeat 2 more times with different data
```

- [ ] First patient_id = HDS-0001 ✓
- [ ] Second patient_id = HDS-0002 ✓
- [ ] Third patient_id = HDS-0003 ✓
- [ ] IDs are unique ✓

---

## Step 7: Test Audit Logging (5 minutes)

After creating patients, check audit logs as admin:
```sql
SELECT action, table_name, record_id FROM audit_logs 
ORDER BY created_at DESC LIMIT 10;
```

- [ ] Patient inserts logged ✓
- [ ] Action = 'create' ✓
- [ ] table_name = 'patients' ✓
- [ ] User attribution correct ✓

---

## Step 8: Test Login Attempt Tracking (5 minutes)

Create a helper to log attempts:
```sql
SELECT log_login_attempt(
  'test@example.com',
  true,
  '192.168.1.1',
  'Mozilla/5.0...'
);
```

Check logs:
```sql
SELECT email, success FROM login_attempts 
ORDER BY created_at DESC LIMIT 5;
```

- [ ] Login attempt logged ✓
- [ ] Email recorded ✓
- [ ] Success flag = true ✓
- [ ] IP address recorded ✓

---

## Step 9: Configure Environment Variables

Create `.env.local` or `.env` file with:

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

- [ ] Supabase URL obtained ✓
- [ ] Anon key obtained ✓
- [ ] Service role key obtained ✓
- [ ] Environment file created ✓

---

## Step 10: Document the Deployment

### Create Deployment Record
- [ ] Date of deployment recorded
- [ ] Time of deployment recorded
- [ ] All verification checks passed documented
- [ ] Any issues encountered documented
- [ ] Rollback not needed noted

### Update Team
- [ ] Team notified of successful deployment
- [ ] Access credentials distributed securely
- [ ] Documentation links shared
- [ ] Next steps communicated

---

## Step 11: Initialize Application Setup

### Create Initial Admin
- [ ] Admin user created in auth
- [ ] Admin profile created
- [ ] Admin can log in
- [ ] Admin has full access

### Create Test Data (Optional)
- [ ] Create test patient
- [ ] Create test lab request
- [ ] Create test lab result
- [ ] Upload test file
- [ ] Verify all workflows work

---

## Post-Deployment (24 hours after)

### Check System Health
```bash
# Monitor Supabase logs in dashboard
```

- [ ] No errors in logs
- [ ] No unusual activity
- [ ] RLS policies working correctly
- [ ] Audit logs accumulating normally

### Verify Backups
In Supabase Dashboard → Settings → Backups:
- [ ] Automated backups enabled
- [ ] Retention policy set
- [ ] First backup completed

### Set Up Monitoring
- [ ] Database performance alerts configured
- [ ] Storage usage alerts configured
- [ ] Failed login alerts configured
- [ ] Audit log alerts configured

---

## Rollback Plan (If Needed)

If issues occur after deployment:

### Option 1: Rollback Entire Database
1. Contact Supabase support
2. Restore from pre-deployment backup
3. Note: This loses any data created after deployment

### Option 2: Drop and Recreate (if recoverable)
```bash
# WARNING: Only if you have backups
supabase db reset  # Resets to latest migrations

# Or manually:
supabase db pull   # Pull latest state from remote
```

### Option 3: Partial Rollback
- Drop specific tables that are problematic
- Restore specific migrations
- Requires understanding of dependencies

**Rollback checklist:**
- [ ] Backup created before rollback
- [ ] Rollback command verified
- [ ] Rollback executed
- [ ] Data verification after rollback
- [ ] Team notified

---

## Sign-Off

### Deployment Manager
- [ ] Name: ________________
- [ ] Date: ________________
- [ ] Time: ________________
- [ ] Status: ✓ SUCCESSFUL / ✗ FAILED

### Database Architect
- [ ] Name: ________________
- [ ] Date: ________________
- [ ] Verified: ✓ YES / ✗ NO

### Team Lead
- [ ] Name: ________________
- [ ] Date: ________________
- [ ] Approved: ✓ YES / ✗ NO

---

## Troubleshooting

### Issue: "Migration failed with syntax error"
- [ ] Check migration file for typos
- [ ] Verify PostgreSQL syntax
- [ ] Check comment syntax in SQL
- [ ] Reference: migrations/README.md

### Issue: "RLS policies not working"
- [ ] Verify auth.uid() is set
- [ ] Check user has profile record
- [ ] Check profile.role is correct
- [ ] Reference: SCHEMA.md RLS Policy Summary

### Issue: "Patient IDs not auto-generating"
- [ ] Check trigger is enabled
- [ ] Verify function exists
- [ ] Check for insert conflicts
- [ ] Reference: migrations/001_create_tables.sql

### Issue: "Storage bucket not found"
- [ ] Check bucket name is 'lab-files' (exact)
- [ ] Verify bucket is not archived
- [ ] Check storage RLS policies
- [ ] Reference: migrations/004_create_storage.sql

### Issue: "Audit logs not appearing"
- [ ] Verify triggers are enabled
- [ ] Check auth.uid() is set
- [ ] Monitor for errors
- [ ] Reference: migrations/003_create_audit_system.sql

---

## Additional Resources

- **Supabase Dashboard:** https://app.supabase.com
- **Documentation:** /sessions/keen-bold-allen/heavens-diagnostic/supabase/
- **SQL Quick Reference:** supabase/QUICK_START.md
- **Schema Reference:** supabase/SCHEMA.md
- **Complete Docs:** supabase/migrations/README.md

---

**Created:** 2026-04-12  
**For:** Heavens Diagnostic Services, Sunyani  
**Version:** 1.0

---

## Final Checklist Items

Before marking deployment complete, verify:

- [ ] All 8 tables exist with correct schema
- [ ] All seed data loaded (10 test types)
- [ ] RLS enabled on all tables
- [ ] 20+ policies created and working
- [ ] Audit logging functional
- [ ] Storage bucket configured
- [ ] Auto-generated patient IDs working
- [ ] Team trained on access
- [ ] Documentation accessible
- [ ] Monitoring/alerts configured
- [ ] Backup/recovery plan documented
- [ ] Team sign-off obtained

**STATUS: READY FOR PRODUCTION**
