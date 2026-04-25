'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

interface AvgStats {
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
  patient_name: string;
  visit_date: string;
  status: string;
  hours_since_creation: number;
  expected_hours: number;
  is_overdue: boolean;
}

interface RecentVisit {
  visit_id: string;
  patient_name: string;
  visit_date: string;
  current_status: string;
  total_hours: number | null;
}

const STATUS_LABELS: Record<string, string> = {
  created: 'Created',
  collected: 'Collected',
  processing: 'Processing',
  review: 'Review',
  approved: 'Approved',
  delivered: 'Delivered',
};

const STATUS_COLORS: Record<string, string> = {
  created: 'bg-gray-100 text-gray-700',
  collected: 'bg-blue-100 text-blue-700',
  processing: 'bg-yellow-100 text-yellow-700',
  review: 'bg-orange-100 text-orange-700',
  approved: 'bg-green-100 text-green-700',
  delivered: 'bg-purple-100 text-purple-700',
};

const STAGE_NAMES = [
  { key: 'avg_registration_to_collection', label: 'Reg → Collection' },
  { key: 'avg_collection_to_processing', label: 'Collection → Processing' },
  { key: 'avg_processing_to_review', label: 'Processing → Review' },
  { key: 'avg_review_to_approval', label: 'Review → Approval' },
  { key: 'avg_approval_to_delivery', label: 'Approval → Delivery' },
];

function fmtHours(h: number | null): string {
  if (h == null || isNaN(h)) return '—';
  if (h < 1) return `${Math.round(h * 60)}m`;
  if (h < 24) return `${h.toFixed(1)}h`;
  return `${(h / 24).toFixed(1)}d`;
}

function pctWidth(h: number | null, max: number): string {
  if (!h || !max) return '0%';
  return `${Math.min(100, (h / max) * 100).toFixed(1)}%`;
}

export default function TurnaroundPage() {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<7 | 30 | 90>(30);
  const [stats, setStats] = useState<AvgStats | null>(null);
  const [overdueVisits, setOverdueVisits] = useState<OverdueVisit[]>([]);
  const [recentVisits, setRecentVisits] = useState<RecentVisit[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const startDate = new Date(Date.now() - range * 24 * 60 * 60 * 1000)
          .toISOString().split('T')[0];
        const endDate = new Date().toISOString().split('T')[0];

        // Average turnaround via the DB function
        const { data: avgData, error: avgErr } = await (supabase as any)
          .rpc('get_avg_turnaround', { p_start_date: startDate, p_end_date: endDate });
        if (avgErr) throw avgErr;
        setStats(avgData?.[0] ?? null);

        // Overdue visits
        const { data: overdueData, error: overdueErr } = await (supabase as any)
          .from('v_overdue_visits')
          .select('*')
          .eq('is_overdue', true)
          .order('hours_since_creation', { ascending: false })
          .limit(10);
        if (overdueErr) throw overdueErr;
        setOverdueVisits(overdueData ?? []);

        // Recent visit turnaround (last 15 completed/delivered)
        const { data: recentData, error: recentErr } = await (supabase as any)
          .from('v_turnaround_times')
          .select('visit_id, patient_name, visit_date, current_status, total_hours')
          .order('visit_date', { ascending: false })
          .limit(15);
        if (recentErr) throw recentErr;
        setRecentVisits(recentData ?? []);
      } catch (err: any) {
        console.error('[turnaround]', err);
        setError(err?.message ?? 'Failed to load turnaround data');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [range]);

  const maxStageHours = stats
    ? Math.max(...STAGE_NAMES.map(s => stats[s.key as keyof AvgStats] as number || 0))
    : 1;

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Turnaround</h1>
          <p className="text-sm text-gray-500 mt-0.5">Processing time metrics across all workflow stages</p>
        </div>
        <div className="flex rounded-lg border border-gray-300 overflow-hidden text-sm">
          {([7, 30, 90] as const).map(d => (
            <button
              key={d}
              onClick={() => setRange(d)}
              className={`px-4 py-1.5 font-medium transition ${range === d ? 'bg-green-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <svg className="animate-spin h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </div>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-lg shadow p-5 border-l-4 border-green-600">
              <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">Total Visits</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">{stats?.total_visits ?? 0}</p>
              <p className="text-xs text-gray-400 mt-1">in last {range} days</p>
            </div>
            <div className="bg-white rounded-lg shadow p-5 border-l-4 border-blue-600">
              <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">Completed</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">{stats?.completed_visits ?? 0}</p>
              <p className="text-xs text-gray-400 mt-1">fully delivered</p>
            </div>
            <div className="bg-white rounded-lg shadow p-5 border-l-4 border-yellow-500">
              <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">Avg Total Time</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">{fmtHours(stats?.avg_total_hours ?? null)}</p>
              <p className="text-xs text-gray-400 mt-1">creation → delivery</p>
            </div>
            <div className="bg-white rounded-lg shadow p-5 border-l-4 border-red-500">
              <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">Overdue Now</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">{overdueVisits.length}</p>
              <p className="text-xs text-gray-400 mt-1">active visits past SLA</p>
            </div>
          </div>

          {/* Stage Breakdown */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-base font-semibold text-gray-900 mb-4">Average Time Per Stage</h2>
            {stats ? (
              <div className="space-y-4">
                {STAGE_NAMES.map(({ key, label }) => {
                  const val = stats[key as keyof AvgStats] as number | null;
                  return (
                    <div key={key}>
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span className="text-gray-700 font-medium">{label}</span>
                        <span className="text-gray-500 font-mono">{fmtHours(val)}</span>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-green-500 rounded-full transition-all"
                          style={{ width: pctWidth(val, maxStageHours) }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-gray-400 text-sm text-center py-6">No completed visits in this period yet.</p>
            )}
          </div>

          {/* Overdue Visits */}
          {overdueVisits.length > 0 && (
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <div className="bg-red-50 border-b border-red-100 px-6 py-4 flex items-center gap-2">
                <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <h2 className="text-base font-semibold text-red-800">Overdue Visits ({overdueVisits.length})</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700">Patient</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700">Status</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700">Age</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700">Expected</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {overdueVisits.map(v => (
                      <tr key={v.visit_id} className="hover:bg-red-50 transition">
                        <td className="px-4 py-3 font-medium text-gray-900">{v.patient_name}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_COLORS[v.status] ?? 'bg-gray-100 text-gray-700'}`}>
                            {STATUS_LABELS[v.status] ?? v.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-red-600 font-semibold">{fmtHours(v.hours_since_creation)}</td>
                        <td className="px-4 py-3 text-gray-500">{fmtHours(v.expected_hours)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Recent visits table */}
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="px-6 py-4 border-b">
              <h2 className="text-base font-semibold text-gray-900">Recent Visit Turnaround</h2>
            </div>
            {recentVisits.length === 0 ? (
              <div className="p-8 text-center text-gray-400 text-sm">No visits recorded yet.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700">Patient</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700">Status</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700">Visit Date</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700">Total Time</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {recentVisits.map(v => (
                      <tr key={v.visit_id} className="hover:bg-gray-50 transition">
                        <td className="px-4 py-3 font-medium text-gray-900">{v.patient_name}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_COLORS[v.current_status] ?? 'bg-gray-100 text-gray-700'}`}>
                            {STATUS_LABELS[v.current_status] ?? v.current_status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-600">
                          {new Date(v.visit_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </td>
                        <td className="px-4 py-3 text-gray-700 font-mono">{fmtHours(v.total_hours)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
