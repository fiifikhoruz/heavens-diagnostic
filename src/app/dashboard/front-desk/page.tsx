'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { UserRole } from '@/lib/types';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface Patient {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  patient_id: string;
}

interface Visit {
  id: string;
  patient_id: string;
  visit_date: string;
  status: string;
  created_at: string;
  patient: Patient;
  visit_tests_count: number;
  payment_status: string;
}

interface PendingPayment {
  id: string;
  visit_id: string;
  amount: number;
  visit_date: string;
  patient_name: string;
}

interface QuickStats {
  todaysVisits: number;
  pendingPayments: number;
  patientsRegisteredToday: number;
  resultsReady: number;
}

export default function FrontDeskDashboard() {
  const router = useRouter();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [userRole, setUserRole] = useState<UserRole | null>(null);

  const [quickStats, setQuickStats] = useState<QuickStats>({
    todaysVisits: 0,
    pendingPayments: 0,
    patientsRegisteredToday: 0,
    resultsReady: 0,
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Patient[]>([]);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);

  const [todaysVisits, setTodaysVisits] = useState<Visit[]>([]);
  const [pendingPayments, setPendingPayments] = useState<PendingPayment[]>([]);
  const [visitsLoading, setVisitsLoading] = useState(true);

  // Check authorization and fetch data
  useEffect(() => {
    const checkAuthAndFetchData = async () => {
      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError || !user) {
          router.push('/login');
          return;
        }

        // Fetch user profile
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('role, full_name')
          .eq('id', user.id)
          .single();

        if (profileError || !profileData) {
          router.push('/login');
          return;
        }

        // Check authorization
        if (
          profileData.role !== UserRole.FRONT_DESK &&
          profileData.role !== UserRole.ADMIN
        ) {
          router.push('/dashboard');
          return;
        }

        setUserRole(profileData.role as UserRole);
        setAuthorized(true);

        // Fetch all dashboard data
        await fetchDashboardData();
      } catch (error) {
        console.error('Error checking authorization:', error);
        router.push('/login');
      }
    };

    checkAuthAndFetchData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      setVisitsLoading(true);

      const today = new Date().toISOString().split('T')[0];

      // Fetch today's visits
      const { data: visitsData, error: visitsError } = await supabase
        .from('visits')
        .select(
          `
          id,
          patient_id,
          visit_date,
          status,
          created_at,
          patients (id, first_name, last_name, phone, patient_id)
        `
        )
        .gte('visit_date', today)
        .lt('visit_date', new Date(new Date(today).getTime() + 86400000).toISOString().split('T')[0])
        .order('visit_date', { ascending: false });

      if (visitsError) throw visitsError;

      // Fetch visit test counts
      let visitsWithCounts: Visit[] = [];
      if (visitsData) {
        visitsWithCounts = await Promise.all(
          visitsData.map(async (visit) => {
            // Get visit tests count
            const { count: testsCount } = await supabase
              .from('visit_tests')
              .select('*', { count: 'exact', head: true })
              .eq('visit_id', visit.id);

            // Get payment status
            const { data: paymentData } = await supabase
              .from('payments')
              .select('status')
              .eq('visit_id', visit.id)
              .single();

            return {
              ...visit,
              patient: visit.patients,
              visit_tests_count: testsCount || 0,
              payment_status: paymentData?.status || 'unpaid',
            };
          })
        );
      }

      setTodaysVisits(visitsWithCounts);

      // Fetch pending payments
      const { data: pendingPaymentsData, error: paymentsError } = await supabase
        .from('payments')
        .select(
          `
          id,
          visit_id,
          amount,
          visits (visit_date, patients (first_name, last_name))
        `
        )
        .eq('status', 'unpaid')
        .order('created_at', { ascending: false });

      if (paymentsError) throw paymentsError;

      const formattedPendingPayments: PendingPayment[] = (pendingPaymentsData || []).map(
        (payment: any) => ({
          id: payment.id,
          visit_id: payment.visit_id,
          amount: payment.amount,
          visit_date: payment.visits?.visit_date || '',
          patient_name:
            payment.visits?.patients?.first_name +
            ' ' +
            (payment.visits?.patients?.last_name || ''),
        })
      );

      setPendingPayments(formattedPendingPayments);

      // Fetch quick stats
      // 1. Today's visits count
      const todaysVisitsCount = visitsWithCounts.length;

      // 2. Pending payments count
      const pendingPaymentsCount = formattedPendingPayments.length;

      // 3. Patients registered today
      const { count: patientsCountData, error: patientsCountError } = await supabase
        .from('patients')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', today + 'T00:00:00');

      if (patientsCountError) throw patientsCountError;

      // 4. Results ready for delivery (visits with status 'completed')
      const { count: resultsReadyCount, error: resultsError } = await supabase
        .from('visits')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'completed')
        .gte('visit_date', today)
        .lt('visit_date', new Date(new Date(today).getTime() + 86400000).toISOString().split('T')[0]);

      if (resultsError) throw resultsError;

      setQuickStats({
        todaysVisits: todaysVisitsCount,
        pendingPayments: pendingPaymentsCount,
        patientsRegisteredToday: patientsCountData || 0,
        resultsReady: resultsReadyCount || 0,
      });

      setVisitsLoading(false);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      setVisitsLoading(false);
    }
  };

  // Search patients
  useEffect(() => {
    const searchPatients = async () => {
      if (!searchQuery.trim()) {
        setSearchResults([]);
        return;
      }

      try {
        setSearchLoading(true);
        const query = searchQuery.toLowerCase().trim();

        const { data, error } = await supabase
          .from('patients')
          .select('id, first_name, last_name, phone, patient_id')
          .or(
            `first_name.ilike.%${query}%,last_name.ilike.%${query}%,phone.ilike.%${query}%,patient_id.ilike.%${query}%`
          )
          .limit(10);

        if (error) throw error;

        setSearchResults(data || []);
      } catch (error) {
        console.error('Error searching patients:', error);
        setSearchResults([]);
      } finally {
        setSearchLoading(false);
      }
    };

    const timer = setTimeout(searchPatients, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  if (!authorized) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-gray-600">Checking authorization...</p>
        </div>
      </div>
    );
  }

  const getStatusBadgeColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'in_progress':
        return 'bg-blue-100 text-blue-800';
      case 'cancelled':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getPaymentBadgeColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'paid':
        return 'bg-green-100 text-green-800';
      case 'unpaid':
        return 'bg-red-100 text-red-800';
      case 'deferred':
        return 'bg-yellow-100 text-yellow-800';
      case 'refunded':
        return 'bg-blue-100 text-blue-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <h1 className="text-3xl font-bold text-gray-900">Front Desk Dashboard</h1>
          <p className="text-gray-600 mt-1">Heavens Diagnostic Services, Sunyani</p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Quick Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-lg shadow p-6 border-l-4 border-green-600">
            <p className="text-gray-600 text-sm font-medium">Today's Visits</p>
            <p className="text-3xl font-bold text-gray-900 mt-2">{quickStats.todaysVisits}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-6 border-l-4 border-red-600">
            <p className="text-gray-600 text-sm font-medium">Pending Payments</p>
            <p className="text-3xl font-bold text-gray-900 mt-2">{quickStats.pendingPayments}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-6 border-l-4 border-blue-600">
            <p className="text-gray-600 text-sm font-medium">Patients Registered Today</p>
            <p className="text-3xl font-bold text-gray-900 mt-2">{quickStats.patientsRegisteredToday}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-6 border-l-4 border-purple-600">
            <p className="text-gray-600 text-sm font-medium">Results Ready</p>
            <p className="text-3xl font-bold text-gray-900 mt-2">{quickStats.resultsReady}</p>
          </div>
        </div>

        {/* Quick Actions and Search */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
          {/* Quick Actions */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h2>
            <div className="space-y-3">
              <Link
                href="/dashboard/visits/new"
                className="block w-full bg-green-600 hover:bg-green-700 text-white font-medium py-2 px-4 rounded-lg text-center transition"
              >
                New Visit
              </Link>
              <Link
                href="/dashboard/patients/new"
                className="block w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg text-center transition"
              >
                Register Patient
              </Link>
            </div>
          </div>

          {/* Patient Search */}
          <div className="lg:col-span-2 bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Search Patient</h2>
            <div className="relative">
              <input
                type="text"
                placeholder="Search by name, phone, or patient ID..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setShowSearchResults(true);
                }}
                onFocus={() => setShowSearchResults(true)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-600 focus:border-transparent outline-none"
              />

              {/* Search Results Dropdown */}
              {showSearchResults && (searchQuery || searchResults.length > 0) && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-gray-300 rounded-lg shadow-lg z-10 max-h-64 overflow-y-auto">
                  {searchLoading ? (
                    <div className="px-4 py-2 text-gray-600 text-sm">Searching...</div>
                  ) : searchResults.length > 0 ? (
                    <ul className="divide-y divide-gray-200">
                      {searchResults.map((patient) => (
                        <li key={patient.id}>
                          <Link
                            href={`/dashboard/patients/${patient.id}`}
                            className="block px-4 py-3 hover:bg-gray-50 transition"
                            onClick={() => {
                              setSearchQuery('');
                              setShowSearchResults(false);
                            }}
                          >
                            <p className="font-medium text-gray-900">
                              {patient.first_name} {patient.last_name}
                            </p>
                            <p className="text-sm text-gray-600">
                              ID: {patient.patient_id} | Phone: {patient.phone}
                            </p>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : searchQuery ? (
                    <div className="px-4 py-2 text-gray-600 text-sm">No patients found</div>
                  ) : null}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Today's Visits Table */}
        <div className="bg-white rounded-lg shadow mb-8">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Today's Visits</h2>
          </div>
          {visitsLoading ? (
            <div className="px-6 py-8 text-center text-gray-600">Loading visits...</div>
          ) : todaysVisits.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                      Patient Name
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                      Visit Date
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                      Tests
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                      Payment Status
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {todaysVisits.map((visit) => (
                    <tr key={visit.id} className="hover:bg-gray-50 transition">
                      <td className="px-6 py-4 text-sm text-gray-900 font-medium">
                        {visit.patient.first_name} {visit.patient.last_name}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {new Date(visit.visit_date).toLocaleString()}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <span
                          className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${getStatusBadgeColor(
                            visit.status
                          )}`}
                        >
                          {visit.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {visit.visit_tests_count} test{visit.visit_tests_count !== 1 ? 's' : ''}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <span
                          className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${getPaymentBadgeColor(
                            visit.payment_status
                          )}`}
                        >
                          {visit.payment_status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <Link
                          href={`/dashboard/visits/${visit.id}`}
                          className="text-green-600 hover:text-green-700 font-medium transition"
                        >
                          View
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="px-6 py-8 text-center text-gray-600">No visits today</div>
          )}
        </div>

        {/* Pending Payments Section */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Pending Payments</h2>
          </div>
          {pendingPayments.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                      Patient Name
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                      Visit Date
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                      Amount
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {pendingPayments.map((payment) => (
                    <tr key={payment.id} className="hover:bg-gray-50 transition">
                      <td className="px-6 py-4 text-sm text-gray-900 font-medium">
                        {payment.patient_name}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {new Date(payment.visit_date).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 text-sm font-semibold text-gray-900">
                        GHS {payment.amount.toFixed(2)}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <Link
                          href={`/dashboard/visits/${payment.visit_id}`}
                          className="text-green-600 hover:text-green-700 font-medium transition"
                        >
                          Process
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="px-6 py-8 text-center text-gray-600">
              No pending payments - all caught up!
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
