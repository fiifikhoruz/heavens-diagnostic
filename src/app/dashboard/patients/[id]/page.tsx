'use client';

import { useEffect, useState } from 'react';
import { formatGHS } from '@/lib/currency';
import { createClient } from '@/lib/supabase/client';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { format, differenceInYears } from 'date-fns';
import {
  Calendar,
  Phone,
  Mail,
  MapPin,
  Shield,
  AlertCircle,
  Plus,
  Printer,
  ChevronRight,
  Clock,
  FileText,
  Banknote,
  User,
} from 'lucide-react';

interface Patient {
  id: string;
  patient_id: string;
  first_name: string;
  last_name: string;
  date_of_birth: string;
  gender: string;
  phone: string | null;
  email: string;
  address: string;
  city: string;
  state: string;
  postal_code: string;
  insurance_provider: string;
  insurance_id: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  notes: string;
  created_at: string;
}

interface Visit {
  id: string;
  patient_id: string;
  visit_date: string;
  status: 'created' | 'collected' | 'processing' | 'review' | 'approved' | 'delivered';
  created_at: string;
  visit_tests: VisitTest[];
  payments: Payment[];
  doctor_notes: DoctorNote[];
}

interface SupabaseVisit {
  id: string;
  patient_id: string;
  visit_date: string;
  status: string;
  created_at: string;
  visit_tests: VisitTest[];
  payments: Payment[];
  doctor_notes: DoctorNote[];
}

interface VisitTest {
  id: string;
  visit_id: string;
  test_type_id: string;
  status: string;
  test_types: TestType;
}

interface TestType {
  id: string;
  name: string;
  category: string;
}

interface Payment {
  id: string;
  visit_id: string;
  amount: number;
  status: string;
  method: string;
}

interface DoctorNote {
  id: string;
  visit_id: string;
  notes: string;
  created_at: string;
  profiles: {
    full_name: string;
  };
}

interface TestResult {
  id: string;
  field_name: string;
  value: string | number;
  unit: string;
  normal_min: number | null;
  normal_max: number | null;
  is_abnormal: boolean;
  visit_date: string;
  visit_id: string;
}

const statusConfig = {
  created: { bg: 'bg-gray-100', text: 'text-gray-800', badge: 'bg-gray-200', label: 'Created' },
  collected: { bg: 'bg-blue-100', text: 'text-blue-800', badge: 'bg-blue-200', label: 'Collected' },
  processing: { bg: 'bg-yellow-100', text: 'text-yellow-800', badge: 'bg-yellow-200', label: 'Processing' },
  review: { bg: 'bg-orange-100', text: 'text-orange-800', badge: 'bg-orange-200', label: 'Review' },
  approved: { bg: 'bg-green-100', text: 'text-green-800', badge: 'bg-green-200', label: 'Approved' },
  delivered: { bg: 'bg-purple-100', text: 'text-purple-800', badge: 'bg-purple-200', label: 'Delivered' },
};

