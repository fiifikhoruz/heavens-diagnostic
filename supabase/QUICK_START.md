# Heavens Diagnostic Services - Quick Start Guide

## Deployment

### Step 1: Link to Supabase Project
```bash
cd /sessions/keen-bold-allen/heavens-diagnostic
supabase link --project-ref your-project-ref
```

### Step 2: Run Migrations
```bash
supabase db push
```

This will execute all 4 migrations in order:
1. ✅ Creates all tables, enums, and seed data
2. ✅ Enables RLS and creates access policies
3. ✅ Sets up audit logging and security tracking
4. ✅ Configures storage bucket and file access

---

## User Roles & Access

### Front Desk (front_desk)
- **Can:** Create patients, create lab requests, view basic patient info
- **Cannot:** View lab results, manage tests
- **Path:** Manage patient intake and request initiation

### Technician (technician)
- **Can:** View assigned lab requests, enter test results, upload files
- **Cannot:** Approve results, see sensitive tests, modify patient data
- **Path:** Perform lab work and data entry

### Doctor (doctor)
- **Can:** View all patients, see all results (including sensitive), approve results
- **Cannot:** Perform lab work, create patients
- **Path:** Review and authorize results

### Admin (admin)
- **Can:** Do anything - user management, test definitions, full audit access
- **Cannot:** Nothing (full access)
- **Path:** System administration and compliance

---

## Common Workflows

### Creating a Patient Record

```javascript
// After front desk creates patient in auth
const { data, error } = await supabase
  .from('patients')
  .insert({
    first_name: 'John',
    last_name: 'Doe',
    date_of_birth: '1990-01-15',
    gender: 'Male',
    phone: '+233123456789',
    email: 'john@example.com',
    blood_group: 'O+',
    created_by: currentUserId
  });

// patient_id is auto-generated as HDS-0001, HDS-0002, etc.
```

### Creating a Lab Request

```javascript
const { data, error } = await supabase
  .from('lab_requests')
  .insert({
    patient_id: patientId,
    requesting_doctor: 'Dr. Smith',
    clinical_notes: 'Patient reports fever and headache',
    priority: 'routine',
    status: 'pending',
    created_by: currentUserId
  });
```

### Entering Lab Results

```javascript
// Technician enters a result for an assigned test
const { data, error } = await supabase
  .from('lab_results')
  .insert({
    lab_request_id: labRequestId,
    test_type_id: testTypeId,
    result_value: '7.5',
    result_unit: 'g/dL',
    reference_range: '12-16 g/dL (Male)',
    is_abnormal: true,
    status: 'entered',
    entered_by: currentUserId,
    entered_at: new Date()
  });
```

### Approving Results

```javascript
// Doctor approves a result
const { data, error } = await supabase
  .from('lab_results')
  .update({
    status: 'approved',
    reviewed_by: currentUserId,
    approved_by: currentUserId,
    reviewed_at: new Date(),
    approved_at: new Date()
  })
  .eq('id', resultId);
```

### Uploading Result Files

```javascript
// Step 1: Upload to storage
const { data: uploadData, error: uploadError } = await supabase
  .storage
  .from('lab-files')
  .upload(`lab-results/${labResultId}/report.pdf`, file);

// Step 2: Record in database
if (!uploadError) {
  await supabase
    .from('result_files')
    .insert({
      lab_result_id: labResultId,
      file_path: uploadData.path,
      file_name: 'report.pdf',
      file_size: file.size,
      mime_type: 'application/pdf',
      uploaded_by: currentUserId
    });
}
```

### Downloading Files (with Logging)

```javascript
// Generate signed URL (valid for 1 hour)
const { data: urlData, error: urlError } = await supabase
  .storage
  .from('lab-files')
  .createSignedUrl(filePath, 3600);

// Log download on server
if (!urlError) {
  await supabase.rpc('log_file_download', {
    p_file_id: fileId,
    p_ip_address: clientIpAddress
  });
  
  // User downloads from signed URL
  window.open(urlData.signedUrl);
}
```

---

## Database Functions for App Code

### Audit & Security

```sql
-- Log file download
SELECT log_file_download(
  'file-uuid-here',
  '192.168.1.1'
);

-- Log login attempt
SELECT log_login_attempt(
  'user@example.com',
  true,  -- success
  '192.168.1.1',
  'Mozilla/5.0...'
);

-- Check failed login count for lockout
SELECT get_failed_login_count(
  'user@example.com',
  30  -- last 30 minutes
);

-- Check file access before generating signed URL
SELECT validate_file_access('file-uuid-here');
```

