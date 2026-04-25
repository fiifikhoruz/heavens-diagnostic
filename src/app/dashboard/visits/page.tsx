'use client';

import { useState, useEffect, ChangeEvent } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Visit, Patient, VisitStatus } from '@/lib/types';

const ITEMS_PER_PAGE = 10;

export default function VisitsPage() {
  const supabase = createClient();
  const [visits, setVisits] = useState<(Visit & { patientName?: string })[]>([]);
  const [filteredVisits, setFilteredVisits] = useState<(Visit & { patientName?: string })[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);

  useEffect(() => {
    const fetchUserRole = async () => {
      try {
        const { data: authData } = await supabase.auth.getSession();
        if (authData.session) {
          const { data: profileData } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', authData.session.user.id)
            .single();
          if (profileData) {
            setUserRole(profileData.role);
          }
        }
      } catch (err) {
        console.error('Error fetching user role:', err);
      }
    };
    fetchUserRole();
  }, [supabase]);

  useEffect(() => {
    const fetchVisits = async () => {
      try {
        const { data, error } = await supabase
          .from('visits')
          .select('*, patients(first_name, last_name)')
          .order('visit_date', { ascending: false });

        if (error) {
          console.error('[visits] fetch error:', error);
          setFetchError(error.message);
          return;
        }

        const mapped = (data as any[]).map(v => ({
          id: v.id,
          patientId: v.patient_id,
          visitDate: v.visit_date,
          status: v.status as VisitStatus,
          createdBy: v.created_by,
          createdAt: v.created_at,
          updatedAt: v.updated_at,
          patientName: v.patients
            ? `${v.patients.first_name} ${v.patients.last_name}`
            : 'Unknown',
        }));
        setVisits(mapped);
        setFilteredVisits(mapped);
      } catch (err: any) {
        console.error('[visits] unexpected error:', err);
        setFetchError(err?.message ?? 'Unexpected error loading visits');
      } finally {
        setIsLoading(false);
      }
    };

    fetchVisits();
  }, [supabase]);

  useEffect(() => {
    const filtered = statusFilter === 'all'
      ? visits
      : visits.filter(v => v.status === statusFilter);
    setFilteredVisits(filtered);
    setCurrentPage(1);
  }, [statusFilter, visits]);

  const totalPages = Math.ceil(filteredVisits.length / ITEMS_PER_PAGE);
  const startIdx = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginatedVisits = filteredVisits.slice(startIdx, startIdx + ITEMS_PER_PAGE);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const getStatusColor = (status: VisitStatus): string => {
    switch (status) {
      case VisitStatus.CREATED:
        return 'bg-yellow-100 text-yellow-800';
      case VisitStatus.COLLECTED:
        return 'bg-blue-100 text-blue-800';
      case VisitStatus.PROCESSING:
        return 'bg-purple-100 text-purple-800';
      case VisitStatus.REVIEW:
        return 'bg-orange-100 text-orange-800';
      case VisitStatus.APPROVED:
        return 'bg-green-100 text-green-800';
      case VisitStatus.DELIVERED:
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Visits</h1>
          <p className="text-gray-600 mt-1">View and manage patient visits</p>
        </div>
        {(userRole === 'front_desk' || userRole === 'admin') && (
          <Link
            href="/dashboard/visits/new"
            className="inline-flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white font-medium py-2 px-4 rounded-lg transition"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Visit
          </Link>
        )}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-4 py-2 rounded-lg font-medium transition ${
              statusFilter === 'all'
                ? 'bg-green-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            All
          </button>
          {Object.values(VisitStatus).map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`px-4 py-2 rounded-lg font-medium transition capitalize ${
                statusFilter === status
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {status}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center p-12">
            <svg className="animate-spin h-8 w-8 text-green-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          </div>
        ) : fetchError ? (
          <div className="p-8 text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 bg-red-100 rounded-full mb-3">
              <svg className="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-red-700 font-medium text-sm">Could not load visits</p>
            <p className="text-red-500 text-xs mt-1 font-mono">{fetchError}</p>
            <p className="text-gray-500 text-xs mt-2">Contact your administrator if this persists.</p>
          </div>
        ) : paginatedVisits.length === 0 ? (
          <div className="flex items-center justify-center p-12 text-gray-600">
            <div className="text-center">
              <svg className="w-12 h-12 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              <p className="font-medium text-gray-700">No visits found</p>
              <p className="text-sm text-gray-400 mt-1">
                {statusFilter === 'all'
                  ? 'No visits have been created yet.'
                  : `No visits with status "${statusFilter}".`}
              </p>
              {(userRole === 'front_desk' || userRole === 'admin') && statusFilter === 'all' && (
                <a
                  href="/dashboard/visits/new"
                  className="inline-block mt-4 bg-green-600 hover:bg-green-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition"
                >
                  Create First Visit
                </a>
              )}
            </div>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Visit ID</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Patient Name</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Tests</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Status</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Visit Date</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {paginatedVisits.map((visit) => (
                    <tr key={visit.id} className="hover:bg-gray-50 transition">
                      <td className="px-6 py-4 text-sm font-mono text-gray-600">{visit.id.substring(0, 8)}</td>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        <Link href={`/dashboard/patients/${visit.patientId}`} className="text-green-600 hover:text-green-700">
                          {visit.patientName}
                        </Link>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        <span className="inline-block px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                          Tests
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium capitalize ${getStatusColor(visit.status)}`}>
                          {visit.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">{formatDate(visit.visitDate)}</td>
                      <td className="px-6 py-4 text-sm">
                        <Link
                          href={`/dashboard/visits/${visit.id}`}
                          className="text-green-600 hover:text-green-700 font-medium"
                        >
                          View
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="bg-gray-50 border-t border-gray-200 px-6 py-4 flex items-center justify-between">
                <div className="text-sm text-gray-600">
                  Showing {startIdx + 1} to {Math.min(startIdx + ITEMS_PER_PAGE, filteredVisits.length)} of {filteredVisits.length}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                    disabled={currentPage === 1}
                    className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition"
                  >
                    Previous
                  </button>
                  <div className="flex items-center gap-1">
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      const pageNum = currentPage <= 3 ? i + 1 : currentPage - 2 + i;
                      if (pageNum > totalPages) return null;
                      return (
                        <button
                          key={pageNum}
                          onClick={() => setCurrentPage(pageNum)}
                          className={`px-3 py-2 rounded-lg font-medium transition ${
                            currentPage === pageNum
                              ? 'bg-green-600 text-white'
                              : 'border border-gray-300 text-gray-700 hover:bg-gray-100'
                          }`}
                        >
                          {pageNum}
                        </button>
                      );
                    })}
                  </div>
                  <button
                    onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                    disabled={currentPage === totalPages}
                    className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
