'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { LabRequest, Patient, ResultStatus, UserRole, RequestStatus, Priority, Gender } from '@/lib/types';

interface LabResult {
  id: string;
  result_id: string;
  status: ResultStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  released_at: string | null;
  notes: string | null;
}

export default function LabRequestDetailPage() {
  const params = useParams();
  const router = useRouter();
  const supabase = createClient();
  const requestId = params.id as string;

  const [request, setRequest] = useState<LabRequest | null>(null);
  const [patient, setPatient] = useState<Patient | null>(null);
  const [result, setResult] = useState<LabResult | null>(null);
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [resultNotes, setResultNotes] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const { data: authData } = await supabase.auth.getSession();
        if (authData.session) {
          const { data: profileData } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', authData.session.user.id)
            .single();
          if (profileData) {
            setUserRole(profileData.role as UserRole);
          }
        }

        const { data: requestData, error: requestError } = await supabase
          .from('lab_requests')
          .select('*')
          .eq('id', requestId)
          .single();

        if (requestError || !requestData) {
          setError('Request not found');
          return;
        }

        // Map request to camelCase
        const mappedRequest: LabRequest = {
          id: requestData.id,
          requestId: requestData.request_id,
          createdAt: requestData.created_at,
          updatedAt: requestData.updated_at,
          patientId: requestData.patient_id,
          testTypeId: requestData.test_type_id,
          orderedBy: requestData.ordered_by,
          status: requestData.status as RequestStatus,
          priority: requestData.priority as Priority,
          collectionDate: requestData.collection_date,
          notes: requestData.notes,
          specimenType: requestData.specimen_type,
        };
        setRequest(mappedRequest);

        const { data: patientData } = await supabase
          .from('patients')
          .select('*')
          .eq('id', requestData.patient_id)
          .single();

        if (patientData) {
          // Map patient to camelCase
          const mapped: Patient = {
            id: patientData.id,
            patientId: patientData.patient_id,
            createdAt: patientData.created_at,
            updatedAt: patientData.updated_at,
            firstName: patientData.first_name,
            lastName: patientData.last_name,
            dateOfBirth: patientData.date_of_birth,
            gender: patientData.gender as Gender,
            phone: patientData.phone,
            email: patientData.email,
            address: patientData.address,
            city: patientData.city,
            state: patientData.state,
            postalCode: patientData.postal_code,
            insuranceProvider: patientData.insurance_provider,
            insuranceId: patientData.insurance_id,
            emergencyContactName: patientData.emergency_contact_name,
            emergencyContactPhone: patientData.emergency_contact_phone,
            notes: patientData.notes,
            isActive: patientData.is_active,
          };
          setPatient(mapped);
        }

        const { data: resultData } = await supabase
          .from('lab_results')
          .select('*')
          .eq('lab_request_id', requestId)
          .single();

        if (resultData) {
          // Map result notes
          setResultNotes(resultData.notes || '');
        }
      } catch (err) {
        console.error('Error fetching data:', err);
        setError('An error occurred while loading request data');
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [supabase, requestId]);

  const handleApprove = async () => {
    if (!result) return;

    setIsUpdating(true);
    try {
      const { error } = await supabase
        .from('lab_results')
        .update({
          status: ResultStatus.APPROVED,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', result.id);

      if (error) {
        setError(error.message);
      } else {
        setResult({ ...result, status: ResultStatus.APPROVED });
      }
    } catch (err) {
      setError('Failed to approve result');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleRelease = async () => {
    if (!result) return;

    setIsUpdating(true);
    try {
      const { error } = await supabase
        .from('lab_results')
        .update({
          status: ResultStatus.RELEASED,
          released_at: new Date().toISOString(),
        })
        .eq('id', result.id);

      if (error) {
        setError(error.message);
      } else {
        setResult({ ...result, status: ResultStatus.RELEASED });
      }
    } catch (err) {
      setError('Failed to release result');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleUpdateNotes = async () => {
    if (!result) return;

    setIsUpdating(true);
    try {
      const { error } = await supabase
        .from('lab_results')
        .update({ notes: resultNotes })
        .eq('id', result.id);

      if (error) {
        setError(error.message);
      }
    } catch (err) {
      setError('Failed to update notes');
    } finally {
      setIsUpdating(false);
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-screen">
        <svg className="animate-spin h-12 w-12 text-green-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      </div>
    );
  }

  if (error || !request || !patient) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          {error || 'Request not found'}
        </div>
        <Link href="/dashboard/requests" className="text-green-600 hover:text-green-700 font-medium mt-4 inline-flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Requests
        </Link>
      </div>
    );
  }

  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'draft':
        return 'bg-gray-100 text-gray-800';
      case 'reviewed':
        return 'bg-blue-100 text-blue-800';
      case 'approved':
        return 'bg-green-100 text-green-800';
      case 'released':
        return 'bg-emerald-100 text-emerald-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const canApprove = userRole === UserRole.DOCTOR || userRole === UserRole.ADMIN;
  const canRelease = userRole === UserRole.DOCTOR || userRole === UserRole.ADMIN;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <Link href="/dashboard/requests" className="text-green-600 hover:text-green-700 font-medium mb-4 inline-flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Requests
        </Link>
        <h1 className="text-3xl font-bold text-gray-900">Lab Request Detail</h1>
        <p className="text-gray-600 mt-1">Request ID: {request.requestId}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Patient Info */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Patient Information</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-600">Name</p>
                <p className="font-medium text-gray-900">
                  {patient.firstName} {patient.lastName}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Patient ID</p>
                <p className="font-mono text-gray-900">{patient.patientId}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Phone</p>
                <p className="font-medium text-gray-900">{patient.phone || '-'}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Email</p>
                <p className="font-medium text-gray-900">{patient.email || '-'}</p>
              </div>
            </div>
          </div>

          {/* Request Details */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Request Details</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-600">Priority</p>
                <p className="font-medium text-gray-900 capitalize">{request.priority}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Status</p>
                <p className="font-medium text-gray-900 capitalize">{request.status}</p>
              </div>
              <div className="col-span-2">
                <p className="text-sm text-gray-600">Clinical Notes</p>
                <p className="font-medium text-gray-900">{request.notes || '-'}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Specimen Type</p>
                <p className="font-medium text-gray-900">{request.specimenType || '-'}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Collection Date</p>
                <p className="font-medium text-gray-900">{request.collectionDate ? new Date(request.collectionDate).toLocaleDateString() : '-'}</p>
              </div>
            </div>
          </div>

          {/* Result Notes */}
          {result && (
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Result Information</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Notes
                  </label>
                  <textarea
                    value={resultNotes}
                    onChange={(e) => setResultNotes(e.target.value)}
                    disabled={isUpdating}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none transition disabled:bg-gray-100"
                    rows={4}
                  />
                </div>
                <button
                  onClick={handleUpdateNotes}
                  disabled={isUpdating}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg font-medium transition"
                >
                  Update Notes
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Status Card */}
          {result && (
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Result Status</h3>
              <div className="space-y-3">
                <div>
                  <p className="text-sm text-gray-600">Status</p>
                  <div className="mt-1">
                    <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(result.status)}`}>
                      {result.status}
                    </span>
                  </div>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Reviewed At</p>
                  <p className="font-medium text-gray-900">{formatDate(result.reviewed_at)}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Released At</p>
                  <p className="font-medium text-gray-900">{formatDate(result.released_at)}</p>
                </div>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Actions</h3>
            <div className="space-y-3">
              {result && canApprove && result.status === ResultStatus.DRAFT && (
                <button
                  onClick={handleApprove}
                  disabled={isUpdating}
                  className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg font-medium transition"
                >
                  Approve Result
                </button>
              )}

              {result && canRelease && result.status === ResultStatus.APPROVED && (
                <button
                  onClick={handleRelease}
                  disabled={isUpdating}
                  className="w-full px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white rounded-lg font-medium transition"
                >
                  Release Result
                </button>
              )}

              <Link
                href={`/dashboard/patients/${patient.id}`}
                className="block w-full px-4 py-2 border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-lg font-medium transition text-center"
              >
                View Patient
              </Link>
            </div>
          </div>

          {/* Timeline */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Timeline</h3>
            <div className="space-y-4">
              <div className="flex gap-3">
                <div className="w-2 h-2 rounded-full bg-green-600 mt-2 flex-shrink-0"></div>
                <div>
                  <p className="text-sm font-medium text-gray-900">Requested</p>
                  <p className="text-sm text-gray-600">{formatDate(request.createdAt)}</p>
                </div>
              </div>
              {request.collectionDate && (
                <div className="flex gap-3">
                  <div className="w-2 h-2 rounded-full bg-blue-600 mt-2 flex-shrink-0"></div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">Collected</p>
                    <p className="text-sm text-gray-600">{formatDate(request.collectionDate)}</p>
                  </div>
                </div>
              )}
              {result?.reviewed_at && (
                <div className="flex gap-3">
                  <div className="w-2 h-2 rounded-full bg-yellow-600 mt-2 flex-shrink-0"></div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">Reviewed</p>
                    <p className="text-sm text-gray-600">{formatDate(result.reviewed_at)}</p>
                  </div>
                </div>
              )}
              {result?.released_at && (
                <div className="flex gap-3">
                  <div className="w-2 h-2 rounded-full bg-green-700 mt-2 flex-shrink-0"></div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">Released</p>
                    <p className="text-sm text-gray-600">{formatDate(result.released_at)}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
