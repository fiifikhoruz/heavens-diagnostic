'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { UserRole } from '@/lib/types';

interface DashboardStats {
  totalPatients: number;
  activeVisits: number;
  samplesPending: number;
  pendingApproval: number;
}

export default function DashboardHome() {
  const router = useRouter();
  const supabase = createClient();
  const [stats, setStats] = useState<DashboardStats>({
    totalPatients: 0,
    activeVisits: 0,
    samplesPending: 0,
    pendingApproval: 0,
  });
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const { data: authData } = await supabase.auth.getSession();
        if (!authData.session) {
          router.push('/login');
          return;
        }

        const { data: profileData } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', authData.session.user.id)
          .single();

        if (profileData) {
          setUserRole(profileData.role as UserRole);
        }

        // Fetch patient count
        const { count: patientCount } = await supabase
          .from('patients')
          .select('id', { count: 'exact' });

        // Fetch active visits (not delivered)
        const { count: activeCount } = await supabase
          .from('visits')
          .select('id', { count: 'exact' })
          .neq('status', 'delivered');

        // Fetch samples pending collection
        const { count: samplesCount } = await supabase
          .from('samples')
          .select('id', { count: 'exact' })
          .eq('status', 'pending');

        // Fetch pending approvals
        const { count: approvalCount } = await supabase
          .from('lab_results')
          .select('id', { count: 'exact' })
          .eq('status', 'reviewed');

        setStats({
          totalPatients: patientCount || 0,
          activeVisits: activeCount || 0,
          samplesPending: samplesCount || 0,
          pendingApproval: approvalCount || 0,
        });
      } catch (err) {
        console.error('Error fetching stats:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchStats();
  }, [supabase, router]);

  const StatCard = ({
    title,
    value,
    icon,
    color,
  }: {
    title: string;
    value: number;
    icon: React.ReactNode;
    color: string;
  }) => (
    <div className="bg-white rounded-lg shadow p-6 border-l-4" style={{ borderColor: color }}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-gray-600 text-sm font-medium">{title}</p>
          <p className="text-3xl font-bold text-gray-900 mt-2">{isLoading ? '-' : value}</p>
        </div>
        <div className="p-3 rounded-full" style={{ backgroundColor: `${color}20` }}>
          <div style={{ color }}>{icon}</div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="p-6 space-y-6">
      {/* Welcome */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-600 mt-2">Welcome to Heavens Diagnostic Services</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Patients"
          value={stats.totalPatients}
          icon={
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.856-1.487M15 10a3 3 0 11-6 0 3 3 0 016 0zM6 20a9 9 0 0118 0v2h2v-2a11 11 0 10-20 0v2h2v-2z" />
            </svg>
          }
          color="#166534"
        />
        <StatCard
          title="Active Visits"
          value={stats.activeVisits}
          icon={
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
            </svg>
          }
          color="#f59e0b"
        />
        <StatCard
          title="Samples Pending"
          value={stats.samplesPending}
          icon={
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          }
          color="#10b981"
        />
        <StatCard
          title="Pending Approval"
          value={stats.pendingApproval}
          icon={
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m7 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
          color="#3b82f6"
        />
      </div>

      {/* Action Buttons */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {(userRole === UserRole.FRONT_DESK || userRole === UserRole.ADMIN) && (
            <Link
              href="/dashboard/patients/new"
              className="flex items-center gap-3 px-4 py-3 bg-green-50 text-green-700 rounded-lg hover:bg-green-100 transition font-medium"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Register Patient
            </Link>
          )}

          {(userRole === UserRole.FRONT_DESK || userRole === UserRole.TECHNICIAN || userRole === UserRole.DOCTOR || userRole === UserRole.ADMIN) && (
            <Link
              href="/dashboard/visits"
              className="flex items-center gap-3 px-4 py-3 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition font-medium"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              View Visits
            </Link>
          )}

          {(userRole === UserRole.FRONT_DESK || userRole === UserRole.ADMIN) && (
            <Link
              href="/dashboard/visits/new"
              className="flex items-center gap-3 px-4 py-3 bg-indigo-50 text-indigo-700 rounded-lg hover:bg-indigo-100 transition font-medium"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New Visit
            </Link>
          )}

          <Link
            href="/dashboard/patients"
            className="flex items-center gap-3 px-4 py-3 bg-purple-50 text-purple-700 rounded-lg hover:bg-purple-100 transition font-medium"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.856-1.487M15 10a3 3 0 11-6 0 3 3 0 016 0zM6 20a9 9 0 0118 0v2h2v-2a11 11 0 10-20 0v2h2v-2z" />
            </svg>
            All Patients
          </Link>

          {userRole === UserRole.ADMIN && (
            <Link
              href="/dashboard/admin"
              className="flex items-center gap-3 px-4 py-3 bg-red-50 text-red-700 rounded-lg hover:bg-red-100 transition font-medium"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
              </svg>
              Admin Panel
            </Link>
          )}
        </div>
      </div>

      {/* Info Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-green-50 rounded-lg shadow p-6 border-l-4 border-green-600">
          <h3 className="text-lg font-semibold text-green-900 mb-2">System Status</h3>
          <p className="text-green-700">All systems operational. Last sync: Just now</p>
        </div>
        <div className="bg-blue-50 rounded-lg shadow p-6 border-l-4 border-blue-600">
          <h3 className="text-lg font-semibold text-blue-900 mb-2">Help & Support</h3>
          <p className="text-blue-700">Need assistance? Contact your administrator or check the help center.</p>
        </div>
      </div>
    </div>
  );
}
