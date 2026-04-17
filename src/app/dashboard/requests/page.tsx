'use client';

import { useState, useEffect, ChangeEvent } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { LabRequest, RequestStatus } from '@/lib/types';

const ITEMS_PER_PAGE = 10;

export default function LabRequestsPage() {
  const supabase = createClient();
  const [requests, setRequests] = useState<LabRequest[]>([]);
  const [filteredRequests, setFilteredRequests] = useState<LabRequest[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchRequests = async () => {
      try {
        const { data, error } = await supabase
          .from('lab_requests')
          .select('*')
          .order('created_at', { ascending: false });

        if (!error && data) {
          // Map snake_case to camelCase
          const mapped: LabRequest[] = (data as any[]).map(r => ({
            id: r.id,
            requestId: r.request_id,
            createdAt: r.created_at,
            updatedAt: r.updated_at,
            patientId: r.patient_id,
            testTypeId: r.test_type_id,
            orderedBy: r.ordered_by,
            status: r.status,
            priority: r.priority,
            collectionDate: r.collection_date,
            notes: r.notes,
            specimenType: r.specimen_type,
          }));
          setRequests(mapped);
          setFilteredRequests(mapped);
        }
      } catch (err) {
        console.error('Error fetching requests:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchRequests();
  }, [supabase]);

  useEffect(() => {
    const filtered = statusFilter === 'all'
      ? requests
      : requests.filter(req => req.status === statusFilter);
    setFilteredRequests(filtered);
    setCurrentPage(1);
  }, [statusFilter, requests]);

  const totalPages = Math.ceil(filteredRequests.length / ITEMS_PER_PAGE);
  const startIdx = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginatedRequests = filteredRequests.slice(startIdx, startIdx + ITEMS_PER_PAGE);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const getStatusColor = (status: RequestStatus): string => {
    switch (status) {
      case RequestStatus.PENDING:
        return 'bg-yellow-100 text-yellow-800';
      case RequestStatus.COLLECTED:
        return 'bg-blue-100 text-blue-800';
      case RequestStatus.PROCESSING:
        return 'bg-purple-100 text-purple-800';
      case RequestStatus.COMPLETED:
        return 'bg-green-100 text-green-800';
      case RequestStatus.CANCELLED:
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getPriorityColor = (priority: string): string => {
    switch (priority) {
      case 'routine':
        return 'bg-gray-100 text-gray-800';
      case 'urgent':
        return 'bg-yellow-100 text-yellow-800';
      case 'stat':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Lab Requests</h1>
        <p className="text-gray-600 mt-1">View and manage laboratory test requests</p>
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
          {Object.values(RequestStatus).map((status) => (
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
        ) : paginatedRequests.length === 0 ? (
          <div className="flex items-center justify-center p-12 text-gray-600">
            <div className="text-center">
              <svg className="w-12 h-12 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              <p>No requests found</p>
            </div>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Request ID</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Patient</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Tests</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Priority</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Status</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Date</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {paginatedRequests.map((request) => (
                    <tr key={request.id} className="hover:bg-gray-50 transition">
                      <td className="px-6 py-4 text-sm font-mono text-gray-600">{request.requestId}</td>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        <Link href={`/dashboard/patients/${request.patientId}`} className="text-green-600 hover:text-green-700">
                          View Patient
                        </Link>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {request.testTypeId ? 'Test' : '-'}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${getPriorityColor(request.priority)}`}>
                          {request.priority}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(request.status as RequestStatus)}`}>
                          {request.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">{formatDate(request.createdAt)}</td>
                      <td className="px-6 py-4 text-sm">
                        <Link
                          href={`/dashboard/requests/${request.id}`}
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
                  Showing {startIdx + 1} to {Math.min(startIdx + ITEMS_PER_PAGE, filteredRequests.length)} of {filteredRequests.length}
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