### Patient ID Generation

Patient IDs are auto-generated. Example:
- HDS-0001 (first patient)
- HDS-0002 (second patient)
- etc.

No manual generation needed.

---

## RLS Policy Reference

### Quick Policy Lookup

| Resource | Front Desk | Tech | Doctor | Admin |
|----------|-----------|------|--------|-------|
| Patients | R(basic) | R | R | CRUD |
| Lab Requests | CRU | RU | RU | CRUD |
| Lab Results | ✗ | CU(own) | RU(approve) | CRUD |
| Sensitive Results | ✗ | ✗ | R | R |
| Result Files | ✗ | RU(own) | RU | CRUD |
| Profiles | R(own) | R(own) | R(own) | CRUD |

Legend: C=Create, R=Read, U=Update, D=Delete, U=Update, ✗=No Access

---

## Sensitive Tests

Tests flagged as sensitive (visible to doctor/admin only):
- HIV Screening
- Hepatitis B

Add more with:
```sql
INSERT INTO test_types (name, category, description, turnaround_hours, price, is_sensitive)
VALUES ('New Sensitive Test', 'Category', 'Description', 24, 100.00, TRUE);
```

---

## Troubleshooting

### "Permission denied" on lab_results
- Check user role
- Verify user is assigned to the lab_request
- Sensitive tests require doctor/admin role

### "Permission denied" on patient creation
- Only front_desk and admin can create patients
- Verify profile.role is set correctly

### File upload fails
- Check bucket is 'lab-files' (not 'labfiles')
- Verify MIME type is in allowed list
- Check 50MB file size limit
- Verify user role (tech/doctor/admin only)

### Audit logs not appearing
- Audit logging is automatic on INSERT/UPDATE/DELETE
- Check auth.uid() is properly set
- Download logging requires explicit call to log_file_download()

---

## Performance Tips

1. **Indexes are pre-created** - No additional indexing needed for common queries
2. **Use created_at DESC** - Audit logs sorted descending for latest first
3. **Filter by status** - Lab requests/results queries should filter by status
4. **Cache test_types** - Load test types once at app startup
5. **Batch operations** - Use batch inserts for multiple results

---

## Monitoring

Check audit logs:
```sql
SELECT user_id, action, table_name, created_at 
FROM audit_logs 
ORDER BY created_at DESC 
LIMIT 50;
```

View audit summary by user:
```sql
SELECT user_id, user_name, action, table_name, action_count, action_date
FROM audit_summary
ORDER BY action_date DESC;
```

Check login attempts:
```sql
SELECT email, COUNT(*) as attempts
FROM login_attempts
WHERE success = FALSE AND created_at > NOW() - INTERVAL '1 hour'
GROUP BY email;
```

---

## Storage Bucket Details

**Bucket:** lab-files  
**Privacy:** Private (RLS enforced)  
**File Size Limit:** 50MB  
**Allowed MIME Types:**
- application/pdf
- image/jpeg
- image/png
- image/tiff
- text/csv
- application/vnd.ms-excel
- application/vnd.openxmlformats-officedocument.spreadsheetml.sheet

---

## Seed Data (Test Types)

10 test types are pre-seeded:

1. Full Blood Count - 4h - 45.00
2. Malaria Parasite - 4h - 25.00
3. Urinalysis - 4h - 20.00
4. Liver Function Test - 8h - 75.00
5. Kidney Function Test - 8h - 65.00
6. Blood Sugar - 2h - 15.00
7. **HIV Screening** - 24h - 50.00 (sensitive)
8. **Hepatitis B** - 24h - 60.00 (sensitive)
9. Pregnancy Test - 2h - 30.00
10. Widal Test - 8h - 35.00

---

## Next Steps

1. Set up authentication (Supabase Auth)
2. Create initial admin user profile
3. Build frontend for each role
4. Implement file upload/download UI
5. Set up email notifications
6. Deploy application

---

## Support

For issues or questions:
1. Check migrations/README.md for detailed documentation
2. Review the SQL comments in each migration file
3. Consult the RLS policy section above
4. Check Supabase documentation: https://supabase.com/docs
