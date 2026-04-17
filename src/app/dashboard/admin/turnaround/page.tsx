'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { UserRole } from '@/lib/types';

interface TurnaroundStats {
  avg_total_hours: number | null;
  avg_registration_to_collection: number | null;
  avg_collection_to_processing: number | null;
  avg_processing_to_review: number | null;
  avg_review_to_approval: number | null;
  avg_approval_to_delivery: number | null;
  total_visits: number;
  completed_visits: number;
}

interface OverdueVisit {
  visit_id: string;
  patient_id: string;
  patient_name: string;
  visit_date: string;
  status: string;
  hours_since_creation: number;
  expected_hours: number;
  is_overdue: boolean;
}

interface TurnaroundTime {
  visit_id: string;
  patient_id: string;
  patient_name: string;
  visit_date: string;
  current_status: string;
  total_hours: number | null;
  registration_to_collection_hours: number | null;
  collection_to_processing_hours: number | null;
  processing_to_review_hours: number | null;
  review_to_approval_hours: number | null;
  approval_to_delivery_hours: number | null;
}

export default function TurnaroundPage() {
  const router = useRouter();
  const supabase = createClient();

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [stats, setStats] = useState<TurnaroundStats | null>(null);
  const [overdueVisits, setOverdueVisits] = useState<OverdueVisit[]>([]);
  const [recentVisits, setRecentVisits] = useState<TurnaroundTime[]>([]);

  // Date range filter
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  useEffect(() => {
    // Set default date range (last 30 days)
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    setEndDate(now.toISOString().split('T')[0]);
    setStartDate(thirtyDaysAgo.toISOString().split('T')[0]);
  }, []);

  useEffect(() => {
    const checkAccess = async () => {
      try {
        const { data: authData } = await supabase.auth.getSession();
        if (!authData.session) {
          router.push('/login');
          return;
        }

        const { data: profileData } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', authData.session.user.id)
          .single();

        if (!profileData || profileData.role !== UserRole.ADMIN) {
          router.push('/dashboard');
          return;
        }

        // Initial data load
        if (startDate && endDate) {
          await fetchData();
        }
      } catch (err) {
        console.error('Error checking access:', err);
        router.push('/login');
      }
    };

    checkAccess();
  }, [supabase, router]);

  // Re-fetch when date range changes
  useEffect(() => {
    if (startDate && endDate && !isLoading) {
      fetchData();
    }
  }, [startDate, endDate]);

  const fetchData = async () => {
    setIsLoading(true);
    setError('');
    try {
      // Fetch turnaround stats using RPC
      const { data: statsData, error: statsError } = await (
        supabase as any
      ).rpc('get_avg_turnaround', {
        p_start_date: startDate,
        p_end_date: endDate,
      });

      if (statsError) {
        console.error('Stats error:', statsError);
        setError('Failed to load turnaround statistics');
      } else if (statsData && statsData.length > 0) {
        setStats(statsData[0]);
      }

      // Fetch overdue visits
      const { data: overdueData, error: overdueError } = await (
        supabase as any
      )
        .from('v_overdue_visits')
        .select('*')
        .order('hours_since_creation', { ascending: false });

      if (overdueError) {
        console.error('Overdue visits error:', overdueError);
      } else {
        setOverdueVisits(overdueData || []);
      }

      // Fetch recent delivered visits
      const { data: recentData, error: recentError } = await (
        supabase as any
      )
        .from('v_turnaround_times')
        .select('*')
        .eq('current_status', 'delivered')
        .order('visit_date', { ascending: false })
        .limit(20);

      if (recentError) {
        console.error('Recent visits error:', recentError);
      } else {
        setRecentVisits(recentData || []);
      }
    } catch (err) {
      console.error('Error fetching data:', err);
      setError('An error occurred while loading data');
    } finally {
      setIsLoading(false);
    }
  };

  const formatHours = (hours: number | null) => {
    if (hours === null || hours === undefined) return 'N/A';
    return hours.toFixed(1) + 'h';
  };

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return dateString;
    }
  };

  const getStatusBadge = (status: string) => {
    const statusStyles: Record<string, string> = {
      created: 'bg-gray-100 text-gray-800',
      collected: 'bg-blue-100 text-blue-800',
      processing: 'bg-yellow-100 text-yellow-800',
      review: 'bg-orange-100 text-orange-800',
      approved: 'bg-green-100 text-green-800',
      delivered: 'bg-green-100 text-green-800',
    };

    return statusStyles[status] || 'bg-gray-100 text-gray-800';
  };

  if (isLoading && !stats) {
    return (
      <div className="space-y-6 p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-48 bg-gray-200 rounded" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-32 bg-gray-200 rounded" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Turnaround Time Analytics</h1>
        <p className="text-gray-600 mt-2">Monitor lab processing efficiency and delivery times</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          {error}
        </div>
      )}

      {/* Date Range Filter */}
      <div className="bg-white rounded-lg shadow p-4 flex items-end gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Start Date
          </label>
          <input
            type="date"
            value={startDate}
            onChange={e => setStartDate(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-600 focus:border-transparent"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            End Date
          </label>
          <input
            type="date"
            value={endDate}
            onChange={e => setEndDate(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-600 focus:border-transparent"
          />
        </div>
        {isLoading && <span className="text-sm text-gray-500">Updating...</span>}
      </div>

      {/* Summary Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-gray-600 text-sm font-medium">Avg Total Time</div>
            <div className="text-3xl font-bold text-gray-900 mt-2">
              {formatHours(stats.avg_total_hours)}
            </div>
            <div className="text-xs text-gray-500 mt-1">Creation to delivery</div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-gray-600 text-sm font-medium">Total Visits</div>
            <div className="text-3xl font-bold text-gray-900 mt-2">
              {stats.total_visits}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              {stats.completed_visits} delivered
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-gray-600 text-sm font-medium">Avg Collection Time</div>
            <div className="text-3xl font-bold text-gray-900 mt-2">
              {formatHours(stats.avg_registration_to_collection)}
            </div>
            <div className="text-xs text-gray-500 mt-1">Reg to collection</div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-gray-600 text-sm font-medium">Avg Processing Time</div>
            <div className="text-3xl font-bold text-gray-900 mt-2">
              {formatHours(stats.avg_collection_to_processing)}
            </div>
            <div className="text-xs text-gray-500 mt-1">Collection to processing</div>
          </div>
        </div>
      )}

      {/* Stage Breakdown Bar */}
      {stats && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Average Time per Stage
          </h2>
          <div className="space-y-6">
            {[
              {
                label: 'Registration to Collection',
                value: stats.avg_registration_to_collection,
                color: 'bg-gray-400',
              },
              {
                label: 'Collection to Processing',
                value: stats.avg_collection_to_processing,
                color: 'bg-blue-500',
              },
              {
                label: 'Processing to Review',
                value: stats.avg_processing_to_review,
                color: 'bg-yellow-500',
              },
              {
                label: 'Review to Approval',
                value: stats.avg_review_to_approval,
                color: 'bg-orange-500',
              },
              {
                label: 'Approval to Delivery',
                value: stats.avg_approval_to_delivery,
                color: 'bg-green-600',
              },
            ].map((stage, idx) => (
              <div key={idx}>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-medium text-gray-700">{stage.label}</span>
                  <span className="text-sm font-semibold text-gray-900">
                    {formatHours(stage.value)}
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  {stage.value ? (
                    <div
                      className={`h-2 rounded-full ${stage.color}`}
                      style={{
                        width: `${Math.min(
                          (stage.value / (stats.avg_total_hours || 24)) * 100,
                          100
                        )}%`,
                      }}
                    />
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Overdue Visits Table */}
      {overdueVisits.length > 0 && (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">
              Pending Visits ({overdueVisits.length})
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">
                    Patient
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">
                    Visit Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">
                    Hours Since
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">
                    Expected
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {overdueVisits.slice(0, 15).map(visit => (
                  <tr
                    key={visit.visit_id}
                    className={visit.is_overdue ? 'bg-red-50' : 'hover:bg-gray-50'}
                  >
                    <td className="px-6 py-4 text-sm text-gray-900">
                      {visit.patient_name}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {formatDate(visit.visit_date)}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${getStatusBadge(visit.status)}`}>
                        {visit.status.charAt(0).toUpperCase() + visit.status.slice(1)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">
                      {visit.hours_since_creation.toFixed(1)}h
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {visit.expected_hours.toFixed(1)}h
                    </td>
                    <td className="px-6 py-4 text-sm">
                      {visit.is_overdue && (
                        <span className="inline-block px-3 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
                          OVERDUE
                        </span>
                      )}
                      {!visit.is_overdue && (
                        <span className="text-gray-500">On track</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Recent Turnaround Times Table */}
      {recentVisits.length > 0 && (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">
              Recently Delivered ({recentVisits.length} results)
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">
                    Patient
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">
                    Visit Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">
                    Total Time
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">
                    Collection
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">
                    Processing
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">
                    Review
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">
                    Approval
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">
                    Delivery
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {recentVisits.map(visit => (
                  <tr key={visit.visit_id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm text-gray-900">
                      {visit.patient_name}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {formatDate(visit.visit_date)}
                    </td>
                    <td className="px-6 py-4 text-sm font-semibold text-gray-900">
                      {formatHours(visit.total_hours)}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {formatHours(visit.registration_to_collection_hours)}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {formatHours(visit.collection_to_processing_hours)}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {formatHours(visit.processing_to_review_hours)}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {formatHours(visit.review_to_approval_hours)}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {formatHours(visit.approval_to_delivery_hours)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {recentVisits.length === 0 && !isLoading && (
        <div className="bg-white rounded-lg shadow p-6 text-center text-gray-600">
          No delivered visits in the selected date range.
        </div>
      )}
    </div>
  );
}
