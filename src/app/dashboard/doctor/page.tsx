'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface Stats {
  awaiting_review: number;
  abnormal_cases: number;
  approved_today: number;
  total_pending: number;
}

interface CaseForReview {
  id: string;
  patient_id: string;
  patient_first_name: string;
  patient_last_name: string;
  patient_phone: string | null;
  visit_date: string;
  status: string;
  test_count: number;
  test_names: string[];
  has_abnormal: boolean;
  created_at: string;
  updated_at: string;
}

interface RecentApproval {
  id: string;
  patient_first_name: string;
  patient_last_name: string;
  visit_date: string;
  approved_at: string;
}

interface UserProfile {
  id: string;
  role: string;
  full_name: string | null;
}

export default function DoctorDashboard() {
  const router = useRouter();
  const supabase = createClient();

  const [stats, setStats] = useState<Stats>({
    awaiting_review: 0,
    abnormal_cases: 0,
    approved_today: 0,
    total_pending: 0,
  });
  const [casesForReview, setCasesForReview] = useState<CaseForReview[]>([]);
  const [recentApprovals, setRecentApprovals] = useState<RecentApproval[]>([]);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [noteContent, setNoteContent] = useState('');
  const [noteVisitId, setNoteVisitId] = useState('');
  const [isAddingNote, setIsAddingNote] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCaseIds, setSelectedCaseIds] = useState<Set<string>>(new Set());
  const [selectAllChecked, setSelectAllChecked] = useState(false);
  const [approvingBulk, setApprovingBulk] = useState(false);

  // Profile fetch — always clears `loading` on completion so we never spin forever.
  useEffect(() => {
    let cancelled = false;
    async function fetchUserProfile() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          router.push('/login');
          return;
        }

        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('id, role, full_name')
          .eq('id', user.id)
          .single();

        if (profileError) throw profileError;

        if (!['doctor', 'admin'].includes(profile.role)) {
          router.push('/dashboard');
          return;
        }

        if (!cancelled) setUserProfile(profile);
      } catch (err) {
        if (!cancelled) {
          setError('Failed to load your profile. Please retry.');
          setLoading(false); // critical: don't leave the spinner on forever
        }
        console.error('Profile error:', err);
      }
    }

    fetchUserProfile();
    return () => {
      cancelled = true;
    };
  }, [router, supabase]);

  const fetchDashboardData = useCallback(async (opts: { showSpinner?: boolean } = {}) => {
    if (!userProfile) return;
    try {
      if (opts.showSpinner) setLoading(true);

      const { data: casesData, error: casesError } = await supabase
        .from('visits')
        .select(
          `
          id,
          patient_id,
          visit_date,
          status,
          created_at,
          updated_at,
          patients!inner(first_name, last_name, phone),
          visit_tests!inner(
            id,
            test_type_id,
            status,
            test_types!inner(name),
            test_results(is_abnormal)
          )
        `
        )
        .in('status', ['review', 'processing'])
        .order('created_at', { ascending: false });

      if (casesError) throw casesError;

      const processedCases: CaseForReview[] = (casesData || [])
        .map((visit: any) => {
          const hasAbnormal = (visit.visit_tests || []).some((test: any) =>
            (test.test_results || []).some((result: any) => result.is_abnormal)
          );
          return {
            id: visit.id,
            patient_id: visit.patient_id,
            patient_first_name: visit.patients.first_name,
            patient_last_name: visit.patients.last_name,
            patient_phone: visit.patients.phone || null,
            visit_date: visit.visit_date,
            status: visit.status,
            test_count: (visit.visit_tests || []).length,
            test_names: (visit.visit_tests || []).map((t: any) => t.test_types.name),
            has_abnormal: hasAbnormal,
            created_at: visit.created_at,
            updated_at: visit.updated_at,
          };
        })
        .sort((a: CaseForReview, b: CaseForReview) => {
          if (a.has_abnormal && !b.has_abnormal) return -1;
          if (!a.has_abnormal && b.has_abnormal) return 1;
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        });

      setCasesForReview(processedCases);

      const today = new Date().toISOString().split('T')[0];

      const abnormalCases = processedCases.filter((c) => c.has_abnormal).length;

      const { data: approvedTodayData, error: approvedError } = await supabase
        .from('visits')
        .select('id')
        .eq('status', 'approved')
        .gte('created_at', `${today}T00:00:00`)
        .lt('created_at', `${today}T23:59:59`);

      if (approvedError) throw approvedError;
      const approvedToday = (approvedTodayData || []).length;

      const { data: totalPendingData, error: pendingError } = await supabase
        .from('visits')
        .select('id')
        .in('status', ['review', 'processing']);

      if (pendingError) throw pendingError;
      const totalPending = (totalPendingData || []).length;

      setStats({
        awaiting_review: processedCases.filter((c) => c.status === 'review').length,
        abnormal_cases: abnormalCases,
        approved_today: approvedToday,
        total_pending: totalPending,
      });

      const { data: approvalsData, error: approvalsError } = await supabase
        .from('visits')
        .select(
          `
          id,
          visit_date,
          created_at,
          patients(first_name, last_name)
        `
        )
        .eq('status', 'approved')
        .order('created_at', { ascending: false })
        .limit(10);

      if (approvalsError) throw approvalsError;

      const processedApprovals: RecentApproval[] = (approvalsData || []).map(
        (visit: any) => ({
          id: visit.id,
          patient_first_name: visit.patients.first_name,
          patient_last_name: visit.patients.last_name,
          visit_date: visit.visit_date,
          approved_at: visit.created_at,
        })
      );

      setRecentApprovals(processedApprovals);
      setError(null);
    } catch (err) {
      setError('Failed to load dashboard data. Please retry.');
      console.error('Dashboard error:', err);
    } finally {
      if (opts.showSpinner) setLoading(false);
    }
  }, [userProfile, supabase]);

  // Initial load + 10s polling for live updates
  useEffect(() => {
    if (!userProfile) return;
    fetchDashboardData({ showSpinner: true });
    const interval = setInterval(() => fetchDashboardData(), 10_000);
    return () => clearInterval(interval);
  }, [userProfile, fetchDashboardData]);

  const handleToggleSelect = (caseId: string) => {
    const newSelected = new Set(selectedCaseIds);
    if (newSelected.has(caseId)) {
      newSelected.delete(caseId);
    } else {
      newSelected.add(caseId);
    }
    setSelectedCaseIds(newSelected);
    setSelectAllChecked(newSelected.size === casesForReview.length);
  };

  const handleSelectAll = () => {
    if (selectAllChecked) {
      setSelectedCaseIds(new Set());
      setSelectAllChecked(false);
    } else {
      const allIds = new Set(casesForReview.map(c => c.id));
      setSelectedCaseIds(allIds);
      setSelectAllChecked(true);
    }
  };

  const handleApproveSelected = async () => {
    if (selectedCaseIds.size === 0) return;
    setApprovingBulk(true);
    try {
      const visitIdArray = Array.from(selectedCaseIds);
      const { error } = await supabase
        .from('visits')
        .update({ status: 'approved' })
        .in('id', visitIdArray);

      if (error) throw error;

      const approvedCount = visitIdArray.length;
      setCasesForReview((prev) => prev.filter((c) => !visitIdArray.includes(c.id)));
      setSelectedCaseIds(new Set());
      setSelectAllChecked(false);
      setStats((prev) => ({
        ...prev,
        awaiting_review: Math.max(0, prev.awaiting_review - approvedCount),
        total_pending: Math.max(0, prev.total_pending - approvedCount),
      }));
    } catch (err) {
      setError('Failed to approve cases');
      console.error('Bulk approve error:', err);
    } finally {
      setApprovingBulk(false);
    }
  };

  const handleApprove = async (visitId: string) => {
    try {
      const { error } = await supabase
        .from('visits')
        .update({ status: 'approved' })
        .eq('id', visitId);

      if (error) throw error;

      setCasesForReview((prev) => prev.filter((c) => c.id !== visitId));
      setStats((prev) => ({
        ...prev,
        awaiting_review: Math.max(0, prev.awaiting_review - 1),
        total_pending: Math.max(0, prev.total_pending - 1),
      }));
    } catch (err) {
      setError('Failed to approve case');
      console.error('Approve error:', err);
    }
  };

  const handleRequestRetest = async (visitId: string) => {
    try {
      const { error } = await supabase
        .from('visits')
        .update({ status: 'processing' })
        .eq('id', visitId);

      if (error) throw error;

      setCasesForReview((prev) =>
        prev.map((c) =>
          c.id === visitId ? { ...c, status: 'processing' } : c
        )
      );
    } catch (err) {
      setError('Failed to request retest');
      console.error('Retest error:', err);
    }
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteContent.trim() || !noteVisitId.trim() || !userProfile) {
      setError('Please fill in all fields');
      return;
    }

    try {
      setIsAddingNote(true);
      const { error } = await supabase.from('doctor_notes').insert({
        visit_id: noteVisitId,
        doctor_id: userProfile.id,
        notes: noteContent,
        created_at: new Date().toISOString(),
      });

      if (error) throw error;

      setNoteContent('');
      setNoteVisitId('');
      setError(null);
    } catch (err) {
      setError('Failed to add note');
      console.error('Note error:', err);
    } finally {
      setIsAddingNote(false);
    }
  };

  // Blocking error state — show a clear fallback instead of spinning forever
  if (error && !userProfile) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-md bg-red-50 border border-red-200 rounded-lg p-6 text-center">
          <p className="text-red-800 font-semibold mb-2">Something went wrong</p>
          <p className="text-red-700 text-sm mb-4">{error}</p>
          <button
            onClick={() => {
              setError(null);
              setLoading(true);
              window.location.reload();
            }}
            className="px-4 py-2 bg-red-600 text-white font-medium rounded-lg hover:bg-red-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg text-gray-600">Loading dashboard...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Doctor Dashboard</h1>
          <p className="text-gray-600 mt-2">
            Welcome, {userProfile?.full_name || 'Doctor'}. Review and approve patient results below.
            <span className="ml-2 text-xs text-gray-400">· refreshes every 10s</span>
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start justify-between gap-4">
            <p className="text-red-700">{error}</p>
            <div className="flex gap-2 shrink-0">
              <button
                onClick={() => fetchDashboardData({ showSpinner: true })}
                className="text-red-900 font-medium underline"
              >
                Retry
              </button>
              <button onClick={() => setError(null)} className="text-red-900 font-medium underline">
                Dismiss
              </button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-gray-600 text-sm font-medium">Awaiting Review</div>
            <div className="text-3xl font-bold text-green-600 mt-2">{stats.awaiting_review}</div>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-gray-600 text-sm font-medium">Abnormal Cases</div>
            <div className="text-3xl font-bold text-red-600 mt-2">{stats.abnormal_cases}</div>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-gray-600 text-sm font-medium">Approved Today</div>
            <div className="text-3xl font-bold text-green-600 mt-2">{stats.approved_today}</div>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-gray-600 text-sm font-medium">Total Pending</div>
            <div className="text-3xl font-bold text-blue-600 mt-2">{stats.total_pending}</div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            <div className="bg-white rounded-lg shadow">
              <div className="border-b border-gray-200 px-6 py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">Cases Needing Review</h2>
                    <p className="text-sm text-gray-600 mt-1">
                      {casesForReview.length} cases awaiting action
                    </p>
                  </div>
                  {selectedCaseIds.size > 0 && (
                    <button
                      onClick={handleApproveSelected}
                      disabled={approvingBulk}
                      className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white font-medium rounded-lg transition"
                    >
                      {approvingBulk ? 'Approving...' : `Approve Selected (${selectedCaseIds.size})`}
                    </button>
                  )}
                </div>
              </div>

              {casesForReview.length === 0 ? (
                <div className="px-6 py-12 text-center">
                  <p className="text-gray-600">All caught up! No cases pending review.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                          <input
                            type="checkbox"
                            checked={selectAllChecked}
                            onChange={handleSelectAll}
                            className="rounded border-gray-300"
                            aria-label="Select all cases"
                          />
                        </th>
                        <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                          Patient
                        </th>
                        <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                          Visit Date
                        </th>
                        <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                          Tests
                        </th>
                        <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                          Status
                        </th>
                        <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {casesForReview.map((caseItem) => {
                        const hoursInReview = (Date.now() - new Date(caseItem.updated_at).getTime()) / (1000 * 60 * 60);
                        const isSlow = hoursInReview > 4;

                        return (
                          <tr key={caseItem.id} className={`hover:bg-gray-50 ${isSlow ? 'bg-yellow-50' : ''}`}>
                            <td className="px-6 py-4">
                              <input
                                type="checkbox"
                                checked={selectedCaseIds.has(caseItem.id)}
                                onChange={() => handleToggleSelect(caseItem.id)}
                                className="rounded border-gray-300"
                              />
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-3">
                                <div className="flex flex-col gap-1">
                                  {caseItem.has_abnormal && (
                                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800 w-fit">
                                      ABNORMAL
                                    </span>
                                  )}
                                  <p className="font-medium text-gray-900">
                                    {caseItem.patient_first_name} {caseItem.patient_last_name}
                                  </p>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-700">
                              {new Date(caseItem.visit_date).toLocaleDateString()}
                            </td>
                            <td className="px-6 py-4">
                              <div className="text-sm">
                                <p className="font-medium text-gray-900">{caseItem.test_count} test(s)</p>
                                <p className="text-gray-600 text-xs mt-1">
                                  {caseItem.test_names.slice(0, 2).join(', ')}
                                  {caseItem.test_names.length > 2 && ` +${caseItem.test_names.length - 2}`}
                                </p>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex flex-col gap-1">
                                <span
                                  className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium w-fit ${
                                    caseItem.status === 'review'
                                      ? 'bg-yellow-100 text-yellow-800'
                                      : 'bg-blue-100 text-blue-800'
                                  }`}
                                >
                                  {caseItem.status === 'review' ? 'Review' : 'Processing'}
                                </span>
                                {isSlow && (
                                  <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-yellow-500 text-white w-fit">
                                    SLOW
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex gap-2 flex-wrap">
                                <Link
                                  href={`/dashboard/visits/${caseItem.id}`}
                                  className="px-3 py-1 bg-green-600 text-white text-sm rounded hover:bg-green-700 transition"
                                >
                                  Review
                                </Link>
                                <button
                                  onClick={() => handleApprove(caseItem.id)}
                                  className="px-3 py-1 bg-green-600 text-white text-sm rounded hover:bg-green-700 transition"
                                >
                                  Approve
                                </button>
                                <button
                                  onClick={() => handleRequestRetest(caseItem.id)}
                                  className="px-3 py-1 bg-orange-600 text-white text-sm rounded hover:bg-orange-700 transition"
                                >
                                  Retest
                                </button>
                                {caseItem.patient_phone && (
                                  <a
                                    href={`tel:${caseItem.patient_phone}`}
                                    className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition"
                                  >
                                    Call
                                  </a>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-8">
            <div className="bg-white rounded-lg shadow">
              <div className="border-b border-gray-200 px-6 py-4">
                <h3 className="text-lg font-bold text-gray-900">Recent Approvals</h3>
                <p className="text-sm text-gray-600 mt-1">Last 10 approved cases</p>
              </div>

              {recentApprovals.length === 0 ? (
                <div className="px-6 py-8 text-center">
                  <p className="text-sm text-gray-600">No recent approvals</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-200">
                  {recentApprovals.map((approval) => (
                    <div key={approval.id} className="px-6 py-3 hover:bg-gray-50">
                      <p className="font-medium text-sm text-gray-900">
                        {approval.patient_first_name} {approval.patient_last_name}
                      </p>
                      <p className="text-xs text-gray-600 mt-1">
                        {new Date(approval.visit_date).toLocaleDateString()}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white rounded-lg shadow">
              <div className="border-b border-gray-200 px-6 py-4">
                <h3 className="text-lg font-bold text-gray-900">Add Doctor Note</h3>
                <p className="text-sm text-gray-600 mt-1">Quick note entry</p>
              </div>

              <form onSubmit={handleAddNote} className="p-6 space-y-4">
                <div>
                  <label htmlFor="visitId" className="block text-sm font-medium text-gray-700 mb-1">
                    Visit ID
                  </label>
                  <input
                    id="visitId"
                    type="text"
                    value={noteVisitId}
                    onChange={(e) => setNoteVisitId(e.target.value)}
                    placeholder="Enter visit ID"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-600"
                  />
                </div>

                <div>
                  <label htmlFor="noteContent" className="block text-sm font-medium text-gray-700 mb-1">
                    Note
                  </label>
                  <textarea
                    id="noteContent"
                    value={noteContent}
                    onChange={(e) => setNoteContent(e.target.value)}
                    placeholder="Enter doctor notes..."
                    rows={4}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-600"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isAddingNote}
                  className="w-full px-4 py-2 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 transition disabled:bg-gray-400"
                >
                  {isAddingNote ? 'Adding...' : 'Add Note'}
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
