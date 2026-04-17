'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
type Period = 'today' | '7d' | '30d';

interface SnapshotStats {
  walkins_today: number;
  new_patients_today: number;
  completed_today: number;
  pending_tests: number;
}

interface TrendPoint {
  date: string;       // YYYY-MM-DD
  visits: number;
  new_patients: number;
}

interface OperationalStats {
  avg_total_hours: number | null;
  pending_approvals: number;
  overdue_count: number;
  total_visits_period: number;
  completed_visits_period: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Inline SVG bar chart — zero dependencies, fast
// ─────────────────────────────────────────────────────────────────────────────
function BarChart({
  data,
  valueKey,
  color,
  height = 120,
}: {
  data: TrendPoint[];
  valueKey: 'visits' | 'new_patients';
  color: string;
  height?: number;
}) {
  if (!data.length) return null;

  const values = data.map(d => d[valueKey]);
  const max = Math.max(...values, 1);
  const barW = Math.floor(560 / data.length) - 2;

  return (
    <svg viewBox={`0 0 560 ${height + 24}`} className="w-full" preserveAspectRatio="none">
      {data.map((point, i) => {
        const barH = Math.max(2, Math.round((point[valueKey] / max) * height));
        const x = i * (barW + 2);
        const y = height - barH;
        const isWeekend = new Date(point.date).getDay() % 6 === 0;
        return (
          <g key={point.date}>
            <rect
              x={x}
              y={y}
              width={barW}
              height={barH}
              fill={isWeekend ? `${color}80` : color}
              rx={2}
            />
            {/* value label on hover — show for last and max bar */}
            {(point[valueKey] === max || i === data.length - 1) && (
              <text
                x={x + barW / 2}
                y={Math.max(y - 4, 10)}
                textAnchor="middle"
                fontSize="9"
                fill="#6B7280"
              >
                {point[valueKey]}
              </text>
            )}
          </g>
        );
      })}
      {/* X-axis labels: show only first, mid, last */}
      {[0, Math.floor((data.length - 1) / 2), data.length - 1].filter((v, i, a) => a.indexOf(v) === i).map(i => (
        <text key={i} x={i * (barW + 2) + barW / 2} y={height + 16} textAnchor="middle" fontSize="9" fill="#9CA3AF">
          {formatAxisDate(data[i].date)}
        </text>
      ))}
    </svg>
  );
}

function formatAxisDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

// ─────────────────────────────────────────────────────────────────────────────
// Stat card
// ─────────────────────────────────────────────────────────────────────────────
function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: number | string;
  sub?: string;
  accent: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">{label}</p>
      <p className={`text-4xl font-bold ${accent}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────
export default function InsightsPage() {
  const [period, setPeriod] = useState<Period>('7d');
  const [snapshot, setSnapshot] = useState<SnapshotStats | null>(null);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [operational, setOperational] = useState<OperationalStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const supabase = createClient();

  // ── helper: ISO date string ─────────────────────────────────────────────
  const today = new Date().toISOString().split('T')[0];

  function periodStartDate(p: Period): string {
    if (p === 'today') return today;
    const d = new Date();
    d.setDate(d.getDate() - (p === '7d' ? 6 : 29));
    return d.toISOString().split('T')[0];
  }

  // ── fetch everything in parallel ───────────────────────────────────────
  const fetchAll = useCallback(async (p: Period) => {
    setIsLoading(true);
    try {
      const start = periodStartDate(p);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = supabase as any;

      const [
        walkinRes,
        newPatientsRes,
        completedRes,
        pendingTestsRes,
        visitTrendRes,
        patientTrendRes,
        turnaroundRes,
        pendingApprovalsRes,
        overdueRes,
        periodVisitsRes,
      ] = await Promise.all([
        // 1. Walk-ins today
        sb.from('visits').select('id', { count: 'exact', head: true })
          .gte('created_at', `${today}T00:00:00`)
          .lt('created_at', `${today}T23:59:59`),

        // 2. New patients today
        sb.from('patients').select('id', { count: 'exact', head: true })
          .gte('created_at', `${today}T00:00:00`)
          .lt('created_at', `${today}T23:59:59`),

        // 3. Completed today (approved or delivered)
        sb.from('visits').select('id', { count: 'exact', head: true })
          .in('status', ['approved', 'delivered'])
          .gte('updated_at', `${today}T00:00:00`),

        // 4. Pending tests (not done yet)
        sb.from('visit_tests').select('id', { count: 'exact', head: true })
          .in('status', ['pending', 'in_progress']),

        // 5. Visits per day for trend
        sb.from('visits').select('created_at')
          .gte('created_at', `${start}T00:00:00`)
          .order('created_at', { ascending: true }),

        // 6. New patients per day for trend
        sb.from('patients').select('created_at')
          .gte('created_at', `${start}T00:00:00`)
          .order('created_at', { ascending: true }),

        // 7. Avg turnaround via existing DB function
        sb.rpc('get_avg_turnaround', {
          p_start_date: start,
          p_end_date: today,
        }),

        // 8. Pending approvals (visits in 'review' state)
        sb.from('visits').select('id', { count: 'exact', head: true })
          .eq('status', 'review'),

        // 9. Overdue visits from existing view
        sb.from('v_overdue_visits').select('visit_id', { count: 'exact', head: true })
          .eq('is_overdue', true),

        // 10. Total visits in period for completion rate
        sb.from('visits').select('id, status', { count: 'exact' })
          .gte('created_at', `${start}T00:00:00`),
      ]);

      // ── Snapshot ─────────────────────────────────────────────────────
      setSnapshot({
        walkins_today: walkinRes.count ?? 0,
        new_patients_today: newPatientsRes.count ?? 0,
        completed_today: completedRes.count ?? 0,
        pending_tests: pendingTestsRes.count ?? 0,
      });

      // ── Trend: bucket rows by date ────────────────────────────────────
      const days = buildDateRange(start, today);
      const visitsByDay: Record<string, number> = {};
      const patientsByDay: Record<string, number> = {};
      days.forEach(d => { visitsByDay[d] = 0; patientsByDay[d] = 0; });

      (visitTrendRes.data ?? []).forEach((r: { created_at: string }) => {
        const day = r.created_at.split('T')[0];
        if (visitsByDay[day] !== undefined) visitsByDay[day]++;
      });
      (patientTrendRes.data ?? []).forEach((r: { created_at: string }) => {
        const day = r.created_at.split('T')[0];
        if (patientsByDay[day] !== undefined) patientsByDay[day]++;
      });

      setTrend(days.map(d => ({
        date: d,
        visits: visitsByDay[d],
        new_patients: patientsByDay[d],
      })));

      // ── Operational ───────────────────────────────────────────────────
      const tat = turnaroundRes.data?.[0];
      const allPeriodVisits = periodVisitsRes.data ?? [];
      const completedInPeriod = allPeriodVisits.filter(
        (v: { status: string }) => ['approved', 'delivered'].includes(v.status)
      ).length;

      setOperational({
        avg_total_hours: tat?.avg_total_hours ? Number(tat.avg_total_hours) : null,
        pending_approvals: pendingApprovalsRes.count ?? 0,
        overdue_count: overdueRes.count ?? 0,
        total_visits_period: allPeriodVisits.length,
        completed_visits_period: completedInPeriod,
      });

      setLastUpdated(new Date());
    } catch (err) {
      console.error('[Insights]', err);
    } finally {
      setIsLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today]);

  useEffect(() => {
    fetchAll(period);
  }, [period, fetchAll]);

  // ── period totals from trend data ────────────────────────────────────
  const totalVisitsPeriod = trend.reduce((s, d) => s + d.visits, 0);
  const totalPatientsPeriod = trend.reduce((s, d) => s + d.new_patients, 0);
  const completionRate = operational && operational.total_visits_period > 0
    ? Math.round((operational.completed_visits_period / operational.total_visits_period) * 100)
    : null;

  const PERIODS: { key: Period; label: string }[] = [
    { key: 'today', label: 'Today' },
    { key: '7d', label: 'Last 7 days' },
    { key: '30d', label: 'Last 30 days' },
  ];

  return (
    <div className="p-6 max-w-6xl mx-auto">

      {/* Header */}
      <div className="mb-6">
        <Link href="/dashboard/admin" className="text-green-600 hover:text-green-700 font-medium mb-4 inline-flex items-center gap-2 text-sm">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Admin
        </Link>
        <div className="flex items-center justify-between mt-2 flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Insights</h1>
            <p className="text-gray-500 text-sm mt-1">
              Business intelligence for Heavens Diagnostic Services
              {lastUpdated && (
                <span className="ml-2 text-gray-400">
                  · Updated {lastUpdated.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </p>
          </div>
          {/* Period filter */}
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
            {PERIODS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setPeriod(key)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition ${
                  period === key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Offline data note */}
      <div className="mb-6 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5 text-xs text-amber-700 flex items-center gap-2">
        <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        Metrics reflect synced records only. Offline-created records appear here once their device reconnects.
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 animate-pulse">
              <div className="h-3 bg-gray-200 rounded w-2/3 mb-3" />
              <div className="h-9 bg-gray-200 rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : (
        <>
          {/* ── Daily Snapshot ──────────────────────────────────────────── */}
          <section className="mb-8">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">Today&apos;s Snapshot</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard
                label="Walk-ins Today"
                value={snapshot?.walkins_today ?? 0}
                sub="Visits registered today"
                accent="text-green-600"
              />
              <StatCard
                label="New Patients"
                value={snapshot?.new_patients_today ?? 0}
                sub="First-time registrations"
                accent="text-blue-600"
              />
              <StatCard
                label="Completed Today"
                value={snapshot?.completed_today ?? 0}
                sub="Approved or delivered"
                accent="text-teal-600"
              />
              <StatCard
                label="Pending Tests"
                value={snapshot?.pending_tests ?? 0}
                sub="In queue or in progress"
                accent={snapshot && snapshot.pending_tests > 20 ? 'text-red-600' : 'text-amber-600'}
              />
            </div>
          </section>

          {/* ── Trends ────────────────────────────────────────────────────── */}
          {period !== 'today' && trend.length > 0 && (
            <section className="mb-8">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">Trends</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                {/* Visits trend */}
                <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <p className="text-sm font-semibold text-gray-700">Visits</p>
                      <p className="text-xs text-gray-400">Total in period</p>
                    </div>
                    <p className="text-2xl font-bold text-green-600">{totalVisitsPeriod}</p>
                  </div>
                  <BarChart data={trend} valueKey="visits" color="#16a34a" />
                  <p className="text-xs text-gray-400 mt-2">
                    Avg {trend.length > 0 ? (totalVisitsPeriod / trend.length).toFixed(1) : 0} visits/day
                    {completionRate !== null && ` · ${completionRate}% completion rate`}
                  </p>
                </div>

                {/* New patients trend */}
                <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <p className="text-sm font-semibold text-gray-700">New Patients</p>
                      <p className="text-xs text-gray-400">Total in period</p>
                    </div>
                    <p className="text-2xl font-bold text-blue-600">{totalPatientsPeriod}</p>
                  </div>
                  <BarChart data={trend} valueKey="new_patients" color="#2563eb" />
                  <p className="text-xs text-gray-400 mt-2">
                    Avg {trend.length > 0 ? (totalPatientsPeriod / trend.length).toFixed(1) : 0} new patients/day
                  </p>
                </div>
              </div>

              {/* Peak day callout */}
              {trend.length > 0 && (() => {
                const peakVisit = trend.reduce((m, d) => d.visits > m.visits ? d : m, trend[0]);
                if (peakVisit.visits === 0) return null;
                return (
                  <div className="mt-3 bg-green-50 border border-green-100 rounded-lg px-4 py-2.5 text-sm text-green-700">
                    <span className="font-semibold">Busiest day:</span>{' '}
                    {new Date(peakVisit.date + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
                    {' '}— {peakVisit.visits} visit{peakVisit.visits !== 1 ? 's' : ''}
                  </div>
                );
              })()}
            </section>
          )}

          {/* ── Operational Health ──────────────────────────────────────── */}
          <section className="mb-8">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">Operational Health</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

              {/* Avg turnaround */}
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Avg Turnaround</p>
                {operational?.avg_total_hours != null ? (
                  <>
                    <p className={`text-4xl font-bold ${
                      operational.avg_total_hours <= 4 ? 'text-green-600'
                      : operational.avg_total_hours <= 24 ? 'text-amber-600'
                      : 'text-red-600'
                    }`}>
                      {operational.avg_total_hours < 1
                        ? `${Math.round(operational.avg_total_hours * 60)}m`
                        : `${operational.avg_total_hours.toFixed(1)}h`}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      {operational.avg_total_hours <= 4 ? 'Excellent — under 4 hours'
                        : operational.avg_total_hours <= 24 ? 'Acceptable — under 24 hours'
                        : 'Needs attention — over 24 hours'}
                    </p>
                  </>
                ) : (
                  <p className="text-2xl font-bold text-gray-300">—</p>
                )}
                <Link href="/dashboard/admin/turnaround" className="text-xs text-green-600 hover:text-green-700 mt-3 inline-flex items-center gap-1">
                  View breakdown
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              </div>

              {/* Pending approvals */}
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Pending Approvals</p>
                <p className={`text-4xl font-bold ${
                  (operational?.pending_approvals ?? 0) === 0 ? 'text-green-600'
                  : (operational?.pending_approvals ?? 0) <= 5 ? 'text-amber-600'
                  : 'text-red-600'
                }`}>
                  {operational?.pending_approvals ?? 0}
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  {operational?.pending_approvals === 0
                    ? 'All visits reviewed'
                    : `Visit${operational?.pending_approvals !== 1 ? 's' : ''} awaiting doctor sign-off`}
                </p>
              </div>

              {/* Overdue / delayed */}
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Delayed Reports</p>
                <p className={`text-4xl font-bold ${
                  (operational?.overdue_count ?? 0) === 0 ? 'text-green-600' : 'text-red-600'
                }`}>
                  {operational?.overdue_count ?? 0}
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  {operational?.overdue_count === 0
                    ? 'No overdue visits'
                    : 'Exceeded expected turnaround time'}
                </p>
                {(operational?.overdue_count ?? 0) > 0 && (
                  <Link href="/dashboard/admin/turnaround" className="text-xs text-red-600 hover:text-red-700 mt-3 inline-flex items-center gap-1 font-medium">
                    Review overdue
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </Link>
                )}
              </div>
            </div>
          </section>

          {/* ── Period summary row ──────────────────────────────────────── */}
          {period !== 'today' && (
            <section>
              <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">
                {period === '7d' ? '7-Day' : '30-Day'} Summary
              </h2>
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-gray-100">
                  {[
                    { label: 'Total Visits', value: totalVisitsPeriod, color: 'text-green-600' },
                    { label: 'New Patients', value: totalPatientsPeriod, color: 'text-blue-600' },
                    { label: 'Completed', value: operational?.completed_visits_period ?? 0, color: 'text-teal-600' },
                    { label: 'Completion Rate', value: completionRate !== null ? `${completionRate}%` : '—', color: completionRate !== null && completionRate >= 80 ? 'text-green-600' : 'text-amber-600' },
                  ].map(item => (
                    <div key={item.label} className="p-5">
                      <p className="text-xs text-gray-400 mb-1">{item.label}</p>
                      <p className={`text-2xl font-bold ${item.color}`}>{item.value}</p>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Build a contiguous array of YYYY-MM-DD strings from start to end (inclusive)
// ─────────────────────────────────────────────────────────────────────────────
function buildDateRange(start: string, end: string): string[] {
  const dates: string[] = [];
  const current = new Date(start + 'T00:00:00');
  const endDate = new Date(end + 'T00:00:00');
  while (current <= endDate) {
    dates.push(current.toISOString().split('T')[0]);
    current.setDate(current.getDate() + 1);
  }
  return dates;
}
