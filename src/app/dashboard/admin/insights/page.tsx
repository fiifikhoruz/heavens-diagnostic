'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

interface DailyStat {
  date: string;
  count: number;
}

interface StatusBreakdown {
  status: string;
  count: number;
}

interface TestTypeBreakdown {
  name: string;
  category: string;
  count: number;
}

interface GenderBreakdown {
  gender: string;
  count: number;
}

interface TopStats {
  totalPatients: number;
  totalVisits: number;
  activeVisits: number;
  deliveredThisMonth: number;
  newPatientsThisMonth: number;
  avgVisitsPerPatient: number;
}

const STATUS_COLORS: Record<string, string> = {
  created: '#6b7280',
  collected: '#3b82f6',
  processing: '#f59e0b',
  review: '#f97316',
  approved: '#22c55e',
  delivered: '#8b5cf6',
};

const STATUS_LABELS: Record<string, string> = {
  created: 'Created', collected: 'Collected', processing: 'Processing',
  review: 'Review', approved: 'Approved', delivered: 'Delivered',
};

export default function InsightsPage() {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<30 | 60 | 90>(30);
  const [topStats, setTopStats] = useState<TopStats | null>(null);
  const [dailyVisits, setDailyVisits] = useState<DailyStat[]>([]);
  const [statusBreakdown, setStatusBreakdown] = useState<StatusBreakdown[]>([]);
  const [testBreakdown, setTestBreakdown] = useState<TestTypeBreakdown[]>([]);
  const [genderBreakdown, setGenderBreakdown] = useState<GenderBreakdown[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const since = new Date(Date.now() - range * 24 * 60 * 60 * 1000).toISOString();
        const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();

        // ── Top-level counts ──────────────────────────────────────────────────
        const [
          { count: totalPatients },
          { count: totalVisits },
          { count: activeVisits },
          { count: deliveredMonth },
          { count: newPatientsMonth },
        ] = await Promise.all([
          supabase.from('patients').select('*', { count: 'exact', head: true }),
          supabase.from('visits').select('*', { count: 'exact', head: true }),
          supabase.from('visits').select('*', { count: 'exact', head: true }).not('status', 'in', '("delivered","approved")'),
          supabase.from('visits').select('*', { count: 'exact', head: true }).eq('status', 'delivered').gte('created_at', monthStart),
          supabase.from('patients').select('*', { count: 'exact', head: true }).gte('created_at', monthStart),
        ]);

        setTopStats({
          totalPatients: totalPatients ?? 0,
          totalVisits: totalVisits ?? 0,
          activeVisits: activeVisits ?? 0,
          deliveredThisMonth: deliveredMonth ?? 0,
          newPatientsThisMonth: newPatientsMonth ?? 0,
          avgVisitsPerPatient: totalPatients
            ? Math.round(((totalVisits ?? 0) / totalPatients) * 10) / 10
            : 0,
        });

        // ── Status breakdown ──────────────────────────────────────────────────
        const { data: statusData } = await supabase
          .from('visits')
          .select('status')
          .gte('created_at', since);

        const statusCounts: Record<string, number> = {};
        (statusData ?? []).forEach((v: any) => {
          statusCounts[v.status] = (statusCounts[v.status] ?? 0) + 1;
        });
        setStatusBreakdown(
          Object.entries(statusCounts)
            .map(([status, count]) => ({ status, count }))
            .sort((a, b) => b.count - a.count)
        );

        // ── Daily visit volume ────────────────────────────────────────────────
        const { data: visitsData } = await supabase
          .from('visits')
          .select('created_at')
          .gte('created_at', since)
          .order('created_at', { ascending: true });

        const dailyCounts: Record<string, number> = {};
        (visitsData ?? []).forEach((v: any) => {
          const day = v.created_at.split('T')[0];
          dailyCounts[day] = (dailyCounts[day] ?? 0) + 1;
        });
        // Fill in zeros for missing days
        const days: DailyStat[] = [];
        for (let i = range - 1; i >= 0; i--) {
          const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
          days.push({ date: d, count: dailyCounts[d] ?? 0 });
        }
        setDailyVisits(days);

        // ── Test type distribution ────────────────────────────────────────────
        const { data: testData } = await (supabase as any)
          .from('visit_tests')
          .select('test_types(name, category)')
          .gte('created_at', since);

        const testCounts: Record<string, { name: string; category: string; count: number }> = {};
        (testData ?? []).forEach((vt: any) => {
          const name = vt.test_types?.name ?? 'Unknown';
          const category = vt.test_types?.category ?? '';
          if (!testCounts[name]) testCounts[name] = { name, category, count: 0 };
          testCounts[name].count++;
        });
        setTestBreakdown(
          Object.values(testCounts)
            .sort((a, b) => b.count - a.count)
            .slice(0, 10)
        );

        // ── Gender breakdown ──────────────────────────────────────────────────
        const { data: genderData } = await supabase
          .from('patients')
          .select('gender');

        const genderCounts: Record<string, number> = {};
        (genderData ?? []).forEach((p: any) => {
          const g = p.gender ?? 'unknown';
          genderCounts[g] = (genderCounts[g] ?? 0) + 1;
        });
        setGenderBreakdown(
          Object.entries(genderCounts).map(([gender, count]) => ({ gender, count }))
        );
      } catch (err: any) {
        console.error('[insights]', err);
        setError(err?.message ?? 'Failed to load insights');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [range]);

  const totalStatusCount = statusBreakdown.reduce((s, x) => s + x.count, 0) || 1;
  const maxDaily = Math.max(...dailyVisits.map(d => d.count), 1);
  const maxTestCount = testBreakdown[0]?.count || 1;

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Insights</h1>
          <p className="text-sm text-gray-500 mt-0.5">Operational analytics for Heavens Diagnostic</p>
        </div>
        <div className="flex rounded-lg border border-gray-300 overflow-hidden text-sm">
          {([30, 60, 90] as const).map(d => (
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
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">{error}</div>
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
          {/* Top stats */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              { label: 'Total Patients', value: topStats?.totalPatients ?? 0, color: 'border-green-600' },
              { label: 'Total Visits', value: topStats?.totalVisits ?? 0, color: 'border-blue-500' },
              { label: 'Active Visits', value: topStats?.activeVisits ?? 0, color: 'border-yellow-500' },
              { label: 'Delivered (month)', value: topStats?.deliveredThisMonth ?? 0, color: 'border-purple-500' },
              { label: 'New Patients (month)', value: topStats?.newPatientsThisMonth ?? 0, color: 'border-teal-500' },
              { label: 'Avg Visits / Patient', value: topStats?.avgVisitsPerPatient ?? 0, color: 'border-orange-500' },
            ].map(({ label, value, color }) => (
              <div key={label} className={`bg-white rounded-lg shadow p-4 border-l-4 ${color}`}>
                <p className="text-xs text-gray-500 font-medium leading-tight">{label}</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
              </div>
            ))}
          </div>

          {/* Daily visit volume bar chart */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-base font-semibold text-gray-900 mb-4">Daily Visit Volume (last {range} days)</h2>
            <div className="flex items-end gap-px h-32 overflow-hidden">
              {dailyVisits.map(d => (
                <div
                  key={d.date}
                  className="flex-1 min-w-0 group relative"
                  title={`${d.date}: ${d.count} visit${d.count !== 1 ? 's' : ''}`}
                >
                  <div
                    className="bg-green-500 rounded-t w-full transition-all group-hover:bg-green-600"
                    style={{ height: `${(d.count / maxDaily) * 100}%`, minHeight: d.count ? '2px' : '0' }}
                  />
                </div>
              ))}
            </div>
            <div className="flex justify-between text-xs text-gray-400 mt-1">
              <span>{dailyVisits[0]?.date}</span>
              <span>today</span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Status breakdown */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-base font-semibold text-gray-900 mb-4">Visits by Status</h2>
              {statusBreakdown.length === 0 ? (
                <p className="text-gray-400 text-sm text-center py-6">No visits in this period.</p>
              ) : (
                <div className="space-y-3">
                  {statusBreakdown.map(({ status, count }) => (
                    <div key={status}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="font-medium text-gray-700">{STATUS_LABELS[status] ?? status}</span>
                        <span className="text-gray-500">{count} ({Math.round((count / totalStatusCount) * 100)}%)</span>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${(count / totalStatusCount) * 100}%`,
                            backgroundColor: STATUS_COLORS[status] ?? '#6b7280',
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Gender breakdown */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-base font-semibold text-gray-900 mb-4">Patient Demographics</h2>
              {genderBreakdown.length === 0 ? (
                <p className="text-gray-400 text-sm text-center py-6">No patient data yet.</p>
              ) : (
                <div className="space-y-4">
                  {genderBreakdown.map(({ gender, count }) => {
                    const total = genderBreakdown.reduce((s, g) => s + g.count, 0) || 1;
                    const pct = Math.round((count / total) * 100);
                    const colors: Record<string, string> = {
                      male: 'bg-blue-500', female: 'bg-pink-500', other: 'bg-purple-400',
                    };
                    return (
                      <div key={gender}>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="font-medium text-gray-700 capitalize">{gender}</span>
                          <span className="text-gray-500">{count} ({pct}%)</span>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${colors[gender] ?? 'bg-gray-400'}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Top tests */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-base font-semibold text-gray-900 mb-4">Most Requested Tests (last {range} days)</h2>
            {testBreakdown.length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-6">No test data yet.</p>
            ) : (
              <div className="space-y-3">
                {testBreakdown.map(({ name, category, count }) => (
                  <div key={name}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <div>
                        <span className="font-medium text-gray-800">{name}</span>
                        {category && <span className="text-gray-400 text-xs ml-2">· {category}</span>}
                      </div>
                      <span className="text-gray-500 font-mono">{count}</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500 rounded-full transition-all"
                        style={{ width: `${(count / maxTestCount) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
