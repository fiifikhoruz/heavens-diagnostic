'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { UserRole } from '@/lib/types';

interface QueueItem {
  testId: string;
  visitId: string;
  testTypeId: string;
  assignedTo: string | null;
  testStatus: string;
  testCreatedAt: string;
  visitStatus: string;
  visitDate: string;
  patientId: string;
  patientFirstName: string;
  patientLastName: string;
  patientPhone: string | null;
  testName: string;
  testCategory: string;
  paymentStatus: string | null;
  turnaroundHours: number;
}

export default function TechnicianQueuePage() {
  const supabase = createClient();
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [filteredQueue, setFilteredQueue] = useState<QueueItem[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [assignmentFilter, setAssignmentFilter] = useState<string>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [technicians, setTechnicians] = useState<{ id: string; fullName: string }[]>([]);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [selectedTestIds, setSelectedTestIds] = useState<Set<string>>(new Set());
  const [selectAllChecked, setSelectAllChecked] = useState(false);

  // Extracted so we can call it from the poll interval without resetting isLoading
  const fetchQueue = useCallback(async (opts: { showSpinner?: boolean } = {}) => {
    try {
      if (opts.showSpinner) setIsLoading(true);

      const { data: authData } = await supabase.auth.getSession();
      if (!authData.session) return;

      setUserId(authData.session.user.id);

      const { data: profileData } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', authData.session.user.id)
        .single();

      if (profileData) {
        setUserRole(profileData.role as UserRole);
      }

      const { data: techData } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('role', ['technician', 'admin'])
        .eq('is_active', true);

      if (techData) {
        setTechnicians((techData as any[]).map(t => ({
          id: t.id,
          fullName: t.full_name || 'Unknown',
        })));
      }

      const { data: testsData, error: testsError } = await supabase
        .from('visit_tests')
        .select(`
          id,
          visit_id,
          test_type_id,
          assigned_to,
          status,
          created_at,
          visits!inner (
            id,
            status,
            visit_date,
            patient_id,
            patients!inner (
              first_name,
              last_name,
              phone
            )
          ),
          test_types!inner (
            name,
            category,
            turnaround_hours
          )
        `)
        .in('status', ['pending', 'in_progress'])
        .order('created_at', { ascending: true });

      if (testsError) {
        console.error('Queue fetch error:', testsError);
        setError('Failed to load technician queue. Please retry.');
        return;
      }

      if (testsData) {
        const mapped: QueueItem[] = (testsData as any[]).map(t => ({
          testId: t.id,
          visitId: t.visit_id,
          testTypeId: t.test_type_id,
          assignedTo: t.assigned_to,
          testStatus: t.status,
          testCreatedAt: t.created_at,
          visitStatus: t.visits?.status || '',
          visitDate: t.visits?.visit_date || '',
          patientId: t.visits?.patient_id || '',
          patientFirstName: t.visits?.patients?.first_name || '',
          patientLastName: t.visits?.patients?.last_name || '',
          patientPhone: t.visits?.patients?.phone || null,
          testName: t.test_types?.name || '',
          testCategory: t.test_types?.category || '',
          paymentStatus: null,
          turnaroundHours: t.test_types?.turnaround_hours || 24,
        }));
        setQueue(mapped);
        setFilteredQueue(mapped);
        setError('');
      }
    } catch (err) {
      console.error('Error loading queue:', err);
      setError('Failed to load queue data. Please retry.');
    } finally {
      if (opts.showSpinner) setIsLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    fetchQueue({ showSpinner: true });
    const interval = setInterval(() => fetchQueue(), 10_000);
    return () => clearInterval(interval);
  }, [fetchQueue]);

  useEffect(() => {
    let filtered = [...queue];

    if (statusFilter !== 'all') {
      filtered = filtered.filter(item => item.testStatus === statusFilter);
    }

    if (assignmentFilter === 'mine' && userId) {
      filtered = filtered.filter(item => item.assignedTo === userId);
    } else if (assignmentFilter === 'unassigned') {
      filtered = filtered.filter(item => !item.assignedTo);
    }

    filtered.sort((a, b) => {
      const hoursElapsedA = (Date.now() - new Date(a.testCreatedAt).getTime()) / (1000 * 60 * 60);
      const isOverdueA = hoursElapsedA > a.turnaroundHours;

      const hoursElapsedB = (Date.now() - new Date(b.testCreatedAt).getTime()) / (1000 * 60 * 60);
      const isOverdueB = hoursElapsedB > b.turnaroundHours;

      if (isOverdueA && !isOverdueB) return -1;
      if (!isOverdueA && isOverdueB) return 1;

      return new Date(a.testCreatedAt).getTime() - new Date(b.testCreatedAt).getTime();
    });

    setFilteredQueue(filtered);
  }, [statusFilter, assignmentFilter, queue, userId]);

  const handleToggleSelect = (testId: string) => {
    const newSelected = new Set(selectedTestIds);
    if (newSelected.has(testId)) {
      newSelected.delete(testId);
    } else {
      newSelected.add(testId);
    }
    setSelectedTestIds(newSelected);
    setSelectAllChecked(newSelected.size === filteredQueue.filter(item => !item.assignedTo).length);
  };

  const handleSelectAll = () => {
    if (selectAllChecked) {
      setSelectedTestIds(new Set());
      setSelectAllChecked(false);
    } else {
      const unassignedIds = new Set(
        filteredQueue.filter(item => !item.assignedTo).map(item => item.testId)
      );
      setSelectedTestIds(unassignedIds);
      setSelectAllChecked(true);
    }
  };

  const handleClaimSelected = async () => {
    if (!userId || selectedTestIds.size === 0) return;
    setActionLoading('bulk-claim');
    try {
      const testIdArray = Array.from(selectedTestIds);
      const { error: updateError } = await supabase
        .from('visit_tests')
        .update({ assigned_to: userId })
        .in('id', testIdArray);

      if (updateError) {
        setError(`Failed to claim tests: ${updateError.message}`);
      } else {
        setQueue(prev => prev.map(item =>
          selectedTestIds.has(item.testId) ? { ...item, assignedTo: userId } : item
        ));
        setSelectedTestIds(new Set());
        setSelectAllChecked(false);
      }
    } catch (err) {
      setError('Failed to claim tests');
    } finally {
      setActionLoading(null);
    }
  };

  const handleAssignToMe = async (testId: string) => {
    if (!userId) return;
    setActionLoading(testId);
    try {
      const { error: updateError } = await supabase
        .from('visit_tests')
        .update({ assigned_to: userId })
        .eq('id', testId);

      if (updateError) {
        setError(`Failed to assign test: ${updateError.message}`);
      } else {
        setQueue(prev => prev.map(item =>
          item.testId === testId ? { ...item, assignedTo: userId } : item
        ));
      }
    } catch (err) {
      setError('Failed to assign test');
    } finally {
      setActionLoading(null);
    }
  };

  const handleAssignTo = async (testId: string, technicianId: string) => {
    setActionLoading(testId);
    try {
      const { error: updateError } = await supabase
        .from('visit_tests')
        .update({ assigned_to: technicianId })
        .eq('id', testId);

      if (updateError) {
        setError(`Failed to assign test: ${updateError.message}`);
      } else {
        setQueue(prev => prev.map(item =>
          item.testId === testId ? { ...item, assignedTo: technicianId } : item
        ));
      }
    } catch (err) {
      setError('Failed to assign test');
    } finally {
      setActionLoading(null);
    }
  };

  const handleStartProcessing = async (testId: string) => {
    setActionLoading(testId);
    try {
      const { error: updateError } = await supabase
        .from('visit_tests')
        .update({ status: 'in_progress' })
        .eq('id', testId);

      if (updateError) {
        setError(`Failed to update test: ${updateError.message}`);
      } else {
        setQueue(prev => prev.map(item =>
          item.testId === testId ? { ...item, testStatus: 'in_progress' } : item
        ));
      }
    } catch (err) {
      setError('Failed to start processing');
    } finally {
      setActionLoading(null);
    }
  };

  const handleMarkComplete = async (testId: string) => {
    setActionLoading(testId);
    try {
      const { error: updateError } = await supabase
        .from('visit_tests')
        .update({ status: 'completed' })
        .eq('id', testId);

      if (updateError) {
        setError(`Failed to complete test: ${updateError.message}`);
      } else {
        setQueue(prev => prev.filter(item => item.testId !== testId));
      }
    } catch (err) {
      setError('Failed to complete test');
    } finally {
      setActionLoading(null);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatTimeAgo = (dateString: string) => {
    const now = new Date();
    const created = new Date(dateString);
    const diffMs = now.getTime() - created.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMins = Math.floor(diffMs / (1000 * 60));

    if (diffHours >= 24) {
      const days = Math.floor(diffHours / 24);
      return `${days}d ago`;
    }
    if (diffHours >= 1) return `${diffHours}h ago`;
    if (diffMins >= 1) return `${diffMins}m ago`;
    return 'Just now';
  };

  const getAssigneeName = (assignedTo: string | null) => {
    if (!assignedTo) return 'Unassigned';
    const tech = technicians.find(t => t.id === assignedTo);
    return tech?.fullName || 'Unknown';
  };

  if (userRole && userRole !== UserRole.TECHNICIAN && userRole !== UserRole.ADMIN) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          Access denied. Only technicians and administrators can access the technician queue.
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Technician Queue</h1>
        <p className="text-gray-600 mt-1">
          {filteredQueue.length} test{filteredQueue.length !== 1 ? 's' : ''} pending processing
          <span className="ml-2 text-xs text-gray-400">· refreshes every 10s</span>
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 flex items-start justify-between gap-4">
          <span>{error}</span>
          <div className="flex gap-2 shrink-0">
            <button
              onClick={() => fetchQueue({ showSpinner: true })}
              className="text-red-900 font-medium underline"
            >
              Retry
            </button>
            <button onClick={() => setError('')} className="text-red-900 font-medium underline">
              Dismiss
            </button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex flex-wrap gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <div className="flex gap-2">
              <button
                onClick={() => setStatusFilter('all')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                  statusFilter === 'all' ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                All
              </button>
              <button
                onClick={() => setStatusFilter('pending')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                  statusFilter === 'pending' ? 'bg-yellow-500 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Pending
              </button>
              <button
                onClick={() => setStatusFilter('in_progress')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                  statusFilter === 'in_progress' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                In Progress
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Assignment</label>
            <div className="flex gap-2">
              <button
                onClick={() => setAssignmentFilter('all')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                  assignmentFilter === 'all' ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                All
              </button>
              <button
                onClick={() => setAssignmentFilter('mine')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                  assignmentFilter === 'mine' ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                My Tests
              </button>
              <button
                onClick={() => setAssignmentFilter('unassigned')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                  assignmentFilter === 'unassigned' ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Unassigned
              </button>
            </div>
          </div>
        </div>

        {selectedTestIds.size > 0 && (
          <div className="pt-4 border-t border-gray-200 flex items-center gap-4">
            <span className="text-sm font-medium text-gray-900">{selectedTestIds.size} test(s) selected</span>
            <button
              onClick={handleClaimSelected}
              disabled={actionLoading === 'bulk-claim'}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white font-medium rounded-lg transition"
            >
              {actionLoading === 'bulk-claim' ? 'Claiming...' : 'Claim Selected'}
            </button>
          </div>
        )}
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center p-12">
            <svg className="animate-spin h-8 w-8 text-green-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          </div>
        ) : filteredQueue.length === 0 ? (
          <div className="flex items-center justify-center p-12 text-gray-600">
            <div className="text-center">
              <svg className="w-12 h-12 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-lg font-medium">Queue is clear!</p>
              <p className="text-sm">No pending tests to process</p>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">
                    {assignmentFilter === 'unassigned' && (
                      <input
                        type="checkbox"
                        checked={selectAllChecked}
                        onChange={handleSelectAll}
                        className="rounded border-gray-300"
                        aria-label="Select all unassigned tests"
                      />
                    )}
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">Patient</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">Test</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">Status</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">Assigned To</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">Waiting</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredQueue.map((item) => {
                  const hoursElapsed = (Date.now() - new Date(item.testCreatedAt).getTime()) / (1000 * 60 * 60);
                  const isOverdue = hoursElapsed > item.turnaroundHours;

                  return (
                    <tr key={item.testId} className={`hover:bg-gray-50 transition ${isOverdue ? 'bg-red-50' : ''}`}>
                      <td className="px-4 py-3">
                        {assignmentFilter === 'unassigned' && !item.assignedTo && (
                          <input
                            type="checkbox"
                            checked={selectedTestIds.has(item.testId)}
                            onChange={() => handleToggleSelect(item.testId)}
                            className="rounded border-gray-300"
                          />
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Link href={`/dashboard/patients/${item.patientId}`} className="text-green-600 hover:text-green-700 font-medium">
                          {item.patientFirstName} {item.patientLastName}
                        </Link>
                        {item.patientPhone && (
                          <p className="text-xs text-gray-500">{item.patientPhone}</p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900">{item.testName}</p>
                        <p className="text-xs text-gray-500">{item.testCategory}</p>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1">
                          <span className={`inline-block px-2 py-1 rounded text-xs font-medium capitalize ${
                            item.testStatus === 'pending'
                              ? 'bg-yellow-100 text-yellow-800'
                              : 'bg-blue-100 text-blue-800'
                          }`}>
                            {item.testStatus.replace('_', ' ')}
                          </span>
                          {isOverdue && (
                            <span className="inline-block px-2 py-1 rounded text-xs font-medium bg-red-600 text-white">
                              OVERDUE
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {item.assignedTo ? (
                          <span className="text-sm text-gray-900">{getAssigneeName(item.assignedTo)}</span>
                        ) : (
                          <span className="text-sm text-orange-600 font-medium">Unassigned</span>
                        )}
                        {userRole === UserRole.ADMIN && (
                          <select
                            value={item.assignedTo || ''}
                            onChange={(e) => e.target.value && handleAssignTo(item.testId, e.target.value)}
                            className="mt-1 block w-full text-xs border border-gray-300 rounded px-2 py-1"
                          >
                            <option value="">-- Assign --</option>
                            {technicians.map(tech => (
                              <option key={tech.id} value={tech.id}>{tech.fullName}</option>
                            ))}
                          </select>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-gray-600">{formatTimeAgo(item.testCreatedAt)}</span>
                        <p className="text-xs text-gray-500 mt-1">{hoursElapsed.toFixed(1)}h / {item.turnaroundHours}h</p>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1">
                          {!item.assignedTo && (
                            <button
                              onClick={() => handleAssignToMe(item.testId)}
                              disabled={actionLoading === item.testId}
                              className="text-xs bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white font-medium py-1 px-3 rounded transition"
                            >
                              {actionLoading === item.testId ? '...' : 'Claim'}
                            </button>
                          )}
                          {item.testStatus === 'pending' && item.assignedTo && (
                            <button
                              onClick={() => handleStartProcessing(item.testId)}
                              disabled={actionLoading === item.testId}
                              className="text-xs bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium py-1 px-3 rounded transition"
                            >
                              {actionLoading === item.testId ? '...' : 'Start'}
                            </button>
                          )}
                          {item.testStatus === 'in_progress' && (
                            <button
                              onClick={() => handleMarkComplete(item.testId)}
                              disabled={actionLoading === item.testId}
                              className="text-xs bg-purple-600 hover:bg-purple-700 disabled:bg-purple-400 text-white font-medium py-1 px-3 rounded transition"
                            >
                              {actionLoading === item.testId ? '...' : 'Complete'}
                            </button>
                          )}
                          <Link
                            href={`/dashboard/visits/${item.visitId}`}
                            className="text-xs text-green-600 hover:text-green-700 font-medium"
                          >
                            View Visit
                          </Link>
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
  );
}
