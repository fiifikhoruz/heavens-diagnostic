'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { formatGHS } from '@/lib/currency';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Patient, TestType, SampleType, TestTemplate, TestTemplateField } from '@/lib/types';
import { useAutoSave } from '@/hooks/useAutoSave';
import { getLocalDB } from '@/lib/local-db';

interface SelectedTest {
  testTypeId: string | null;  // null for custom tests
  sampleType: SampleType;
  price: number;
  templateInfo?: { name: string; fieldCount: number };
  // Custom test fields (only set when testTypeId is null)
  customName?: string;
  isCustom?: boolean;
}

interface TestWithTemplate {
  test: TestType;
  template?: TestTemplate;
  fields?: TestTemplateField[];
}

function rowToPatient(p: any): Patient {
  return {
    id: p.id,
    patientId: p.patient_id,
    createdAt: p.created_at,
    updatedAt: p.updated_at,
    firstName: p.first_name,
    lastName: p.last_name,
    dateOfBirth: p.date_of_birth ?? '',
    gender: p.gender ?? 'other',
    phone: p.phone ?? null,
    email: p.email ?? null,
    address: p.address ?? null,
    city: p.city ?? null,
    state: p.state ?? null,
    postalCode: p.postal_code ?? null,
    insuranceProvider: p.insurance_provider ?? null,
    insuranceId: p.insurance_id ?? null,
    emergencyContactName: p.emergency_contact_name ?? null,
    emergencyContactPhone: p.emergency_contact_phone ?? null,
    notes: p.notes ?? null,
    isActive: p.is_active,
  };
}

