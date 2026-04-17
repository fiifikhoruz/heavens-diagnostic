'use client';

import { createClient } from '@/lib/supabase/client';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';

interface RevisionRecord {
  id: string;
  result_id: string;
  test_id: string;
  field_name: string;
  old_value: string;
  new_value: string;
  old_is_abnormal: boolean;
  new_is_abnormal: boolean;
  changed_by: string;
  reason: string;
  created_at: string;
  test_name: string;
  changed_by_name: string;
  changed_by_role: string;
}

interface FilterOptions {
  testId: string;
  changedById: string;
  dateFrom: string;
  dateTo: string;
}

export default function RevisionsPage() {
  const params = useParams();
  const visitId = params.id as string;

  const [revisions, setRevisions] = useState<RevisionRecord[]>([]);
  const [filteredRevisions, setFilteredRevisions] = useState<RevisionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState<FilterOptions>({
    testId: '',
    changedById: '',
    dateFrom: '',
    dateTo: '',
  });
  const [uniqueTests, setUniqueTests] = useState<Array<{ id: string; name: string }>>([]);
  const [uniqueUsers, setUniqueUsers] = useState<
    Array<{ id: string; name: string; role: string }>
  >([]);

  const supabase = createClient();

  useEffect(() => {
    loadRevisions();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [revisions, filters]);

  const loadRevisions = async () => {
    try {
      setLoading(true);
      setError('');

      // Get current user for auth check
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setError('Not authenticated');
        setLoading(false);
        return;
      }

      // Get all revisions for tests in this visit
      const { data: revisionData, error: revisionError } = await (supabase as any)
        .from('result_revisions')
        .select(
          `
          id,
          result_id,
          test_id,
          field_name,
          old_value,
          new_value,
          old_is_abnormal,
          new_is_abnormal,
          changed_by,
          reason,
          created_at,
          visit_tests:visit_tests(id, test_types(id, name)),
          profiles:changed_by(id, full_name, role)
        `
        )
        .eq('visit_tests.visit_id', visitId)
        .order('created_at', { ascending: false });

      if (revisionError) {
        setError(`Failed to load revisions: ${revisionError.message}`);
        setLoading(false);
        return;
      }

      // Transform revision data
      const transformedRevisions: RevisionRecord[] = (revisionData || [])
        .map((r: any) => ({
          id: r.id,
          result_id: r.result_id,
          test_id: r.test_id,
          field_name: r.field_name,
          old_value: r.old_value,
          new_value: r.new_value,
          old_is_abnormal: r.old_is_abnormal,
          new_is_abnormal: r.new_is_abnormal,
          changed_by: r.changed_by,
          reason: r.reason,
          created_at: r.created_at,
          test_name: r.visit_tests?.test_types?.name || 'Unknown Test',
          changed_by_name: r.profiles?.full_name || 'Unknown User',
          changed_by_role: r.profiles?.role || 'Unknown Role',
        }))
        .sort(
          (a: RevisionRecord, b: RevisionRecord) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );

      setRevisions(transformedRevisions);

      // Extract unique tests and users for filters
      const testsMap = new Map<string, string>();
      const usersMap = new Map<string, { name: string; role: string }>();

      transformedRevisions.forEach((rev) => {
        testsMap.set(rev.test_id, rev.test_name);
        usersMap.set(rev.changed_by, {
          name: rev.changed_by_name,
          role: rev.changed_by_role,
        });
      });

      setUniqueTests(
        Array.from(testsMap.entries()).map(([id, name]) => ({ id, name }))
      );
      setUniqueUsers(
        Array.from(usersMap.entries()).map(([id, data]) => ({
          id,
          name: data.name,
          role: data.role,
        }))
      );
    } catch (err) {
      setError(`Error loading revisions: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    let filtered = [...revisions];

    if (filters.testId) {
      filtered = filtered.filter((r) => r.test_id === filters.testId);
    }

    if (filters.changedById) {
      filtered = filtered.filter((r) => r.changed_by === filters.changedById);
    }

    if (filters.dateFrom) {
      const fromDate = new Date(filters.dateFrom);
      filtered = filtered.filter((r) => new Date(r.created_at) >= fromDate);
    }

    if (filters.dateTo) {
      const toDate = new Date(filters.dateTo);
      toDate.setHours(23, 59, 59, 999);
      filtered = filtered.filter((r) => new Date(r.created_at) <= toDate);
    }

    setFilteredRevisions(filtered);
  };

  const handleFilterChange = (key: keyof FilterOptions, value: string) => {
    setFilters((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const hasActiveFilters = () => {
    return Object.values(filters).some((v) => v !== '');
  };

  const clearFilters = () => {
    setFilters({
      testId: '',
      changedById: '',
      dateFrom: '',
      dateTo: '',
    });
  };

  const exportToClipboard = () => {
    if (filteredRevisions.length === 0) {
      alert('No revisions to export');
      return;
    }

    const headers = [
      'Date/Time',
      'Changed By',
      'Role',
      'Test',
      'Field',
      'Old Value',
      'New Value',
      'Abnormal Change',
      'Reason',
    ];

    const rows = filteredRevisions.map((rev) => {
      const abnormalStatus = rev.old_is_abnormal !== rev.new_is_abnormal
        ? rev.new_is_abnormal
          ? '✓ Now abnormal'
          : '✓ Now normal'
        : '—';

      return [
        new Date(rev.created_at).toLocaleString(),
        rev.changed_by_name,
        rev.changed_by_role,
        rev.test_name,
        rev.field_name,
        rev.old_value,
        rev.new_value,
        abnormalStatus,
        rev.reason,
      ];
    });

    const csvContent = [
      headers.join('\t'),
      ...rows.map((row) => row.join('\t')),
    ].join('\n');

    navigator.clipboard.writeText(csvContent).then(() => {
      alert('Revision history copied to clipboard');
    });
  };

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading revision history...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Revision History</h1>
          <p className="text-gray-600">
            Track all changes made to test results for this visit
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-800">{error}</p>
          </div>
        )}

        {/* Filters */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Filters</h2>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
            {/* Test Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Test
              </label>
              <select
                value={filters.testId}
                onChange={(e) => handleFilterChange('testId', e.target.value)}
                className="w-full p-2 rounded border border-gray-300 focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                <option value="">All Tests</option>
                {uniqueTests.map((test) => (
                  <option key={test.id} value={test.id}>
                    {test.name}
                  </option>
                ))}
              </select>
            </div>

            {/* User Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Changed By
              </label>
              <select
                value={filters.changedById}
                onChange={(e) => handleFilterChange('changedById', e.target.value)}
                className="w-full p-2 rounded border border-gray-300 focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                <option value="">All Users</option>
                {uniqueUsers.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name} ({user.role})
                  </option>
                ))}
              </select>
            </div>

            {/* Date From Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                From Date
              </label>
              <input
                type="date"
                value={filters.dateFrom}
                onChange={(e) => handleFilterChange('dateFrom', e.target.value)}
                className="w-full p-2 rounded border border-gray-300 focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>

            {/* Date To Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                To Date
              </label>
              <input
                type="date"
                value={filters.dateTo}
                onChange={(e) => handleFilterChange('dateTo', e.target.value)}
                className="w-full p-2 rounded border border-gray-300 focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
          </div>

          {hasActiveFilters() && (
            <button
              onClick={clearFilters}
              className="text-sm text-green-600 hover:text-green-700 font-medium"
            >
              Clear Filters
            </button>
          )}
        </div>

        {/* Export Button */}
        {revisions.length > 0 && (
          <div className="mb-6 flex justify-end">
            <button
              onClick={exportToClipboard}
              className="px-4 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition"
            >
              Export to Clipboard
            </button>
          </div>
        )}

        {/* Revisions List */}
        {filteredRevisions.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <p className="text-gray-600">
              {revisions.length === 0
                ? 'No revisions found for this visit.'
                : 'No revisions match the selected filters.'}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredRevisions.map((revision, idx) => {
              const abnormalChanged =
                revision.old_is_abnormal !== revision.new_is_abnormal;

              return (
                <div
                  key={revision.id}
                  className="bg-white rounded-lg shadow hover:shadow-md transition overflow-hidden"
                >
                  <div className="p-6">
                    {/* Header Row */}
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-semibold text-green-600">
                            {formatDate(revision.created_at)}
                          </span>
                          {abnormalChanged && (
                            <span
                              className={`text-xs px-2 py-1 rounded font-medium ${
                                revision.new_is_abnormal
                                  ? 'bg-red-100 text-red-700'
                                  : 'bg-green-100 text-green-700'
                              }`}
                            >
                              {revision.new_is_abnormal
                                ? 'Abnormal'
                                : 'Normal'}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-600">
                          <span className="font-medium">{revision.test_name}</span>
                          {' • '}
                          <span>{revision.field_name}</span>
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium text-gray-900">
                          {revision.changed_by_name}
                        </p>
                        <p className="text-xs text-gray-500">
                          {revision.changed_by_role}
                        </p>
                      </div>
                    </div>

                    {/* Value Change */}
                    <div className="mb-4 p-4 bg-gray-50 rounded">
                      <p className="text-xs font-semibold text-gray-700 mb-2 uppercase">
                        Result Change
                      </p>
                      <div className="flex items-center gap-3">
                        <div className="flex-1">
                          <p className="text-xs text-gray-600 mb-1">Old Value</p>
                          <p className="text-sm font-mono line-through text-red-600">
                            {revision.old_value}
                          </p>
                          {revision.old_is_abnormal && (
                            <span className="text-xs text-red-600">
                              (was abnormal)
                            </span>
                          )}
                        </div>
                        <span className="text-gray-400 text-lg">→</span>
                        <div className="flex-1">
                          <p className="text-xs text-gray-600 mb-1">New Value</p>
                          <p className="text-sm font-mono font-semibold text-green-600">
                            {revision.new_value}
                          </p>
                          {revision.new_is_abnormal && (
                            <span className="text-xs text-red-600">
                              (now abnormal)
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Reason */}
                    <div>
                      <p className="text-xs font-semibold text-gray-700 mb-2 uppercase">
                        Reason
                      </p>
                      <p className="text-sm text-gray-700 italic">
                        "{revision.reason}"
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Summary */}
        {revisions.length > 0 && (
          <div className="mt-8 text-center text-sm text-gray-600">
            <p>
              Showing {filteredRevisions.length} of {revisions.length} revision
              {revisions.length !== 1 ? 's' : ''}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
