'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { UserRole, VisitStatus } from '@/lib/types';

interface ReviewItem {
  visitId: string;
  patientId: string;
  patientFirstName: string;
  patientLastName: string;
  patientPhone: string | null;
  visitStatus: VisitStatus;
  visitDate: string;
  totalTests: number;
  completedTests: number;
  abnormalCount: number;
  abnormalTestNames: string[];
  hasAbnormal: boolean;
}

export default function DoctorReviewPage() {
  const supabase = createClient();
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [filteredReviews, setFilteredReviews] = useState<ReviewItem[]>([]);
  const [filter, setFilter] = useState<string>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const { data: authData } = await supabase.auth.getSession();
        if (!authData.session) return;

        // Get user role
        const { data: profileData } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', authData.session.user.id)
          .single();

        if (profileData) {
          setUserRole(profileData.role as UserRole);
        }

        // Fetch visits that are in review or processing status
        const { data: visitsData, error: visitsError } = await supabase
          .from('visits')
          .select(`
            id,
            patient_id,
            status,
            visit_date,
            patients!inner (
              first_name,
              last_name,
              phone
            )
          `)
          .in('status', ['review', 'processing'])
          .order('visit_date', { ascending: true });

        if (visitsError) {
          console.error('Error fetching reviews:', visitsError);
          setError('Failed to load review queue');
          return;
        }

        if (visitsData) {
          const reviewItems: ReviewItem[] = [];

          for (const v of visitsData as any[]) {
            // Fetch visit tests to count totals and abnormals
            const { data: testsData } = await supabase
              .from('visit_tests')
              .select(`
                id,
                status,
                test_type_id,
                test_types!inner (name)
              `)
              .eq('visit_id', v.id);

            const totalTests = testsData?.length || 0;
            const completedTests = (testsData || []).filter((t: any) =>
              ['completed', 'reviewed', 'approved'].includes(t.status)
            ).length;

            // Check for abnormal results
            let abnormalCount = 0;
            const abnormalTestNames: string[] = [];

            for (const test of (testsData || []) as any[]) {
              const { data: resultsData } = await supabase
                .from('test_results')
                .select('is_abnormal')
                .eq('test_id', test.id)
                .eq('is_abnormal', true);

              if (resultsData && resultsData.length > 0) {
                abnormalCount += resultsData.length;
                const testName = test.test_types?.name || 'Unknown';
                if (!abnormalTestNames.includes(testName)) {
                  abnormalTestNames.push(testName);
                }
              }
            }

            reviewItems.push({
              visitId: v.id,
              patientId: v.patient_id,
              patientFirstName: v.patients?.first_name || '',
              patientLastName: v.patients?.last_name || '',
              patientPhone: v.patients?.phone || null,
              visitStatus: v.status as VisitStatus,
              visitDate: v.visit_date,
              totalTests,
              completedTests,
              abnormalCount,
              abnormalTestNames,
              hasAbnormal: abnormalCount > 0,
            });
          }

          // Sort: abnormal cases first, then oldest first
          reviewItems.sort((a, b) => {
            if (a.hasAbnormal && !b.hasAbnormal) return -1;
            if (!a.hasAbnormal && b.hasAbnormal) return 1;
            if (a.abnormalCount !== b.abnormalCount) return b.abnormalCount - a.abnormalCount;
            return new Date(a.visitDate).getTime() - new Date(b.visitDate).getTime();
          });

          setReviews(reviewItems);
          setFilteredReviews(reviewItems);
        }
      } catch (err) {
        console.error('Error loading review data:', err);
        setError('Failed to load review data');
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [supabase]);

  // Apply filters
  useEffect(() => {
    let filtered = [...reviews];

    if (filter === 'abnormal') {
      filtered = filtered.filter(item => item.hasAbnormal);
    } else if (filter === 'review') {
      filtered = filtered.filter(item => item.visitStatus === VisitStatus.REVIEW);
    } else if (filter === 'processing') {
      filtered = filtered.filter(item => item.visitStatus === VisitStatus.PROCESSING);
    }

    setFilteredReviews(filtered);
  }, [filter, reviews]);

  const handleApproveVisit = async (visitId: string) => {
    setActionLoading(visitId);
    try {
      // Update visit status to approved
      const { error: updateError } = await supabase
        .from('visits')
        .update({ status: 'approved' })
        .eq('id', visitId);

      if (updateError) {
        setError(`Failed to approve: ${updateError.message}`);
      } else {
        // Also approve all visit_tests
        await supabase
          .from('visit_tests')
          .update({ status: 'approved' })
          .eq('visit_id', visitId);

        setReviews(prev => prev.filter(item => item.visitId !== visitId));
      }
    } catch (err) {
      setError('Failed to approve visit');
    } finally {
      setActionLoading(null);
    }
  };

  const handleRequestRetest = async (visitId: string) => {
    setActionLoading(visitId);
    try {
      // Send visit back to processing
      const { error: updateError } = await supabase
        .from('visits')
        .update({ status: 'processing' })
        .eq('id', visitId);

      if (updateError) {
        setError(`Failed to request retest: ${updateError.message}`);
      } else {
        setReviews(prev => prev.map(item =>
          item.visitId === visitId
            ? { ...item, visitStatus: VisitStatus.PROCESSING }
            : item
        ));
      }
    } catch (err) {
      setError('Failed to request retest');
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

  if (userRole && userRole !== UserRole.DOCTOR && userRole !== UserRole.ADMIN) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          Access denied. Only doctors and administrators can access the review queue.
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Doctor Review</h1>
        <p className="text-gray-600 mt-1">
          {filteredReviews.length} visit{filteredReviews.length !== 1 ? 's' : ''} pending review
          {reviews.filter(r => r.hasAbnormal).length > 0 && (
            <span className="ml-2 text-red-600 font-medium">
              ({reviews.filter(r => r.hasAbnormal).length} with abnormal results)
            </span>
          )}
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          {error}
          <button onClick={() => setError('')} className="ml-4 text-red-900 font-medium underline">Dismiss</button>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setFilter('all')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              filter === 'all' ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            All ({reviews.length})
          </button>
          <button
            onClick={() => setFilter('abnormal')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              filter === 'abnormal' ? 'bg-red-600 text-white' : 'bg-red-50 text-red-700 hover:bg-red-100'
            }`}
          >
            Abnormal ({reviews.filter(r => r.hasAbnormal).length})
          </button>
          <button
            onClick={() => setFilter('review')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              filter === 'review' ? 'bg-orange-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Ready for Review ({reviews.filter(r => r.visitStatus === VisitStatus.REVIEW).length})
          </button>
          <button
            onClick={() => setFilter('processing')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              filter === 'processing' ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Still Processing ({reviews.filter(r => r.visitStatus === VisitStatus.PROCESSING).length})
          </button>
        </div>
      </div>

      {/* Review Cards */}
      <div className="space-y-4">
        {isLoading ? (
          <div className="flex items-center justify-center p-12">
            <svg className="animate-spin h-8 w-8 text-green-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          </div>
        ) : filteredReviews.length === 0 ? (
          <div className="bg-white rounded-lg shadow flex items-center justify-center p-12 text-gray-600">
            <div className="text-center">
              <svg className="w-12 h-12 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-lg font-medium">No pending reviews</p>
              <p className="text-sm">All visits have been reviewed</p>
            </div>
          </div>
        ) : (
          filteredReviews.map((item) => (
            <div
              key={item.visitId}
              className={`bg-white rounded-lg shadow p-6 border-l-4 ${
                item.hasAbnormal ? 'border-red-500' : 'border-green-500'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <Link
                      href={`/dashboard/visits/${item.visitId}`}
                      className="text-lg font-semibold text-gray-900 hover:text-green-700"
                    >
                      {item.patientFirstName} {item.patientLastName}
                    </Link>
                    <span className={`inline-block px-2 py-1 rounded text-xs font-medium capitalize ${
                      item.visitStatus === VisitStatus.REVIEW
                        ? 'bg-orange-100 text-orange-800'
                        : 'bg-purple-100 text-purple-800'
                    }`}>
                      {item.visitStatus}
                    </span>
                    {item.hasAbnormal && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-bold bg-red-100 text-red-800">
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                        {item.abnormalCount} ABNORMAL
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mb-3">
                    <div>
                      <p className="text-gray-500">Visit Date</p>
                      <p className="font-medium text-gray-900">{formatDate(item.visitDate)}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Phone</p>
                      <p className="font-medium text-gray-900">{item.patientPhone || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Tests</p>
                      <p className="font-medium text-gray-900">
                        {item.completedTests}/{item.totalTests} completed
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-500">Abnormal Values</p>
                      <p className={`font-medium ${item.hasAbnormal ? 'text-red-600' : 'text-green-600'}`}>
                        {item.abnormalCount > 0 ? `${item.abnormalCount} found` : 'None'}
                      </p>
                    </div>
                  </div>

                  {item.abnormalTestNames.length > 0 && (
                    <div className="mb-3">
                      <p className="text-sm text-red-600 font-medium">
                        Abnormal results in: {item.abnormalTestNames.join(', ')}
                      </p>
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-2 ml-4">
                  <Link
                    href={`/dashboard/visits/${item.visitId}`}
                    className="text-sm bg-green-600 hover:bg-green-700 text-white font-medium py-2 px-4 rounded-lg transition text-center"
                  >
                    Review Results
                  </Link>
                  {item.visitStatus === VisitStatus.REVIEW && (
                    <>
                      <button
                        onClick={() => handleApproveVisit(item.visitId)}
                        disabled={actionLoading === item.visitId}
                        className="text-sm bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium py-2 px-4 rounded-lg transition"
                      >
                        {actionLoading === item.visitId ? 'Processing...' : 'Approve'}
                      </button>
                      <button
                        onClick={() => handleRequestRetest(item.visitId)}
                        disabled={actionLoading === item.visitId}
                        className="text-sm bg-gray-600 hover:bg-gray-700 disabled:bg-gray-400 text-white font-medium py-2 px-4 rounded-lg transition"
                      >
                        {actionLoading === item.visitId ? 'Processing...' : 'Request Retest'}
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
