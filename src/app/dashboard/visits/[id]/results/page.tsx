'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import {
  Visit,
  VisitTest,
  TestResult,
  TestTemplate,
  TestTemplateField,
  Patient,
  UserRole,
} from '@/lib/types';
import { useAutoSave } from '@/hooks/useAutoSave';

interface TestWithTemplate {
  test: VisitTest;
  testTypeInfo?: {
    id: string;
    name: string;
    category: string;
  };
  template?: TestTemplate;
  fields?: TestTemplateField[];
  results?: TestResult[];
}

interface FieldWithValue {
  fieldId: string;
  fieldName: string;
  value: string;
  unit: string | null;
  normalMin: number | null;
  normalMax: number | null;
}

interface FreeTextResult {
  testId: string;
  value: string;
}

export default function TechnicianResultsPage() {
  const params = useParams();
  const router = useRouter();
  const supabase = createClient();
  const visitId = params.id as string;

  const [visit, setVisit] = useState<Visit | null>(null);
  const [patient, setPatient] = useState<Patient | null>(null);
  const [tests, setTests] = useState<TestWithTemplate[]>([]);
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [userId, setUserId] = useState<string | null>(null);
  const [showRestoreDraft, setShowRestoreDraft] = useState(false);
  const [draftTimestamp, setDraftTimestamp] = useState<string>('');

  // Field values state: keyed by test ID
  const [fieldValues, setFieldValues] = useState<Record<string, FieldWithValue[]>>({});
  // Free text results: keyed by test ID
  const [freeTextResults, setFreeTextResults] = useState<Record<string, string>>({});

  const [isSaving, setIsSaving] = useState(false);
  const [completingTestId, setCompletingTestId] = useState<string | null>(null);
  const [submittingForReview, setSubmittingForReview] = useState(false);

  // Check user role and authorization, get user ID
  useEffect(() => {
    const checkAuthorization = async () => {
      try {
        const { data: authData } = await supabase.auth.getSession();
        if (!authData.session) {
          router.push('/login');
          return;
        }

        setUserId(authData.session.user.id);

        const { data: profileData } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', authData.session.user.id)
          .single();

        if (profileData) {
          const role = profileData.role as UserRole;
          setUserRole(role);

          // Only technician and admin can access this page
          if (role !== 'technician' && role !== 'admin') {
            setError('You do not have permission to access this page');
            setTimeout(() => router.push('/dashboard'), 2000);
          }
        }
      } catch (err) {
        console.error('Error checking authorization:', err);
        setError('Authorization check failed');
      }
    };

    checkAuthorization();
  }, [supabase, router]);

  // Initialize auto-save hook
  const autoSave = useAutoSave({
    key: `results-${visitId}`,
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
          setFieldValues(draft.fieldValues || {});
          setFreeTextResults(draft.freeTextResults || {});
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

  // Fetch visit data and tests
  useEffect(() => {
    const fetchVisitData = async () => {
      try {
        setIsLoading(true);

        // Fetch visit
        const { data: visitData, error: visitError } = await supabase
          .from('visits')
          .select('*')
          .eq('id', visitId)
          .single();

        if (visitError || !visitData) {
          setError('Visit not found');
          setIsLoading(false);
          return;
        }

        const mappedVisit: Visit = {
          id: visitData.id,
          patientId: visitData.patient_id,
          visitDate: visitData.visit_date,
          status: visitData.status as Visit['status'],
          createdBy: visitData.created_by,
          createdAt: visitData.created_at,
          updatedAt: visitData.updated_at,
        };
        setVisit(mappedVisit);

        // Fetch patient
        const { data: patientData } = await supabase
          .from('patients')
          .select('*')
          .eq('id', visitData.patient_id)
          .single();

        if (patientData) {
          const mappedPatient: Patient = {
            id: patientData.id,
            patientId: patientData.patient_id,
            firstName: patientData.first_name,
            lastName: patientData.last_name,
            dateOfBirth: patientData.date_of_birth,
            gender: patientData.gender as Patient['gender'],
            phone: patientData.phone,
            email: patientData.email,
            address: patientData.address,
            createdAt: patientData.created_at,
            updatedAt: patientData.updated_at,
            city: patientData.city,
            state: patientData.state,
            postalCode: patientData.postal_code,
            insuranceProvider: patientData.insurance_provider,
            insuranceId: patientData.insurance_id,
            emergencyContactName: patientData.emergency_contact_name,
            emergencyContactPhone: patientData.emergency_contact_phone,
            notes: patientData.notes,
            isActive: patientData.is_active,
          };
          setPatient(mappedPatient);
        }

        // Fetch visit tests with test type info
        const { data: testsData } = await supabase
          .from('visit_tests')
          .select(
            `
            id,
            visit_id,
            test_type_id,
            assigned_to,
            status,
            created_at,
            test_types (
              id,
              name,
              category
            )
          `
          )
          .eq('visit_id', visitId);

        if (testsData && testsData.length > 0) {
          const testsWithTemplates: TestWithTemplate[] = [];

          for (const testData of testsData) {
            const test: VisitTest = {
              id: testData.id,
              visitId: testData.visit_id,
              testTypeId: testData.test_type_id,
              assignedTo: testData.assigned_to,
              status: testData.status,
              createdAt: testData.created_at,
            };

            const testTypeInfo = testData.test_types
              ? {
                  id: testData.test_types.id,
                  name: testData.test_types.name,
                  category: testData.test_types.category,
                }
              : undefined;

            // Fetch template for this test type
            const { data: templateData } = await supabase
              .from('test_templates')
              .select('*')
              .eq('test_type_id', test.testTypeId)
              .single();

            let template: TestTemplate | undefined;
            let fields: TestTemplateField[] | undefined;

            if (templateData) {
              template = {
                id: templateData.id,
                testTypeId: templateData.test_type_id,
                name: templateData.name,
                createdAt: templateData.created_at,
              };

              // Fetch template fields
              const { data: fieldsData } = await supabase
                .from('test_template_fields')
                .select('*')
                .eq('template_id', templateData.id)
                .order('display_order', { ascending: true });

              if (fieldsData) {
                fields = fieldsData.map((field) => ({
                  id: field.id,
                  templateId: field.template_id,
                  fieldName: field.field_name,
                  unit: field.unit,
                  normalMin: field.normal_min,
                  normalMax: field.normal_max,
                  displayOrder: field.display_order,
                  createdAt: field.created_at,
                }));
              }
            }

            // Fetch existing results
            const { data: resultsData } = await supabase
              .from('test_results')
              .select('*')
              .eq('test_id', test.id);

            let results: TestResult[] | undefined;
            if (resultsData) {
              results = resultsData.map((result) => ({
                id: result.id,
                testId: result.test_id,
                fieldName: result.field_name,
                value: result.value,
                unit: result.unit,
                normalMin: result.normal_min,
                normalMax: result.normal_max,
                isAbnormal: result.is_abnormal,
              }));
            }

            testsWithTemplates.push({
              test,
              testTypeInfo,
              template,
              fields,
              results,
            });

            // Initialize field values from existing results
            if (fields && results) {
              const fieldValuesList: FieldWithValue[] = fields.map((field) => {
                const existingResult = results.find(
                  (r) => r.fieldName === field.fieldName
                );
                return {
                  fieldId: field.id,
                  fieldName: field.fieldName,
                  value: existingResult?.value || '',
                  unit: field.unit,
                  normalMin: field.normalMin,
                  normalMax: field.normalMax,
                };
              });
              setFieldValues((prev) => ({
                ...prev,
                [test.id]: fieldValuesList,
              }));
            } else if (results && !fields) {
              // Free text result
              const freeTextValue = results.find((r) => r.fieldName === 'result');
              setFreeTextResults((prev) => ({
                ...prev,
                [test.id]: freeTextValue?.value || '',
              }));
            }
          }

          setTests(testsWithTemplates);
        }

        setIsLoading(false);
      } catch (err) {
        console.error('Error fetching visit data:', err);
        setError('Failed to load visit data');
        setIsLoading(false);
      }
    };

    if (userRole === 'technician' || userRole === 'admin') {
      fetchVisitData();
    }
  }, [visitId, supabase, userRole]);

  // Handle field value changes
  const handleFieldChange = (testId: string, fieldIndex: number, value: string) => {
    setFieldValues((prev) => {
      const testFields = prev[testId] || [];
      const updated = [...testFields];
      updated[fieldIndex] = { ...updated[fieldIndex], value };
      return { ...prev, [testId]: updated };
    });
  };

  // Handle free text result changes
  const handleFreeTextChange = (testId: string, value: string) => {
    setFreeTextResults((prev) => ({ ...prev, [testId]: value }));
  };

  // Check if value is abnormal
  const isValueAbnormal = (
    value: string,
    normalMin: number | null,
    normalMax: number | null
  ): boolean => {
    if (!value || !normalMin || !normalMax) return false;
    const numValue = parseFloat(value);
    if (isNaN(numValue)) return false;
    return numValue < normalMin || numValue > normalMax;
  };

  // Save results for a single test
  const handleSaveResults = async (testId: string) => {
    try {
      setIsSaving(true);
      const testFields = fieldValues[testId] || [];
      const freeText = freeTextResults[testId] || '';

      if (testFields.length === 0 && !freeText) {
        setError('Please enter at least one result value');
        setIsSaving(false);
        return;
      }

      const resultsToSave = testFields
        .filter((field) => field.value.trim() !== '')
        .map((field) => ({
          test_id: testId,
          field_name: field.fieldName,
          value: field.value,
          unit: field.unit,
          normal_min: field.normalMin,
          normal_max: field.normalMax,
          is_abnormal: isValueAbnormal(field.value, field.normalMin, field.normalMax),
        }));

      if (freeText && freeText.trim() !== '') {
        resultsToSave.push({
          test_id: testId,
          field_name: 'result',
          value: freeText,
          unit: null,
          normal_min: null,
          normal_max: null,
          is_abnormal: false,
        });
      }

      // Upsert results
      for (const result of resultsToSave) {
        await supabase.from('test_results').upsert(
          [result],
          {
            onConflict: 'test_id,field_name',
          }
        );
      }

      setSuccessMessage('Results saved successfully');
      setTimeout(() => setSuccessMessage(''), 3000);

      // Auto-save after successful save
      autoSave.save({
        fieldValues,
        freeTextResults,
        savedAt: Date.now(),
      });

      setIsSaving(false);
    } catch (err) {
      console.error('Error saving results:', err);
      setError('Failed to save results');
      setIsSaving(false);
    }
  };

  // Mark test as completed
  const handleMarkComplete = async (testId: string) => {
    try {
      setCompletingTestId(testId);

      // Update test status to 'completed'
      await supabase
        .from('visit_tests')
        .update({ status: 'completed' })
        .eq('id', testId);

      // Update local state
      setTests((prev) =>
        prev.map((t) =>
          t.test.id === testId ? { ...t, test: { ...t.test, status: 'completed' } } : t
        )
      );

      setSuccessMessage('Test marked as completed');
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (err) {
      console.error('Error marking test as completed:', err);
      setError('Failed to mark test as completed');
    } finally {
      setCompletingTestId(null);
    }
  };

  // Check if all tests are completed
  const allTestsCompleted = tests.length > 0 && tests.every((t) => t.test.status === 'completed');

  // Submit for review: change visit status from 'processing' to 'review'
  const handleSubmitForReview = async () => {
    try {
      setSubmittingForReview(true);

      if (!allTestsCompleted) {
        setError('All tests must be completed before submitting for review');
        setSubmittingForReview(false);
        return;
      }

      await supabase
        .from('visits')
        .update({ status: 'review' })
        .eq('id', visitId);

      setVisit((prev) => (prev ? { ...prev, status: 'review' as Visit['status'] } : null));
      setSuccessMessage('Visit submitted for review');

      // Clear draft after successful submission
      await autoSave.discard();

      setTimeout(() => {
        router.push(`/dashboard/visits/${visitId}`);
      }, 2000);
    } catch (err) {
      console.error('Error submitting for review:', err);
      setError('Failed to submit for review');
    } finally {
      setSubmittingForReview(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <div className="mb-4">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-green-600" />
          </div>
          <p className="text-gray-600">Loading visit data...</p>
        </div>
      </div>
    );
  }

  if (error && !visit) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error}</p>
          <Link
            href="/dashboard/visits"
            className="text-green-600 hover:text-green-700 underline"
          >
            Back to Visits
          </Link>
        </div>
      </div>
    );
  }

  if (!visit || !patient) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <p className="text-gray-600">Visit or patient information not found</p>
      </div>
    );
  }

  const visitDateFormatted = new Date(visit.visitDate).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <Link
            href={`/dashboard/visits/${visitId}`}
            className="text-green-600 hover:text-green-700 text-sm font-medium mb-4 inline-block"
          >
            &larr; Back to Visit
          </Link>

          <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
            <h1 className="text-3xl font-bold text-gray-900 mb-4">
              Technician Result Entry
            </h1>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-600">Patient</p>
                <p className="text-lg font-semibold text-gray-900">
                  {patient.firstName} {patient.lastName}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Visit Date</p>
                <p className="text-lg font-semibold text-gray-900">{visitDateFormatted}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Visit Status</p>
                <p className="text-lg font-semibold">
                  <span
                    className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${
                      visit.status === 'processing'
                        ? 'bg-yellow-100 text-yellow-800'
                        : visit.status === 'review'
                          ? 'bg-blue-100 text-blue-800'
                          : visit.status === 'delivered'
                            ? 'bg-green-100 text-green-800'
                            : 'bg-gray-100 text-gray-800'
                    }`}
                  >
                    {visit.status.charAt(0).toUpperCase() + visit.status.slice(1)}
                  </span>
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Messages */}
        {showRestoreDraft && (
          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg flex items-center justify-between">
            <div>
              <p className="font-medium text-blue-900">You have an unsaved draft from {draftTimestamp}.</p>
              <p className="text-sm text-blue-700 mt-1">Your previous result entries have been restored.</p>
            </div>
            <button
              type="button"
              onClick={() => {
                autoSave.discard();
                setShowRestoreDraft(false);
                setFieldValues({});
                setFreeTextResults({});
              }}
              className="text-sm font-medium text-blue-600 hover:text-blue-700 ml-4"
            >
              Discard
            </button>
          </div>
        )}

        {successMessage && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
            <p className="text-green-800">{successMessage}</p>
          </div>
        )}

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-800">{error}</p>
          </div>
        )}

        {/* Test List */}
        {tests.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm p-6 text-center">
            <p className="text-gray-600">No tests found for this visit</p>
          </div>
        ) : (
          <div className="space-y-6">
            {tests.map((testItem) => (
              <div key={testItem.test.id} className="bg-white rounded-lg shadow-sm">
                {/* Test Header */}
                <div className="border-b border-gray-200 p-6">
                  <div className="flex items-start justify-between">
                    <div>
                      <h2 className="text-xl font-semibold text-gray-900">
                        {testItem.testTypeInfo?.name || 'Unknown Test'}
                      </h2>
                      {testItem.testTypeInfo?.category && (
                        <p className="text-sm text-gray-600 mt-1">
                          Category: {testItem.testTypeInfo.category}
                        </p>
                      )}
                    </div>
                    <div>
                      <span
                        className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${
                          testItem.test.status === 'completed'
                            ? 'bg-green-100 text-green-800'
                            : testItem.test.status === 'in_progress'
                              ? 'bg-yellow-100 text-yellow-800'
                              : 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {testItem.test.status.charAt(0).toUpperCase() +
                          testItem.test.status.slice(1)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Test Form */}
                <div className="p-6">
                  {testItem.fields && testItem.fields.length > 0 ? (
                    // Template-based form
                    <div className="space-y-6">
                      {(fieldValues[testItem.test.id] || []).map((field, index) => {
                        const isAbnormal = isValueAbnormal(
                          field.value,
                          field.normalMin,
                          field.normalMax
                        );

                        return (
                          <div key={field.fieldId} className="border-b border-gray-100 pb-6 last:border-b-0 last:pb-0">
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              {field.fieldName}
                            </label>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                              <div>
                                <input
                                  type="text"
                                  value={field.value}
                                  onChange={(e) =>
                                    handleFieldChange(
                                      testItem.test.id,
                                      index,
                                      e.target.value
                                    )
                                  }
                                  placeholder="Enter value"
                                  className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 ${
                                    isAbnormal
                                      ? 'border-red-500 bg-red-50'
                                      : 'border-gray-300'
                                  }`}
                                />
                                {isAbnormal && (
                                  <p className="text-xs text-red-600 mt-1">
                                    Value outside normal range
                                  </p>
                                )}
                              </div>

                              {field.unit && (
                                <div>
                                  <p className="text-xs text-gray-600 mb-1">Unit</p>
                                  <p className="text-sm font-medium text-gray-900 px-3 py-2">
                                    {field.unit}
                                  </p>
                                </div>
                              )}

                              {field.normalMin !== null && field.normalMax !== null && (
                                <div>
                                  <p className="text-xs text-gray-600 mb-1">Normal Range</p>
                                  <p className="text-sm font-medium text-gray-900 px-3 py-2">
                                    {field.normalMin} - {field.normalMax}
                                    {field.unit && ` ${field.unit}`}
                                  </p>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    // Free-text form
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Test Results
                      </label>
                      <textarea
                        value={freeTextResults[testItem.test.id] || ''}
                        onChange={(e) =>
                          handleFreeTextChange(testItem.test.id, e.target.value)
                        }
                        placeholder="Enter test results here"
                        rows={6}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                      />
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="mt-6 flex gap-3 items-center">
                    <button
                      onClick={() => handleSaveResults(testItem.test.id)}
                      disabled={isSaving}
                      className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition"
                    >
                      {isSaving ? 'Saving...' : 'Save Results'}
                    </button>

                    {testItem.test.status !== 'completed' && (
                      <button
                        onClick={() => handleMarkComplete(testItem.test.id)}
                        disabled={completingTestId === testItem.test.id}
                        className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition"
                      >
                        {completingTestId === testItem.test.id
                          ? 'Marking...'
                          : 'Mark Complete'}
                      </button>
                    )}

                    {autoSave.hasDraft && autoSave.lastSavedLabel && (
                      <div className="text-xs text-gray-600 whitespace-nowrap">
                        Draft saved {autoSave.lastSavedLabel}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Submit for Review Button */}
        {tests.length > 0 && (
          <div className="mt-8">
            <button
              onClick={handleSubmitForReview}
              disabled={!allTestsCompleted || submittingForReview}
              className={`w-full px-6 py-3 rounded-lg font-medium text-white transition ${
                allTestsCompleted
                  ? 'bg-green-600 hover:bg-green-700'
                  : 'bg-gray-400 cursor-not-allowed'
              } ${submittingForReview ? 'opacity-75' : ''}`}
            >
              {submittingForReview ? 'Submitting for Review...' : 'Submit All Tests for Review'}
            </button>
            {!allTestsCompleted && (
              <p className="text-sm text-gray-600 mt-2">
                Complete all tests before submitting for review
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