export default function PatientProfilePage() {
  const params = useParams();
  const patientId = params.id as string;
  const supabase = createClient();

  const [patient, setPatient] = useState<Patient | null>(null);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchPatientData = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setError('Not authenticated');
          setLoading(false);
          return;
        }

        // Fetch patient data
        const { data: patientData, error: patientError } = await supabase
          .from('patients')
          .select('*')
          .eq('id', patientId)
          .single();

        if (patientError) throw patientError;
        setPatient(patientData as any);

        // Fetch visits with related data
        const { data: visitsData, error: visitsError } = await supabase
          .from('visits')
          .select(`
            id,
            patient_id,
            visit_date,
            status,
            created_at,
            visit_tests (
              id,
              visit_id,
              test_type_id,
              status,
              test_types (
                id,
                name,
                category
              )
            ),
            payments (
              id,
              visit_id,
              amount,
              status,
              method
            ),
            doctor_notes (
              id,
              visit_id,
              notes,
              created_at,
              profiles (
                full_name
              )
            )
          `)
          .eq('patient_id', patientId)
          .order('visit_date', { ascending: false });

        if (visitsError) throw visitsError;
        setVisits((visitsData || []) as unknown as Visit[]);

        // Fetch test results for most recent tests
        const visitIds = (visitsData || []).map(v => v.id);
        if (visitIds.length > 0) {
          const { data: resultsData, error: resultsError } = await supabase
            .from('test_results')
            .select(`
              id,
              field_name,
              value,
              unit,
              normal_min,
              normal_max,
              is_abnormal,
              visit_tests (
                visit_id,
                visits (
                  visit_date
                )
              )
            `)
            .in('visit_test_id',
              (visitsData || [])
                .flatMap(v => v.visit_tests.map(vt => vt.id))
                .slice(0, 50)
            );

          if (resultsError && resultsError.code !== 'PGRST116') throw resultsError;

          // Transform results data
          const transformedResults = (resultsData || []).map((result: any) => ({
            id: result.id,
            field_name: result.field_name,
            value: result.value,
            unit: result.unit,
            normal_min: result.normal_min,
            normal_max: result.normal_max,
            is_abnormal: result.is_abnormal,
            visit_date: result.visit_tests?.visits?.visit_date || '',
            visit_id: result.visit_tests?.visit_id || '',
          }));

          setTestResults(transformedResults);
        }
        setLoading(false);
      } catch (err) {
        console.error('Error fetching patient data:', err);
        setError(err instanceof Error ? err.message : 'Failed to load patient data');
        setLoading(false);
      }
    };

    fetchPatientData();
  }, [patientId, supabase]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading patient profile...</p>
        </div>
      </div>
    );
  }

  if (error || !patient) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-4xl mx-auto">
          <div className="bg-red-50 border border-red-200 rounded-lg p-6">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-6 h-6 text-red-600" />
              <div>
                <h3 className="font-semibold text-red-900">Error Loading Profile</h3>
                <p className="text-red-700">{error || 'Patient not found'}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const age = differenceInYears(new Date(), new Date(patient.date_of_birth));
  const recentResults = testResults.slice(0, 10);

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              {patient.first_name} {patient.last_name}
            </h1>
            <p className="text-gray-600">Patient ID: {patient.patient_id}</p>
          </div>
          <div className="flex gap-3">
            <Link
              href={`/dashboard/visits/new?patientId=${patientId}`}
              className="inline-flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-medium transition"
            >
              <Plus className="w-5 h-5" />
              New Visit
            </Link>
            <button
              onClick={() => window.print()}
              className="inline-flex items-center gap-2 bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg font-medium transition"
            >
              <Printer className="w-5 h-5" />
              Print History
            </button>
          </div>
        </div>

        {/* Patient Info Card */}
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          <div className="bg-green-600 px-6 py-4">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <User className="w-6 h-6" />
              Patient Information
            </h2>
          </div>

          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Left Column */}
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <Calendar className="w-5 h-5 text-gray-400 mt-1" />
                  <div>
                    <p className="text-sm text-gray-600">Date of Birth</p>
                    <p className="font-medium text-gray-900">
                      {format(new Date(patient.date_of_birth), 'MMMM d, yyyy')} ({age} years)
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Shield className="w-5 h-5 text-gray-400 mt-1" />
                  <div>
                    <p className="text-sm text-gray-600">Gender</p>
                    <p className="font-medium text-gray-900 capitalize">{patient.gender}</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Phone className="w-5 h-5 text-gray-400 mt-1" />
                  <div>
                    <p className="text-sm text-gray-600">Phone</p>
                    <p className="font-medium text-gray-900">
                      <a href={`tel:${patient.phone}`} className="hover:text-green-600">
                        {patient.phone}
                      </a>
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Mail className="w-5 h-5 text-gray-400 mt-1" />
                  <div>
                    <p className="text-sm text-gray-600">Email</p>
                    <p className="font-medium text-gray-900">
                      <a href={`mailto:${patient.email}`} className="hover:text-green-600">
                        {patient.email}
                      </a>
                    </p>
                  </div>
                </div>
              </div>

              {/* Right Column */}
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <MapPin className="w-5 h-5 text-gray-400 mt-1" />
                  <div>
                    <p className="text-sm text-gray-600">Address</p>
                    <p className="font-medium text-gray-900">
                      {patient.address}
                      <br />
                      {patient.city}, {patient.state} {patient.postal_code}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Shield className="w-5 h-5 text-gray-400 mt-1" />
                  <div>
                    <p className="text-sm text-gray-600">Insurance</p>
                    <p className="font-medium text-gray-900">
                      {patient.insurance_provider}
                      <br />
                      ID: {patient.insurance_id}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Phone className="w-5 h-5 text-gray-400 mt-1" />
                  <div>
                    <p className="text-sm text-gray-600">Emergency Contact</p>
                    <p className="font-medium text-gray-900">
                      {patient.emergency_contact_name}
                      <br />
                      {patient.emergency_contact_phone}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {patient.notes && (
              <div className="mt-6 pt-6 border-t">
                <p className="text-sm text-gray-600 mb-2">Notes</p>
                <p className="text-gray-900 bg-gray-50 p-3 rounded">{patient.notes}</p>
              </div>
            )}

            <div className="mt-6 pt-6 border-t">
              <button
                onClick={() => alert('Edit patient feature coming soon')}
                className="inline-flex items-center gap-2 text-green-600 hover:text-green-700 font-medium"
              >
                Edit Patient Information
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Visit History Timeline */}
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          <div className="bg-green-600 px-6 py-4">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Clock className="w-6 h-6" />
              Visit History
            </h2>
          </div>

          {visits.length === 0 ? (
            <div className="p-6 text-center text-gray-600">
              <p>No visits found for this patient.</p>
            </div>
          ) : (
            <div className="p-6">
              <div className="space-y-6">
                {visits.map((visit, index) => {
                  const config = statusConfig[visit.status];
                  return (
                    <div key={visit.id} className="relative">
                      {/* Timeline line */}
                      {index !== visits.length - 1 && (
                        <div className="absolute left-6 top-16 w-0.5 h-20 bg-gray-200"></div>
                      )}

                      <div className="flex gap-4">
                        {/* Timeline dot */}
                        <div className="flex flex-col items-center">
                          <div className="w-4 h-4 bg-green-600 rounded-full border-4 border-white shadow-md"></div>
                        </div>

                        {/* Visit content */}
                        <div className="flex-1 pb-4">
                          <div className={`${config.bg} border border-gray-200 rounded-lg p-4`}>
                            {/* Visit header */}
                            <div className="flex items-start justify-between mb-3">
                              <div>
                                <p className="font-semibold text-gray-900">
                                  {format(new Date(visit.visit_date), 'MMMM d, yyyy')}
                                </p>
                                <p className="text-sm text-gray-600">
                                  {format(new Date(visit.visit_date), 'h:mm a')}
                                </p>
                              </div>
                              <span className={`${config.badge} ${config.text} px-3 py-1 rounded-full text-sm font-medium`}>
                                {config.label}
                              </span>
                            </div>

                            {/* Tests */}
                            {visit.visit_tests && visit.visit_tests.length > 0 && (
                              <div className="mb-3">
                                <p className="text-sm font-medium text-gray-900 mb-2">Tests:</p>
                                <div className="flex flex-wrap gap-2">
                                  {visit.visit_tests.map(vt => (
                                    <span
                                      key={vt.id}
                                      className="bg-white bg-opacity-60 text-gray-800 text-xs px-2 py-1 rounded border border-gray-200"
                                    >
                                      {vt.test_types.name}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Doctor Notes */}
                            {visit.doctor_notes && visit.doctor_notes.length > 0 && (
                              <div className="mb-3">
                                <p className="text-sm font-medium text-gray-900 mb-2">Doctor Notes:</p>
                                {visit.doctor_notes.map(note => (
                                  <div key={note.id} className="bg-white bg-opacity-60 p-2 rounded text-sm mb-2">
                                    <p className="font-medium text-gray-800">{note.profiles.full_name}</p>
                                    <p className="text-gray-700">{note.notes}</p>
                                    <p className="text-xs text-gray-600">
                                      {format(new Date(note.created_at), 'MMM d, yyyy h:mm a')}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* Payment */}
                            {visit.payments && visit.payments.length > 0 && (
                              <div className="mb-3">
                                {visit.payments.map(payment => (
                                  <div key={payment.id} className="flex items-center gap-2 text-sm">
                                    <Banknote className="w-4 h-4 text-gray-600" />
                                    <span className="text-gray-900">
                                      Amount: <span className="font-semibold">{formatGHS(payment.amount)}</span>
                                    </span>
                                    <span className={`ml-auto px-2 py-0.5 rounded text-xs font-medium ${
                                      payment.status === 'paid'
                                        ? 'bg-green-100 text-green-800'
                                        : 'bg-yellow-100 text-yellow-800'
                                    }`}>
                                      {payment.status === 'paid' ? 'Paid' : 'Pending'}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* View Details Link */}
                            <Link
                              href={`/dashboard/visits/${visit.id}`}
                              className="inline-flex items-center gap-2 text-green-600 hover:text-green-700 text-sm font-medium mt-2"
                            >
                              View Full Details
                              <ChevronRight className="w-4 h-4" />
                            </Link>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Test Results Summary */}
        {recentResults.length > 0 && (
          <div className="bg-white rounded-lg shadow-md overflow-hidden">
            <div className="bg-green-600 px-6 py-4">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <FileText className="w-6 h-6" />
                Recent Test Results
              </h2>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Test</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Value</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Normal Range</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Status</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {recentResults.map(result => (
                    <tr key={result.id} className={result.is_abnormal ? 'bg-red-50' : 'hover:bg-gray-50'}>
                      <td className="px-6 py-4 text-sm font-medium text-gray-900">{result.field_name}</td>
                      <td className={`px-6 py-4 text-sm ${result.is_abnormal ? 'text-red-600 font-semibold' : 'text-gray-900'}`}>
                        {result.value} {result.unit}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {result.normal_min !== null && result.normal_max !== null
                          ? `${result.normal_min} - ${result.normal_max}`
                          : result.normal_min !== null
                          ? `> ${result.normal_min}`
                          : result.normal_max !== null
                          ? `< ${result.normal_max}`
                          : 'N/A'}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        {result.is_abnormal ? (
                          <span className="inline-flex items-center gap-1 bg-red-100 text-red-800 px-2 py-1 rounded-full text-xs font-medium">
                            <AlertCircle className="w-3 h-3" />
                            Abnormal
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 bg-green-100 text-green-800 px-2 py-1 rounded-full text-xs font-medium">
                            Normal
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {format(new Date(result.visit_date), 'MMM d, yyyy')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
