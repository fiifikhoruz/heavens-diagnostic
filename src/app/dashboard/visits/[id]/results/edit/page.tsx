'use client';

import { createClient } from '@/lib/supabase/client';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

interface TestResult {
  id: string;
  test_id: string;
  field_name: string;
  value: string;
  unit: string;
  normal_min: number | null;
  normal_max: number | null;
  is_abnormal: boolean;
  test_name: string;
}

interface UserProfile {
  role: string;
  id: string;
}

export default function EditResultsPage() {
  const params = useParams();
  const router = useRouter();
  const visitId = params.id as string;

  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [newValues, setNewValues] = useState<Record<string, string>>({});
  const [revisionReason, setRevisionReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);

  const supabase = createClient();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setError('');

      // Get current user
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setError('Not authenticated');
        setLoading(false);
        return;
      }

      // Get user profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('id, role')
        .eq('id', user.id)
        .single();

      if (!profile) {
        setError('User profile not found');
        setLoading(false);
        return;
      }

      // Check role access
      if (!['technician', 'doctor', 'admin'].includes(profile.role)) {
        setError('Insufficient permissions to edit results');
        setLoading(false);
        return;
      }

      setUserProfile(profile);

      // Get test results for this visit
      const { data: results, error: resultsError } = await supabase
        .from('test_results')
        .select(
          `
          id,
          test_id,
          field_name,
          value,
          unit,
          normal_min,
          normal_max,
          is_abnormal,
          visit_tests!inner(
            visit_id,
            test_types(name)
          )
        `
        )
        .eq('visit_tests.visit_id', visitId);

      if (resultsError) {
        setError(`Failed to load results: ${resultsError.message}`);
        setLoading(false);
        return;
      }

      // Transform results
      const transformedResults: TestResult[] = (results || [])
        .map((r: any) => ({
          id: r.id,
          test_id: r.test_id,
          field_name: r.field_name,
          value: r.value,
          unit: r.unit,
          normal_min: r.normal_min,
          normal_max: r.normal_max,
          is_abnormal: r.is_abnormal,
          test_name: r.visit_tests?.test_types?.name || 'Unknown Test',
        }))
        .sort((a, b) => a.test_name.localeCompare(b.test_name));

      setTestResults(transformedResults);
      // Initialize new values with current values
      const initialNewValues: Record<string, string> = {};
      transformedResults.forEach((result) => {
        initialNewValues[result.id] = result.value;
      });
      setNewValues(initialNewValues);
    } catch (err) {
      setError(`Error loading data: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  const isAbnormal = (value: string, normalMin: number | null, normalMax: number | null): boolean => {
    if (normalMin === null && normalMax === null) return false;
    const numValue = parseFloat(value);
    if (isNaN(numValue)) return false;
    if (normalMin !== null && numValue < normalMin) return true;
    if (normalMax !== null && numValue > normalMax) return true;
    return false;
  };

  const handleValueChange = (resultId: string, newValue: string) => {
    setNewValues((prev) => ({
      ...prev,
      [resultId]: newValue,
    }));
  };

  const validateRevisionReason = (): boolean => {
    const trimmedReason = revisionReason.trim();
    return trimmedReason.length >= 5;
  };

  const handleSave = async () => {
    if (!userProfile) {
      setError('User profile not available');
      return;
    }

    if (!validateRevisionReason()) {
      setError('Revision reason must be at least 5 characters');
      return;
    }

    // Check if any values have actually changed
    const hasChanges = testResults.some(
      (result) => newValues[result.id] !== result.value
    );

    if (!hasChanges) {
      setError('No changes have been made to any results');
      return;
    }

    try {
      setSaving(true);
      setError('');
      setSuccess('');

      const revisions: any[] = [];

      // Process each result
      for (const result of testResults) {
        const newValue = newValues[result.id];

        // Only update if value changed
        if (newValue === result.value) continue;

        const oldIsAbnormal = result.is_abnormal;
        const newIsAbnormal = isAbnormal(newValue, result.normal_min, result.normal_max);

        // Update the test result
        const { error: updateError } = await supabase
          .from('test_results')
          .update({
            value: newValue as string,
            is_abnormal: newIsAbnormal,
            updated_at: new Date().toISOString(),
          } as any)
          .eq('id', result.id);

        if (updateError) {
          throw new Error(`Failed to update result: ${updateError.message}`);
        }

        // Prepare revision record
        revisions.push({
          result_id: result.id,
          test_id: result.test_id,
          field_name: result.field_name,
          old_value: result.value,
          new_value: newValue,
          old_is_abnormal: oldIsAbnormal,
          new_is_abnormal: newIsAbnormal,
          changed_by: userProfile.id,
          reason: revisionReason.trim(),
          created_at: new Date().toISOString(),
        });
      }

      // Insert all revisions
      if (revisions.length > 0) {
        const { error: revisionError } = await (supabase as any)
          .from('result_revisions')
          .insert(revisions);

        if (revisionError) {
          throw new Error(`Failed to save revisions: ${revisionError.message}`);
        }
      }

      setSuccess(`Successfully saved ${revisions.length} revision(s)`);
      setTimeout(() => {
        router.push(`/dashboard/visits/${visitId}`);
      }, 2000);
    } catch (err) {
      setError(`Error saving changes: ${err}`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading test results...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Edit Test Results</h1>
          <p className="text-gray-600">Review and update test results. Changes will be tracked.</p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-800">{error}</p>
          </div>
        )}

        {success && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
            <p className="text-green-800">{success}</p>
          </div>
        )}

        {testResults.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <p className="text-gray-600">No test results found for this visit.</p>
          </div>
        ) : (
          <>
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <div className="divide-y">
                {testResults.map((result) => {
                  const newValue = newValues[result.id];
                  const newIsAbnormal = isAbnormal(
                    newValue,
                    result.normal_min,
                    result.normal_max
                  );
                  const valueChanged = newValue !== result.value;

                  return (
                    <div key={result.id} className="p-6 hover:bg-gray-50 transition">
                      <div className="mb-4">
                        <h3 className="text-lg font-semibold text-gray-900">
                          {result.test_name}
                        </h3>
                        <p className="text-sm text-gray-500">{result.field_name}</p>
                      </div>

                      <div className="grid grid-cols-2 gap-6 mb-4">
                        {/* Current Value */}
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Current Value
                          </label>
                          <div
                            className={`p-3 rounded border flex items-center justify-between ${
                              result.is_abnormal
                                ? 'bg-red-50 border-red-200'
                                : 'bg-gray-50 border-gray-200'
                            }`}
                          >
                            <span className="font-mono text-gray-900">{result.value}</span>
                            {result.is_abnormal && (
                              <span className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded">
                                Abnormal
                              </span>
                            )}
                          </div>
                          {result.unit && (
                            <p className="text-xs text-gray-500 mt-1">Unit: {result.unit}</p>
                          )}
                          {(result.normal_min !== null || result.normal_max !== null) && (
                            <p className="text-xs text-gray-500 mt-1">
                              Normal range:{' '}
                              {result.normal_min !== null ? result.normal_min : '—'} to{' '}
                              {result.normal_max !== null ? result.normal_max : '—'}
                            </p>
                          )}
                        </div>

                        {/* New Value Input */}
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            New Value
                          </label>
                          <input
                            type="text"
                            value={newValue}
                            onChange={(e) => handleValueChange(result.id, e.target.value)}
                            className={`w-full p-3 rounded border font-mono ${
                              newIsAbnormal
                                ? 'bg-red-50 border-red-300 focus:ring-red-500'
                                : 'bg-white border-gray-300 focus:ring-green-500'
                            } focus:outline-none focus:ring-2 focus:border-transparent`}
                          />
                          {newIsAbnormal && (
                            <span className="text-xs text-red-700 mt-1 block">
                              This value is outside normal range
                            </span>
                          )}
                          {valueChanged && (
                            <span className="text-xs text-green-700 font-medium mt-1 block">
                              ✓ Changed
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Revision Reason */}
            <div className="bg-white rounded-lg shadow p-6 mt-6">
              <label className="block text-sm font-semibold text-gray-900 mb-2">
                Reason for revision <span className="text-red-600">*</span> (required)
              </label>
              <textarea
                value={revisionReason}
                onChange={(e) => setRevisionReason(e.target.value)}
                placeholder="Explain why these results are being revised (minimum 5 characters)..."
                className={`w-full h-32 p-4 rounded border focus:outline-none focus:ring-2 focus:border-transparent ${
                  revisionReason.trim().length >= 5
                    ? 'border-green-300 focus:ring-green-500 bg-white'
                    : 'border-gray-300 focus:ring-green-500 bg-white'
                }`}
              />
              <div className="mt-2 text-sm text-gray-600">
                {revisionReason.length} characters
                {revisionReason.trim().length >= 5 ? (
                  <span className="text-green-600 ml-2">✓ Valid</span>
                ) : (
                  <span className="text-red-600 ml-2">
                    ({5 - revisionReason.trim().length} more required)
                  </span>
                )}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-4 mt-8">
              <button
                onClick={handleSave}
                disabled={saving || !validateRevisionReason()}
                className={`px-6 py-3 rounded-lg font-semibold transition ${
                  saving || !validateRevisionReason()
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-green-600 text-white hover:bg-green-700'
                }`}
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
              <button
                onClick={() => router.back()}
                disabled={saving}
                className="px-6 py-3 rounded-lg font-semibold bg-gray-200 text-gray-900 hover:bg-gray-300 transition disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
