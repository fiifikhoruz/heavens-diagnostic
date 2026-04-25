'use client';

import { useState, useEffect } from 'react';
import { formatGHS } from '@/lib/currency';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Patient, TestType, SampleType, TestTemplate, TestTemplateField } from '@/lib/types';
import { useAutoSave } from '@/hooks/useAutoSave';
import { getLocalDB } from '@/lib/local-db';

interface SelectedTest {
  testTypeId: string;
  sampleType: SampleType;
  price: number;
  templateInfo?: {
    name: string;
    fieldCount: number;
  };
}

interface TestWithTemplate {
  test: TestType;
  template?: TestTemplate;
  fields?: TestTemplateField[];
}

export default function NewVisitPage() {
  const router = useRouter();
  const supabase = createClient();

  const [patients, setPatients] = useState<Patient[]>([]);
  const [testTypes, setTestTypes] = useState<TestType[]>([]);
  const [testsWithTemplates, setTestsWithTemplates] = useState<TestWithTemplate[]>([]);
  const [filteredPatients, setFilteredPatients] = useState<Patient[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [selectedTests, setSelectedTests] = useState<SelectedTest[]>([]);
  const [searchPatient, setSearchPatient] = useState('');
  const [priority, setPriority] = useState('routine');
  const [clinicalNotes, setClinicalNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [userId, setUserId] = useState<string | null>(null);
  const [showRestoreDraft, setShowRestoreDraft] = useState(false);
  const [draftTimestamp, setDraftTimestamp] = useState<string>('');
  const [unsyncedPatientIds, setUnsyncedPatientIds] = useState<Set<string>>(new Set());

  // Get user ID for auto-save
  useEffect(() => {
    const getUser = async () => {
      try {
        const { data: authData } = await supabase.auth.getUser();
        if (authData.user) {
          setUserId(authData.user.id);
        }
      } catch (err) {
        console.error('Error getting user:', err);
      }
    };
    getUser();
  }, [supabase]);

  // Initialize auto-save hook
  const autoSave = useAutoSave({
    key: 'new-visit',
    userId: userId || '',
    debounceMs: 2000,
    enabled: !!userId,
  });

  // Check for draft on mount and restore if available
  useEffect(() => {
    const checkDraft = async () => {
      if (userId && autoSave.hasDraft) {
        const draft = await autoSave.restore();
        if (draft) {
          setSelectedPatient(draft.selectedPatient || null);
          setSelectedTests(draft.selectedTests || []);
          setClinicalNotes(draft.clinicalNotes || '');
          setPriority(draft.priority || 'routine');
          if (draft.savedAt) {
            const date = new Date(draft.savedAt);
            const timeStr = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
            setDraftTimestamp(timeStr);
          }
          setShowRestoreDraft(true);
        }
      }
    };
    checkDraft();
  }, [userId, autoSave.hasDraft]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch patients from Supabase
        const { data: patientsData } = await supabase
          .from('patients')
          .select('*')
          .eq('is_active', true);

        const syncedIds = new Set<string>();
        const mapped: Patient[] = (patientsData ?? []).map((p: any) => {
          syncedIds.add(p.id);
          return {
            id: p.id,
            patientId: p.patient_id,
            createdAt: p.created_at,
            updatedAt: p.updated_at,
            firstName: p.first_name,
            lastName: p.last_name,
            dateOfBirth: p.date_of_birth,
            gender: p.gender,
            phone: p.phone,
            email: p.email,
            address: p.address,
            city: p.city,
            state: p.state,
            postalCode: p.postal_code,
            insuranceProvider: p.insurance_provider,
            insuranceId: p.insurance_id,
            emergencyContactName: p.emergency_contact_name,
            emergencyContactPhone: p.emergency_contact_phone,
            notes: p.notes,
            isActive: p.is_active,
          };
        });

        // Also surface patients saved offline that haven't synced yet
        // They're shown in the list but blocked from visit creation until synced
        try {
          const db = getLocalDB();
          const localPatients = await db.patients.where('synced').equals(0 as any).toArray();
          const newUnsyncedIds = new Set<string>();
          for (const lp of localPatients) {
            if (!syncedIds.has(lp.id)) {
              newUnsyncedIds.add(lp.id);
              mapped.unshift({
                id: lp.id,
                patientId: lp.patientId,
                createdAt: lp.createdAt,
                updatedAt: lp.updatedAt,
                firstName: lp.firstName,
                lastName: lp.lastName,
                dateOfBirth: lp.dateOfBirth,
                gender: lp.gender as any,
                phone: lp.phone,
                email: lp.email,
                address: lp.address,
                city: lp.city,
                state: lp.state,
                postalCode: lp.postalCode,
                insuranceProvider: lp.insuranceProvider ?? null,
                insuranceId: lp.insuranceId ?? null,
                emergencyContactName: lp.emergencyContactName,
                emergencyContactPhone: lp.emergencyContactPhone,
                notes: null,
                isActive: true,
              });
            }
          }
          setUnsyncedPatientIds(newUnsyncedIds);
        } catch { /* IndexedDB unavailable — skip local patients */ }

        setPatients(mapped);
        setFilteredPatients(mapped);

        // Fetch test types
        const { data: testsData } = await supabase
          .from('test_types')
          .select('*')
          .eq('is_active', true);

        if (testsData) {
          const mapped: TestType[] = (testsData as any[]).map(t => ({
            id: t.id,
            name: t.name,
            category: t.category,
            description: t.description,
            turnaroundTimeHours: t.turnaround_hours,
            price: t.price,
            isSensitive: t.is_sensitive,
            isActive: t.is_active,
          }));
          setTestTypes(mapped);

          // Fetch templates and fields for each test type
          const testsWithTemplatesData: TestWithTemplate[] = [];
          for (const test of mapped) {
            const { data: templateData } = await supabase
              .from('test_templates')
              .select('*')
              .eq('test_type_id', test.id)
              .single();

            if (templateData) {
              const { data: fieldsData } = await supabase
                .from('test_template_fields')
                .select('*')
                .eq('template_id', templateData.id)
                .order('display_order', { ascending: true });

              testsWithTemplatesData.push({
                test,
                template: {
                  id: templateData.id,
                  testTypeId: templateData.test_type_id,
                  name: templateData.name,
                  createdAt: templateData.created_at,
                },
                fields: fieldsData ? (fieldsData as any[]).map(f => ({
                  id: f.id,
                  templateId: f.template_id,
                  fieldName: f.field_name,
                  unit: f.unit,
                  normalMin: f.normal_min,
                  normalMax: f.normal_max,
                  displayOrder: f.display_order,
                  createdAt: f.created_at,
                })) as TestTemplateField[] : [],
              });
            } else {
              testsWithTemplatesData.push({
                test,
              });
            }
          }
          setTestsWithTemplates(testsWithTemplatesData);
        }
      } catch (err) {
        console.error('Error fetching data:', err);
        setError('Failed to load form data');
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [supabase]);

  const handlePatientSearch = (value: string) => {
    setSearchPatient(value);
    if (value.trim()) {
      const filtered = patients.filter(p =>
        `${p.firstName} ${p.lastName}`.toLowerCase().includes(value.toLowerCase()) ||
        p.phone?.includes(value)
      );
      setFilteredPatients(filtered);
    } else {
      setFilteredPatients(patients);
    }
  };

  const handleSelectPatient = (patient: Patient) => {
    setSelectedPatient(patient);
    setSearchPatient(`${patient.firstName} ${patient.lastName}`);
    setFilteredPatients([]);
    // Auto-save
    autoSave.save({
      selectedPatient: patient,
      selectedTests,
      clinicalNotes,
      priority,
      savedAt: Date.now(),
    });
  };

  const handleAddTest = (testTypeId: string) => {
    const testType = testTypes.find(t => t.id === testTypeId);
    const testWithTemplate = testsWithTemplates.find(t => t.test.id === testTypeId);

    if (testType && !selectedTests.find(t => t.testTypeId === testTypeId)) {
      const fieldCount = testWithTemplate?.fields?.length || 0;
      const updatedTests = [
        ...selectedTests,
        {
          testTypeId,
          sampleType: SampleType.BLOOD,
          price: 0,
          templateInfo: testWithTemplate?.template ? {
            name: testWithTemplate.template.name,
            fieldCount,
          } : undefined,
        },
      ];
      setSelectedTests(updatedTests);
      // Auto-save
      autoSave.save({
        selectedPatient,
        selectedTests: updatedTests,
        clinicalNotes,
        priority,
        savedAt: Date.now(),
      });
    }
  };

  const handleRemoveTest = (testTypeId: string) => {
    const updatedTests = selectedTests.filter(t => t.testTypeId !== testTypeId);
    setSelectedTests(updatedTests);
    // Auto-save
    autoSave.save({
      selectedPatient,
      selectedTests: updatedTests,
      clinicalNotes,
      priority,
      savedAt: Date.now(),
    });
  };

  const calculateTotal = () => {
    return selectedTests.reduce((sum, test) => sum + test.price, 0);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError('');

    try {
      if (!selectedPatient) {
        setError('Please select a patient');
        return;
      }

      if (selectedTests.length === 0) {
        setError('Please select at least one test');
        return;
      }

      // Block visit creation for patients still pending sync to server
      if (unsyncedPatientIds.has(selectedPatient.id)) {
        setError(
          `${selectedPatient.firstName} ${selectedPatient.lastName} was registered offline and hasn't synced yet. ` +
          'Please wait for sync to complete (check the sync badge in the toolbar), then try again.'
        );
        setIsSubmitting(false);
        return;
      }

      // Get current user
      const { data: authData } = await supabase.auth.getSession();
      if (!authData.session) {
        setError('You must be logged in');
        return;
      }

      // Create visit
      const visitDate = new Date().toISOString();
      const { data: visitData, error: visitError } = await supabase
        .from('visits')
        .insert({
          patient_id: selectedPatient.id,
          visit_date: visitDate,
          status: 'created',
          created_by: authData.session.user.id,
        })
        .select()
        .single();

      if (visitError || !visitData) {
        setError('Failed to create visit');
        return;
      }

      // Create visit tests
      const testInserts = selectedTests.map(test => ({
        visit_id: visitData.id,
        test_type_id: test.testTypeId,
        status: 'pending',
        assigned_to: null,
      }));

      const { error: testsError } = await supabase
        .from('visit_tests')
        .insert(testInserts);

      if (testsError) {
        console.error('Failed to create tests:', testsError);
      }

      // Create samples
      const sampleInserts = selectedTests.map(test => ({
        visit_id: visitData.id,
        sample_type: test.sampleType,
        status: 'pending',
      }));

      const { error: samplesError } = await supabase
        .from('samples')
        .insert(sampleInserts);

      if (samplesError) {
        console.error('Failed to create samples:', samplesError);
      }

      // Create payment record (unpaid)
      const { error: paymentError } = await supabase
        .from('payments')
        .insert({
          visit_id: visitData.id,
          amount: calculateTotal(),
          status: 'unpaid',
          received_by: authData.session.user.id,
        });

      if (paymentError) {
        // Non-fatal but surface it — visit is created, payment tracking failed
        setError(`Visit created but payment record failed: ${paymentError.message}. Please record payment manually.`);
      }

      // Create timestamp for visit creation
      const { error: timestampError } = await supabase
        .from('visit_timestamps')
        .insert({
          visit_id: visitData.id,
          created_at: visitDate,
        });

      if (timestampError) {
        console.error('Failed to create timestamp:', timestampError);
        // Non-fatal — turnaround tracking may be incomplete but visit proceeds
      }

      // Clear draft after successful creation
      await autoSave.discard();

      // Redirect to visit detail
      router.push(`/dashboard/visits/${visitData.id}`);
    } catch (err) {
      console.error('Error creating visit:', err);
      setError('An error occurred while creating the visit');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-screen">
        <svg className="animate-spin h-12 w-12 text-green-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <Link href="/dashboard/visits" className="text-green-600 hover:text-green-700 font-medium mb-4 inline-flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Visits
        </Link>
        <h1 className="text-3xl font-bold text-gray-900">Create New Visit</h1>
        <p className="text-gray-600 mt-1">Register a new patient visit and order tests</p>
      </div>

      {showRestoreDraft && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-blue-700 flex items-center justify-between">
          <div>
            <p className="font-medium">You have an unsaved draft from {draftTimestamp}.</p>
            <p className="text-sm mt-1">Your previous form data has been restored.</p>
          </div>
          <button
            type="button"
            onClick={() => {
              autoSave.discard();
              setShowRestoreDraft(false);
              setSelectedPatient(null);
              setSelectedTests([]);
              setClinicalNotes('');
              setPriority('routine');
            }}
            className="text-sm font-medium text-blue-600 hover:text-blue-700 ml-4"
          >
            Discard
          </button>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="max-w-4xl space-y-6">
        {/* Patient Selection */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Select Patient</h2>
          <div className="relative">
            <input
              type="text"
              placeholder="Search by name or phone..."
              value={searchPatient}
              onChange={(e) => handlePatientSearch(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-600"
            />
            {filteredPatients.length > 0 && searchPatient && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-300 rounded-lg shadow-lg z-10">
                {filteredPatients.map(patient => {
                  const isPending = unsyncedPatientIds.has(patient.id);
                  return (
                    <button
                      key={patient.id}
                      type="button"
                      onClick={() => handleSelectPatient(patient)}
                      className={`w-full text-left px-4 py-2 hover:bg-green-50 border-b last:border-b-0 ${isPending ? 'opacity-75' : ''}`}
                    >
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-gray-900">{patient.firstName} {patient.lastName}</p>
                        {isPending && (
                          <span className="text-xs bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded font-medium">
                            Syncing…
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-600">{patient.phone || 'No phone'}</p>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          {selectedPatient && (
            <div className="mt-4 p-4 bg-green-50 rounded-lg border border-green-200">
              <p className="font-medium text-green-900">
                Selected: {selectedPatient.firstName} {selectedPatient.lastName}
              </p>
              <p className="text-sm text-green-700 mt-1">ID: {selectedPatient.patientId}</p>
            </div>
          )}
        </div>

        {/* Test Selection */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Select Tests</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            {testsWithTemplates.map(testWithTemplate => {
              const test = testWithTemplate.test;
              const isSelected = selectedTests.some(t => t.testTypeId === test.id);
              const fieldCount = testWithTemplate.fields?.length || 0;

              return (
                <button
                  key={test.id}
                  type="button"
                  onClick={() => handleAddTest(test.id)}
                  disabled={isSelected}
                  className={`p-4 border rounded-lg text-left transition ${
                    isSelected
                      ? 'bg-green-50 border-green-600'
                      : 'border-gray-300 hover:border-green-600'
                  } disabled:opacity-50`}
                >
                  <p className="font-medium text-gray-900">{test.name}</p>
                  <p className="text-sm text-gray-600">{test.category}</p>
                  <p className="text-xs text-gray-500 mt-1">GHS {test.price?.toFixed(2)}</p>
                  {testWithTemplate.template && fieldCount > 0 && (
                    <div className="mt-2 pt-2 border-t border-gray-200">
                      <p className="text-xs font-medium text-green-700">
                        {fieldCount} parameter{fieldCount !== 1 ? 's' : ''}
                      </p>
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {selectedTests.length > 0 && (
            <div>
              <h3 className="font-semibold text-gray-900 mb-3">Selected Tests</h3>
              <div className="space-y-2">
                {selectedTests.map(test => {
                  const testType = testTypes.find(t => t.id === test.testTypeId);
                  return (
                    <div key={test.testTypeId} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div>
                        <p className="font-medium text-gray-900">{testType?.name}</p>
                        <p className="text-sm text-gray-600">{testType?.category}</p>
                        {test.templateInfo && test.templateInfo.fieldCount > 0 && (
                          <p className="text-xs text-green-700 font-medium mt-1">
                            {test.templateInfo.fieldCount} parameters will be tested
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveTest(test.testTypeId)}
                        className="text-red-600 hover:text-red-700 font-medium text-sm"
                      >
                        Remove
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Priority */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Priority</h2>
          <select
            value={priority}
            onChange={(e) => {
              const newPriority = e.target.value;
              setPriority(newPriority);
              // Auto-save
              autoSave.save({
                selectedPatient,
                selectedTests,
                clinicalNotes,
                priority: newPriority,
                savedAt: Date.now(),
              });
            }}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-600"
          >
            <option value="routine">Routine</option>
            <option value="urgent">Urgent</option>
          </select>
        </div>

        {/* Clinical Notes */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Clinical Notes</h2>
          <textarea
            value={clinicalNotes}
            onChange={(e) => {
              const newNotes = e.target.value;
              setClinicalNotes(newNotes);
              // Auto-save
              autoSave.save({
                selectedPatient,
                selectedTests,
                clinicalNotes: newNotes,
                priority,
                savedAt: Date.now(),
              });
            }}
            rows={4}
            placeholder="Add clinical notes for this visit..."
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-600"
          />
        </div>

        {/* Summary */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Summary</h2>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-gray-600">Patient:</span>
              <span className="font-medium text-gray-900">
                {selectedPatient ? `${selectedPatient.firstName} ${selectedPatient.lastName}` : 'Not selected'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Tests:</span>
              <span className="font-medium text-gray-900">{selectedTests.length} selected</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Total Parameters:</span>
              <span className="font-medium text-gray-900">
                {selectedTests.reduce((sum, test) => sum + (test.templateInfo?.fieldCount || 0), 0)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Priority:</span>
              <span className="font-medium text-gray-900 capitalize">{priority}</span>
            </div>
            <div className="border-t border-gray-200 pt-2 flex justify-between">
              <span className="font-semibold text-gray-900">Estimated Total:</span>
              <span className="font-bold text-lg text-green-600">{formatGHS(calculateTotal())}</span>
            </div>
          </div>
        </div>

        {/* Submit */}
        <div className="flex gap-3 items-center">
          <button
            type="submit"
            disabled={isSubmitting || !selectedPatient || selectedTests.length === 0}
            className="flex-1 bg-green-600 hover:bg-green-700 text-white font-medium py-3 px-4 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? 'Creating Visit...' : 'Create Visit'}
          </button>
          <Link
            href="/dashboard/visits"
            className="flex-1 text-center bg-gray-200 hover:bg-gray-300 text-gray-900 font-medium py-3 px-4 rounded-lg transition"
          >
            Cancel
          </Link>
          {autoSave.hasDraft && autoSave.lastSavedLabel && (
            <div className="text-xs text-gray-600 whitespace-nowrap">
              Draft saved {autoSave.lastSavedLabel}
            </div>
          )}
        </div>
      </form>
    </div>
  );
}