export default function NewVisitPage() {
  const router = useRouter();
  const supabase = createClient();

  // ── Auth ─────────────────────────────────────────────────────────────────
  const [userId, setUserId] = useState<string | null>(null);

  // ── Patient search (on-demand, server-side) ───────────────────────────────
  const [searchPatient, setSearchPatient] = useState('');
  const [patientResults, setPatientResults] = useState<Patient[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [unsyncedPatientIds, setUnsyncedPatientIds] = useState<Set<string>>(new Set());
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Tests (single query, no N+1) ─────────────────────────────────────────
  const [testsWithTemplates, setTestsWithTemplates] = useState<TestWithTemplate[]>([]);
  const [testTypes, setTestTypes] = useState<TestType[]>([]);
  const [selectedTests, setSelectedTests] = useState<SelectedTest[]>([]);
  const [testsLoading, setTestsLoading] = useState(true);

  // ── Custom test entry ────────────────────────────────────────────────────
  const [customTestName, setCustomTestName] = useState('');
  const [customTestPrice, setCustomTestPrice] = useState('');
  const [showCustomTestForm, setShowCustomTestForm] = useState(false);

  // ── Form state ────────────────────────────────────────────────────────────
  const [priority, setPriority] = useState('routine');
  const [clinicalNotes, setClinicalNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [showRestoreDraft, setShowRestoreDraft] = useState(false);
  const [draftTimestamp, setDraftTimestamp] = useState('');

  // ── Auto-save ─────────────────────────────────────────────────────────────
  const autoSave = useAutoSave({
    key: 'new-visit',
    userId: userId || '',
    debounceMs: 2000,
    enabled: !!userId,
  });

  // 1. Get user ID from cached session (no server round-trip)
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user.id) setUserId(data.session.user.id);
    });
  }, []);

  // 2. Load all test types + templates + fields in ONE query (replaces N+1 loop)
  useEffect(() => {
    const loadTests = async () => {
      try {
        const { data } = await (supabase as any)
          .from('test_types')
          .select(`
            id, name, category, description,
            turnaround_hours, price, is_sensitive, is_active,
            test_templates (
              id, name, test_type_id, created_at,
              test_template_fields (
                id, template_id, field_name, unit,
                normal_min, normal_max, display_order, created_at
              )
            )
          `)
          .eq('is_active', true)
          .order('category')
          .order('name');

        if (!data) return;

        const types: TestType[] = [];
        const withTemplates: TestWithTemplate[] = [];

        for (const t of data as any[]) {
          const test: TestType = {
            id: t.id,
            name: t.name,
            category: t.category,
            description: t.description,
            turnaroundTimeHours: t.turnaround_hours,
            price: t.price,
            isSensitive: t.is_sensitive,
            isActive: t.is_active,
          };
          types.push(test);

          const tpl = t.test_templates?.[0];
          if (tpl) {
            const fields: TestTemplateField[] = (tpl.test_template_fields ?? [])
              .sort((a: any, b: any) => a.display_order - b.display_order)
              .map((f: any): TestTemplateField => ({
                id: f.id,
                templateId: f.template_id,
                fieldName: f.field_name,
                unit: f.unit,
                normalMin: f.normal_min,
                normalMax: f.normal_max,
                displayOrder: f.display_order,
                createdAt: f.created_at,
              }));
            withTemplates.push({
              test,
              template: {
                id: tpl.id,
                testTypeId: tpl.test_type_id,
                name: tpl.name,
                createdAt: tpl.created_at,
              },
              fields,
            });
          } else {
            withTemplates.push({ test });
          }
        }

        setTestTypes(types);
        setTestsWithTemplates(withTemplates);
      } catch (err) {
        console.error('[new-visit] tests load:', err);
      } finally {
        setTestsLoading(false);
      }
    };

    loadTests();
  }, []);

  // 3. Restore draft once userId is ready
  useEffect(() => {
    if (!userId || !autoSave.hasDraft) return;
    autoSave.restore().then(draft => {
      if (!draft) return;
      if (draft.selectedPatient) {
        setSelectedPatient(draft.selectedPatient);
        setSearchPatient(`${draft.selectedPatient.firstName} ${draft.selectedPatient.lastName}`);
      }
      setSelectedTests(draft.selectedTests || []);
      setClinicalNotes(draft.clinicalNotes || '');
      setPriority(draft.priority || 'routine');
      if (draft.savedAt) {
        setDraftTimestamp(
          new Date(draft.savedAt).toLocaleTimeString('en-US', {
            hour: '2-digit', minute: '2-digit', hour12: true,
          })
        );
      }
      setShowRestoreDraft(true);
    });
  }, [userId]);

  // 4. Server-side patient search — only fires when user types, max 8 results
  const searchPatients = useCallback(async (query: string) => {
    const q = query.trim();
    if (q.length < 2) { setPatientResults([]); return; }

    setIsSearching(true);
    try {
      const { data: serverData } = await supabase
        .from('patients')
        .select('*')
        .eq('is_active', true)
        .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,phone.ilike.%${q}%`)
        .order('last_name')
        .limit(8);

      const serverIds = new Set<string>();
      const results: Patient[] = (serverData ?? []).map((p: any) => {
        serverIds.add(p.id);
        return rowToPatient(p);
      });

      // Merge in unsynced local patients matching the query
      try {
        const db = getLocalDB();
        const localPatients = await db.patients.where('synced').equals(0 as any).toArray();
        const newUnsyncedIds = new Set<string>();
        const ql = q.toLowerCase();
        for (const lp of localPatients) {
          if (serverIds.has(lp.id)) continue;
          const fullName = `${lp.firstName} ${lp.lastName}`.toLowerCase();
          if (!fullName.includes(ql) && !(lp.phone ?? '').includes(q)) continue;
          newUnsyncedIds.add(lp.id);
          results.unshift({
            id: lp.id, patientId: lp.patientId,
            createdAt: lp.createdAt, updatedAt: lp.updatedAt,
            firstName: lp.firstName, lastName: lp.lastName,
            dateOfBirth: lp.dateOfBirth, gender: lp.gender as any,
            phone: lp.phone, email: lp.email,
            address: lp.address, city: lp.city,
            state: lp.state, postalCode: lp.postalCode,
            insuranceProvider: lp.insuranceProvider ?? null,
            insuranceId: lp.insuranceId ?? null,
            emergencyContactName: lp.emergencyContactName,
            emergencyContactPhone: lp.emergencyContactPhone,
            notes: null, isActive: true,
          });
        }
        setUnsyncedPatientIds(prev => {
          const next = new Set(prev);
          newUnsyncedIds.forEach(id => next.add(id));
          return next;
        });
      } catch { /* IndexedDB unavailable */ }

      setPatientResults(results);
    } catch (err) {
      console.error('[new-visit] patient search:', err);
    } finally {
      setIsSearching(false);
    }
  }, [supabase]);

  const handlePatientSearch = (value: string) => {
    setSearchPatient(value);
    if (selectedPatient && value !== `${selectedPatient.firstName} ${selectedPatient.lastName}`) {
      setSelectedPatient(null);
    }
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!value.trim()) { setPatientResults([]); return; }
    searchTimer.current = setTimeout(() => searchPatients(value), 300);
  };

  const handleSelectPatient = (patient: Patient) => {
    setSelectedPatient(patient);
    setSearchPatient(`${patient.firstName} ${patient.lastName}`);
    setPatientResults([]);
    autoSave.save({ selectedPatient: patient, selectedTests, clinicalNotes, priority, savedAt: Date.now() });
  };

  const handleAddTest = (testTypeId: string) => {
    const testType = testTypes.find(t => t.id === testTypeId);
    const testWithTemplate = testsWithTemplates.find(t => t.test.id === testTypeId);
    if (!testType || selectedTests.some(t => !t.isCustom && t.testTypeId === testTypeId)) return;

    const fieldCount = testWithTemplate?.fields?.length || 0;
    const updated: SelectedTest[] = [
      ...selectedTests,
      {
        testTypeId,
        sampleType: SampleType.BLOOD,
        price: testType.price ?? 0,
        templateInfo: testWithTemplate?.template
          ? { name: testWithTemplate.template.name, fieldCount }
          : undefined,
      },
    ];
    setSelectedTests(updated);
    autoSave.save({ selectedPatient, selectedTests: updated, clinicalNotes, priority, savedAt: Date.now() });
  };

  const handleAddCustomTest = () => {
    const name = customTestName.trim();
    if (!name) return;
    // Prevent duplicate custom test names
    if (selectedTests.some(t => t.isCustom && t.customName?.toLowerCase() === name.toLowerCase())) return;
    const price = parseFloat(customTestPrice) || 0;
    const updated: SelectedTest[] = [
      ...selectedTests,
      {
        testTypeId: null,
        sampleType: SampleType.BLOOD,
        price,
        isCustom: true,
        customName: name,
      },
    ];
    setSelectedTests(updated);
    setCustomTestName('');
    setCustomTestPrice('');
    setShowCustomTestForm(false);
    autoSave.save({ selectedPatient, selectedTests: updated, clinicalNotes, priority, savedAt: Date.now() });
  };

  const handleRemoveTest = (key: string) => {
    const updated = selectedTests.filter(t => {
      const testKey = t.isCustom ? `custom:${t.customName}` : t.testTypeId;
      return testKey !== key;
    });
    setSelectedTests(updated);
    autoSave.save({ selectedPatient, selectedTests: updated, clinicalNotes, priority, savedAt: Date.now() });
  };

  const calculateTotal = () => selectedTests.reduce((sum, t) => sum + t.price, 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError('');

    try {
      if (!selectedPatient) { setError('Please select a patient'); return; }
      if (selectedTests.length === 0) { setError('Please select at least one test'); return; }
      if (unsyncedPatientIds.has(selectedPatient.id)) {
        setError(
          `${selectedPatient.firstName} ${selectedPatient.lastName} was registered offline and hasn't synced yet. ` +
          'Please wait for sync to complete, then try again.'
        );
        return;
      }

      const { data: authData } = await supabase.auth.getSession();
      if (!authData.session) { setError('You must be logged in'); return; }

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

      if (visitError || !visitData) { setError('Failed to create visit'); return; }

      // All post-visit inserts run in parallel
      const [testsResult, samplesResult, paymentResult, timestampResult] = await Promise.all([
        supabase.from('visit_tests').insert(
          selectedTests.map(t => ({
            visit_id: visitData.id,
            test_type_id: t.isCustom ? null : t.testTypeId,
            custom_name: t.isCustom ? t.customName : null,
            custom_price: t.isCustom ? t.price : null,
            status: 'pending',
            assigned_to: null,
          }))
        ),
        supabase.from('samples').insert(
          selectedTests.map(t => ({
            visit_id: visitData.id, sample_type: t.sampleType, status: 'pending',
          }))
        ),
        supabase.from('payments').insert({
          visit_id: visitData.id, amount: calculateTotal(),
          status: 'unpaid', received_by: authData.session.user.id,
        }),
        supabase.from('visit_timestamps').insert({
          visit_id: visitData.id, created_at: visitDate,
        }),
      ]);

      if (testsResult.error) console.error('[new-visit] visit_tests:', testsResult.error);
      if (samplesResult.error) console.error('[new-visit] samples:', samplesResult.error);
      if (timestampResult.error) console.error('[new-visit] timestamps:', timestampResult.error);
      if (paymentResult.error) {
        setError(`Visit created but payment record failed: ${paymentResult.error.message}. Please record payment manually.`);
      }

      await autoSave.discard();
      router.push(`/dashboard/visits/${visitData.id}`);
    } catch (err) {
      console.error('[new-visit] submit:', err);
      setError('An error occurred while creating the visit');
    } finally {
      setIsSubmitting(false);
    }
  };

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
              setSearchPatient('');
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
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="max-w-4xl space-y-6">

        {/* Patient Selection — renders immediately, search fires on demand */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Select Patient</h2>
          <div className="relative">
            <input
              type="text"
              placeholder="Type name or phone to search…"
              value={searchPatient}
              onChange={e => handlePatientSearch(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-600 pr-10"
            />
            {isSearching && (
              <svg className="absolute right-3 top-2.5 h-5 w-5 animate-spin text-gray-400" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
            {patientResults.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-300 rounded-lg shadow-lg z-10 max-h-64 overflow-y-auto">
                {patientResults.map(patient => {
                  const isPending = unsyncedPatientIds.has(patient.id);
                  return (
                    <button
                      key={patient.id}
                      type="button"
                      onClick={() => handleSelectPatient(patient)}
                      className={`w-full text-left px-4 py-2.5 hover:bg-green-50 border-b last:border-b-0 ${isPending ? 'opacity-75' : ''}`}
                    >
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-gray-900">{patient.firstName} {patient.lastName}</p>
                        {isPending && (
                          <span className="text-xs bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded font-medium">
                            Syncing…
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-500">{patient.phone || 'No phone'} · {patient.patientId}</p>
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
              <p className="text-sm text-green-700 mt-0.5">ID: {selectedPatient.patientId}</p>
            </div>
          )}
        </div>

        {/* Test Selection — shows inline skeleton while loading */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Select Tests</h2>

          {testsLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="h-20 bg-gray-100 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : testsWithTemplates.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-8">No test types configured yet.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              {testsWithTemplates.map(({ test, template, fields }) => {
                const isSelected = selectedTests.some(t => t.testTypeId === test.id);
                const fieldCount = fields?.length || 0;
                return (
                  <button
                    key={test.id}
                    type="button"
                    onClick={() => handleAddTest(test.id)}
                    disabled={isSelected}
                    className={`p-4 border rounded-lg text-left transition ${
                      isSelected ? 'bg-green-50 border-green-600' : 'border-gray-300 hover:border-green-600'
                    } disabled:opacity-50`}
                  >
                    <p className="font-medium text-gray-900">{test.name}</p>
                    <p className="text-sm text-gray-600">{test.category}</p>
                    <p className="text-xs text-gray-500 mt-1">GHS {(test.price ?? 0).toFixed(2)}</p>
                    {template && fieldCount > 0 && (
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
          )}

          {/* Add Custom Test */}
          <div className="mt-4 border-t border-gray-100 pt-4">
            {!showCustomTestForm ? (
              <button
                type="button"
                onClick={() => setShowCustomTestForm(true)}
                className="text-sm text-green-700 hover:text-green-800 font-medium flex items-center gap-1"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Can't find a test? Add unlisted / custom test
              </button>
            ) : (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 space-y-3">
                <p className="text-sm font-medium text-yellow-800">Add a custom or unlisted test</p>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-gray-700 mb-1">Test Name *</label>
                    <input
                      type="text"
                      value={customTestName}
                      onChange={e => setCustomTestName(e.target.value)}
                      placeholder="e.g. Thyroid Panel, G6PD, HbA1c…"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-600"
                      onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleAddCustomTest())}
                    />
                  </div>
                  <div className="w-32">
                    <label className="block text-xs font-medium text-gray-700 mb-1">Price (GHS)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={customTestPrice}
                      onChange={e => setCustomTestPrice(e.target.value)}
                      placeholder="0.00"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-600"
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleAddCustomTest}
                    disabled={!customTestName.trim()}
                    className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white text-sm font-medium rounded-lg transition"
                  >
                    Add Test
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowCustomTestForm(false); setCustomTestName(''); setCustomTestPrice(''); }}
                    className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-lg transition"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          {selectedTests.length > 0 && (
            <div className="mt-6">
              <h3 className="font-semibold text-gray-900 mb-3">Selected Tests</h3>
              <div className="space-y-2">
                {selectedTests.map(test => {
                  const testType = testTypes.find(t => t.id === test.testTypeId);
                  const testKey = test.isCustom ? `custom:${test.customName}` : test.testTypeId!;
                  const displayName = test.isCustom ? test.customName : testType?.name;
                  const displayCategory = test.isCustom ? 'Custom test' : testType?.category;
                  return (
                    <div key={testKey} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-gray-900">{displayName}</p>
                          {test.isCustom && (
                            <span className="text-xs bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded font-medium">
                              Custom
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-600">{displayCategory}</p>
                        {test.templateInfo && test.templateInfo.fieldCount > 0 && (
                          <p className="text-xs text-green-700 font-medium mt-1">
                            {test.templateInfo.fieldCount} parameters will be tested
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveTest(testKey)}
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
            onChange={e => {
              const v = e.target.value;
              setPriority(v);
              autoSave.save({ selectedPatient, selectedTests, clinicalNotes, priority: v, savedAt: Date.now() });
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
            onChange={e => {
              const v = e.target.value;
              setClinicalNotes(v);
              autoSave.save({ selectedPatient, selectedTests, clinicalNotes: v, priority, savedAt: Date.now() });
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
                {selectedTests.reduce((sum, t) => sum + (t.templateInfo?.fieldCount || 0), 0)}
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
