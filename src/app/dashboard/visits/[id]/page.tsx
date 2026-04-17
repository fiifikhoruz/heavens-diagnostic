'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import {
  Visit, VisitStatus, Patient, Gender, UserRole, VisitTest, TestResult,
  Sample, DoctorNote, Payment, TestTemplate, TestTemplateField
} from '@/lib/types';

interface TestWithTemplate {
  test: VisitTest;
  testTypeInfo?: any;
  template?: TestTemplate;
  fields?: TestTemplateField[];
  results?: TestResult[];
}

interface FieldWithValue {
  field: TestTemplateField;
  value: string;
  isAbnormal: boolean;
  isHigh?: boolean;
  isLow?: boolean;
}

export default function VisitDetailPage() {
  const params = useParams();
  const router = useRouter();
  const supabase = createClient();
  const visitId = params.id as string;

  const [visit, setVisit] = useState<Visit | null>(null);
  const [patient, setPatient] = useState<Patient | null>(null);
  const [tests, setTests] = useState<TestWithTemplate[]>([]);
  const [samples, setSamples] = useState<Sample[]>([]);
  const [notes, setNotes] = useState<DoctorNote[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [timestamps, setTimestamps] = useState<any[]>([]);
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [fieldValues, setFieldValues] = useState<Record<string, FieldWithValue[]>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [newNote, setNewNote] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [paymentDeferred, setPaymentDeferred] = useState(false);
  const [reportToken, setReportToken] = useState('');
  const [reportDownloadUrl, setReportDownloadUrl] = useState('');
  const [reportExpiresAt, setReportExpiresAt] = useState('');
  const [smsPhoneNumber, setSmsPhoneNumber] = useState('');
  const [smsMessage, setSmsMessage] = useState('');
  const [smsLoading, setSmsLoading] = useState(false);
  const [smsSuccess, setSmsSuccess] = useState(false);
  const [patientCollected, setPatientCollected] = useState(false);
  const [collectedByName, setCollectedByName] = useState('');

  // Sensitive test types that require doctor/admin access
  const SENSITIVE_TESTS = ['HIV', 'Hepatitis B', 'hepatitis b', 'hiv'];

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
            setUserRole(profileData.role as UserRole);
          }
        }
      } catch (err) {
        console.error('Error fetching user role:', err);
      }
    };
    fetchUserRole();
  }, [supabase]);

  useEffect(() => {
    const fetchVisitData = async () => {
      try {
        // Fetch visit
        const { data: visitData, error: visitError } = await supabase
          .from('visits')
          .select('*')
          .eq('id', visitId)
          .single();

        if (visitError || !visitData) {
          setError('Visit not found');
          return;
        }

        const mappedVisit: Visit = {
          id: visitData.id,
          patientId: visitData.patient_id,
          visitDate: visitData.visit_date,
          status: visitData.status as VisitStatus,
          createdBy: visitData.created_by,
          createdAt: visitData.created_at,
          updatedAt: visitData.updated_at,
        };
        setVisit(mappedVisit);

        // Fetch patient
        const { data: patientData } = await supabase
          .from('patients')
          .select('*')
          .eq('id', visitData.patient_id)
          .single();

        if (patientData) {
          const mappedPatient: Patient = {
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
          setPatient(mappedPatient);
          // Initialize SMS phone number with patient's phone
          setSmsPhoneNumber(patientData.phone || '');
          // Initialize default SMS message
          setSmsMessage(`Your test results are ready. Please visit our clinic or contact us for delivery.`);
        }

        // Fetch tests with templates and fields
        const { data: testsData } = await supabase
          .from('visit_tests')
          .select('*')
          .eq('visit_id', visitId);

        if (testsData) {
          const testWithTemplates: TestWithTemplate[] = [];

          for (const t of testsData as any[]) {
            const mappedTest: VisitTest = {
              id: t.id,
              visitId: t.visit_id,
              testTypeId: t.test_type_id,
              assignedTo: t.assigned_to,
              status: t.status,
              createdAt: t.created_at,
            };

            // Fetch test type info
            const { data: testTypeData } = await supabase
              .from('test_types')
              .select('*')
              .eq('id', t.test_type_id)
              .single();

            // Fetch template
            const { data: templateData } = await supabase
              .from('test_templates')
              .select('*')
              .eq('test_type_id', t.test_type_id)
              .single();

            let fieldsData: TestTemplateField[] = [];
            let resultsData: TestResult[] = [];

            if (templateData) {
              // Fetch template fields
              const { data: templateFields } = await supabase
                .from('test_template_fields')
                .select('*')
                .eq('template_id', templateData.id)
                .order('display_order', { ascending: true });

              if (templateFields) {
                fieldsData = templateFields.map(f => ({
                  id: f.id,
                  templateId: f.template_id,
                  fieldName: f.field_name,
                  unit: f.unit,
                  normalMin: f.normal_min,
                  normalMax: f.normal_max,
                  displayOrder: f.display_order,
                  createdAt: f.created_at,
                })) as TestTemplateField[];
              }

              // Fetch existing results for this test
              const { data: testResults } = await supabase
                .from('test_results')
                .select('*')
                .eq('test_id', t.id);

              if (testResults) {
                resultsData = testResults.map(r => ({
                  id: r.id,
                  testId: r.test_id,
                  fieldName: r.field_name,
                  value: r.value,
                  unit: r.unit,
                  normalMin: r.normal_min,
                  normalMax: r.normal_max,
                  isAbnormal: r.is_abnormal,
                })) as TestResult[];
              }

              // Initialize field values for this test
              const initialValues: FieldWithValue[] = fieldsData.map(field => {
                const existingResult = resultsData.find(r => r.fieldName === field.fieldName);
                const value = existingResult?.value || '';
                const isAbnormal = existingResult?.isAbnormal || false;
                const numValue = parseFloat(value);
                const isHigh = !isNaN(numValue) && field.normalMax !== null && numValue > field.normalMax;
                const isLow = !isNaN(numValue) && field.normalMin !== null && numValue < field.normalMin;

                return {
                  field,
                  value,
                  isAbnormal: isAbnormal || isHigh || isLow,
                  isHigh,
                  isLow,
                };
              });

              setFieldValues(prev => ({
                ...prev,
                [t.id]: initialValues,
              }));
            }

            testWithTemplates.push({
              test: mappedTest,
              testTypeInfo: testTypeData,
              template: templateData ? {
                id: templateData.id,
                testTypeId: templateData.test_type_id,
                name: templateData.name,
                createdAt: templateData.created_at,
              } : undefined,
              fields: fieldsData,
              results: resultsData,
            });
          }

          setTests(testWithTemplates);
        }

        // Fetch samples
        const { data: samplesData } = await supabase
          .from('samples')
          .select('*')
          .eq('visit_id', visitId);

        if (samplesData) {
          const mappedSamples: Sample[] = (samplesData as any[]).map(s => ({
            id: s.id,
            visitId: s.visit_id,
            sampleType: s.sample_type,
            barcode: s.barcode,
            collectedAt: s.collected_at,
            collectedBy: s.collected_by,
            status: s.status,
            notes: s.notes,
          }));
          setSamples(mappedSamples);
        }

        // Fetch doctor notes
        const { data: notesData } = await supabase
          .from('doctor_notes')
          .select('*')
          .eq('visit_id', visitId);

        if (notesData) {
          const mappedNotes: DoctorNote[] = (notesData as any[]).map(n => ({
            id: n.id,
            visitId: n.visit_id,
            doctorId: n.doctor_id,
            notes: n.notes,
            createdAt: n.created_at,
          }));
          setNotes(mappedNotes);
        }

        // Fetch payments
        const { data: paymentsData } = await supabase
          .from('payments')
          .select('*')
          .eq('visit_id', visitId);

        if (paymentsData) {
          const mappedPayments: Payment[] = (paymentsData as any[]).map(p => ({
            id: p.id,
            visitId: p.visit_id,
            amount: p.amount,
            status: p.status,
            method: p.method,
            receivedBy: p.received_by,
            createdAt: p.created_at,
          }));
          setPayments(mappedPayments);
        }

        // Fetch timestamps
        const { data: timestampsData } = await supabase
          .from('visit_timestamps')
          .select('*')
          .eq('visit_id', visitId);

        if (timestampsData) {
          setTimestamps(timestampsData);
        }
      } catch (err) {
        console.error('Error fetching visit data:', err);
        setError('An error occurred while loading visit data');
      } finally {
        setIsLoading(false);
      }
    };

    fetchVisitData();
  }, [supabase, visitId]);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
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

  const getStatusProgressIndex = (status: VisitStatus): number => {
    const statusOrder = [VisitStatus.CREATED, VisitStatus.COLLECTED, VisitStatus.PROCESSING, VisitStatus.REVIEW, VisitStatus.APPROVED, VisitStatus.DELIVERED];
    return statusOrder.indexOf(status);
  };

  const isSensitiveTest = (testName: string | undefined): boolean => {
    if (!testName) return false;
    return SENSITIVE_TESTS.some(st => testName.toLowerCase().includes(st.toLowerCase()));
  };

  const canViewResults = (testName: string | undefined): boolean => {
    if (!isSensitiveTest(testName)) return true;
    return userRole === UserRole.DOCTOR || userRole === UserRole.ADMIN;
  };

  const handleFieldValueChange = (testId: string, fieldIndex: number, newValue: string) => {
    setFieldValues(prev => {
      const testFields = prev[testId] || [];
      const updated = [...testFields];

      if (updated[fieldIndex]) {
        const field = updated[fieldIndex].field;
        const numValue = parseFloat(newValue);
        const isHigh = !isNaN(numValue) && field.normalMax !== null && numValue > field.normalMax;
        const isLow = !isNaN(numValue) && field.normalMin !== null && numValue < field.normalMin;

        updated[fieldIndex] = {
          ...updated[fieldIndex],
          value: newValue,
          isAbnormal: isHigh || isLow,
          isHigh,
          isLow,
        };
      }

      return {
        ...prev,
        [testId]: updated,
      };
    });
  };

  const handleSaveResults = async (testId: string) => {
    setIsSaving(true);
    try {
      const fieldsToSave = fieldValues[testId] || [];

      for (const fieldWithValue of fieldsToSave) {
        if (!fieldWithValue.value.trim()) continue;

        // Check if result already exists
        const { data: existingResult } = await supabase
          .from('test_results')
          .select('id')
          .eq('test_id', testId)
          .eq('field_name', fieldWithValue.field.fieldName)
          .single();

        const resultData = {
          test_id: testId,
          field_name: fieldWithValue.field.fieldName,
          value: fieldWithValue.value,
          unit: fieldWithValue.field.unit,
          normal_min: fieldWithValue.field.normalMin,
          normal_max: fieldWithValue.field.normalMax,
          is_abnormal: fieldWithValue.isAbnormal,
        };

        if (existingResult) {
          // Update existing
          await supabase
            .from('test_results')
            .update(resultData)
            .eq('id', existingResult.id);
        } else {
          // Insert new
          await supabase
            .from('test_results')
            .insert(resultData);
        }
      }

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      console.error('Error saving results:', err);
      setError('Failed to save results');
    } finally {
      setIsSaving(false);
    }
  };

  // === WORKFLOW ACTION HANDLERS ===

  const handleInPersonCollection = async () => {
    if (!visit || !patientCollected || !collectedByName.trim()) {
      setError('Please confirm patient collection and enter the collector name');
      return;
    }

    setActionLoading('in-person-delivery');
    try {
      // Update visit status to delivered
      const { error: updateError } = await supabase
        .from('visits')
        .update({ status: 'delivered' })
        .eq('id', visit.id);

      if (updateError) {
        setError(`Failed to mark as delivered: ${updateError.message}`);
        setActionLoading(null);
        return;
      }

      setVisit({ ...visit, status: 'delivered' as VisitStatus });

      // Log to notifications table
      try {
        const { data: authData } = await supabase.auth.getUser();
        const notificationData = {
          visit_id: visit.id,
          status: 'delivered',
          created_at: new Date().toISOString(),
          created_by: authData.user?.id || null,
          metadata: {
            collectedBy: collectedByName,
            collectionMethod: 'in-person',
          },
        };

        await (supabase as any).from('notifications').insert(notificationData);

        // visit_timestamps are auto-updated by the DB trigger on status change
      } catch (err) {
        console.error('Error logging notification:', err);
        // Don't fail the delivery if notification logging fails
      }

      // Reset form
      setPatientCollected(false);
      setCollectedByName('');

      setError('');
      // Show success via existing success mechanism
      setTimeout(() => {
        router.push(`/dashboard/visits/${visit.id}`);
      }, 1500);
    } catch (err) {
      console.error('Error processing in-person collection:', err);
      setError('Failed to process collection');
    } finally {
      setActionLoading(null);
    }
  };

  const handleTransitionStatus = async (newStatus: string) => {
    if (!visit) return;
    setActionLoading(newStatus);
    try {
      const { error: updateError } = await supabase
        .from('visits')
        .update({ status: newStatus })
        .eq('id', visit.id);

      if (updateError) {
        setError(`Failed to update status: ${updateError.message}`);
      } else {
        setVisit({ ...visit, status: newStatus as VisitStatus });

        // If transitioning to delivered, log to notifications table
        if (newStatus === 'delivered') {
          try {
            const { data: authData } = await supabase.auth.getUser();
            const notificationData = {
              visit_id: visit.id,
              status: 'delivered',
              created_at: new Date().toISOString(),
              created_by: authData.user?.id || null,
            };

            await (supabase as any).from('notifications').insert(notificationData);

            // visit_timestamps are auto-updated by the DB trigger on status change
          } catch (err) {
            console.error('Error logging notification:', err);
            // Don't fail the status transition if notification logging fails
          }
        }
      }
    } catch (err) {
      setError('Failed to update visit status');
    } finally {
      setActionLoading(null);
    }
  };

  const handleRecordPayment = async () => {
    if (!visit) return;
    setActionLoading('payment');
    try {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (!currentUser) {
        setError('Your session has expired. Please log in again.');
        setActionLoading(null);
        return;
      }
      const existingPayment = payments[0];
      if (existingPayment) {
        const newStatus = paymentDeferred ? 'deferred' : 'paid';
        const { error: updateError } = await supabase
          .from('payments')
          .update({
            status: newStatus,
            method: paymentDeferred ? null : paymentMethod,
            received_by: currentUser.id,
          })
          .eq('id', existingPayment.id);

        if (updateError) {
          setError(`Failed to update payment: ${updateError.message}`);
        } else {
          setPayments(prev => prev.map(p =>
            p.id === existingPayment.id
              ? { ...p, status: newStatus as any, method: paymentDeferred ? null : paymentMethod as any }
              : p
          ));
        }
      }
    } catch (err) {
      setError('Failed to record payment');
    } finally {
      setActionLoading(null);
    }
  };

  const handleAddNote = async () => {
    if (!visit || !newNote.trim()) return;
    setActionLoading('note');
    try {
      const { data: authData } = await supabase.auth.getSession();
      if (!authData.session) return;

      const { data: noteData, error: noteError } = await supabase
        .from('doctor_notes')
        .insert({
          visit_id: visit.id,
          doctor_id: authData.session.user.id,
          notes: newNote.trim(),
        })
        .select()
        .single();

      if (noteError) {
        setError(`Failed to add note: ${noteError.message}`);
      } else if (noteData) {
        setNotes(prev => [...prev, {
          id: noteData.id,
          visitId: noteData.visit_id,
          doctorId: noteData.doctor_id,
          notes: noteData.notes,
          createdAt: noteData.created_at,
        }]);
        setNewNote('');
      }
    } catch (err) {
      setError('Failed to add note');
    } finally {
      setActionLoading(null);
    }
  };

  const handleCollectSamples = async () => {
    if (!visit) return;
    setActionLoading('collect');
    try {
      const { data: authData } = await supabase.auth.getSession();
      if (!authData.session) return;

      // Update all samples to collected
      const { error: sampleError } = await supabase
        .from('samples')
        .update({
          status: 'collected',
          collected_at: new Date().toISOString(),
          collected_by: authData.session.user.id,
        })
        .eq('visit_id', visit.id)
        .eq('status', 'pending');

      if (sampleError) {
        setError(`Failed to collect samples: ${sampleError.message}`);
      } else {
        setSamples(prev => prev.map(s => ({
          ...s,
          status: 'collected' as any,
          collectedAt: new Date().toISOString(),
          collectedBy: authData.session!.user.id,
        })));

        // Transition visit to collected
        await handleTransitionStatus('collected');
      }
    } catch (err) {
      setError('Failed to collect samples');
    } finally {
      setActionLoading(null);
    }
  };

  const handleGenerateReportToken = async () => {
    if (!visit) return;
    setActionLoading('generateToken');
    try {
      const { data: authData } = await supabase.auth.getSession();
      if (!authData.session) {
        setError('Not authenticated');
        return;
      }

      const response = await fetch('/api/reports/generate-token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authData.session.access_token}`,
        },
        body: JSON.stringify({ visitId: visit.id }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to generate token');
        return;
      }

      const data = await response.json();
      setReportToken(data.token);
      setReportDownloadUrl(data.downloadUrl);
      setReportExpiresAt(data.expiresAt);
    } catch (err) {
      console.error('Error generating report token:', err);
      setError('Failed to generate report token');
    } finally {
      setActionLoading(null);
    }
  };

  const handleSendSmsNotification = async () => {
    if (!visit || !smsPhoneNumber.trim() || !smsMessage.trim()) {
      setError('Phone number and message are required');
      return;
    }

    setSmsLoading(true);
    try {
      const { data: authData } = await supabase.auth.getSession();
      if (!authData.session) {
        setError('Not authenticated');
        return;
      }

      const response = await fetch('/api/sms/notify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authData.session.access_token}`,
        },
        body: JSON.stringify({
          visitId: visit.id,
          phoneNumber: smsPhoneNumber,
          message: smsMessage,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to send SMS');
        return;
      }

      setSmsSuccess(true);
      setTimeout(() => setSmsSuccess(false), 3000);
    } catch (err) {
      console.error('Error sending SMS:', err);
      setError('Failed to send SMS notification');
    } finally {
      setSmsLoading(false);
    }
  };

  const canProceedToProcessing = (): boolean => {
    if (payments.length === 0) return false;
    const payment = payments[0];
    return payment.status === 'paid' || payment.status === ('deferred' as any);
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

  if (error || !visit || !patient) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          {error || 'Visit not found'}
        </div>
        <Link href="/dashboard/visits" className="text-green-600 hover:text-green-700 font-medium mt-4 inline-flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Visits
        </Link>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <Link href="/dashboard/visits" className="text-green-600 hover:text-green-700 font-medium mb-4 inline-flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Visits
        </Link>
        <h1 className="text-3xl font-bold text-gray-900">
          Visit: {patient.firstName} {patient.lastName}
        </h1>
        <p className="text-gray-600 mt-1">Visit Date: {formatDate(visit.visitDate)}</p>
      </div>

      {/* Status Progress Bar */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Visit Status</h2>
        <div className="flex items-center justify-between gap-2 mb-4">
          {[VisitStatus.CREATED, VisitStatus.COLLECTED, VisitStatus.PROCESSING, VisitStatus.REVIEW, VisitStatus.APPROVED, VisitStatus.DELIVERED].map((status, index) => {
            const isCompleted = getStatusProgressIndex(visit.status) >= index;
            const isCurrent = visit.status === status;
            return (
              <div key={status} className="flex-1">
                <div
                  className={`h-2 rounded-full transition ${
                    isCompleted ? 'bg-green-600' : 'bg-gray-200'
                  }`}
                ></div>
                <p className={`text-xs font-medium mt-2 text-center capitalize ${
                  isCurrent ? 'text-green-600' : 'text-gray-600'
                }`}>
                  {status}
                </p>
              </div>
            );
          })}
        </div>
        <div className="text-center">
          <span className={`inline-block px-4 py-2 rounded-full text-sm font-medium capitalize ${getStatusColor(visit.status)}`}>
            {visit.status}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Visit Information */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Visit Information</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-600">Visit ID</p>
                <p className="font-mono font-medium text-gray-900">{visit.id.substring(0, 12)}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Patient</p>
                <Link href={`/dashboard/patients/${patient.id}`} className="text-green-600 hover:text-green-700 font-medium">
                  {patient.firstName} {patient.lastName}
                </Link>
              </div>
              <div>
                <p className="text-sm text-gray-600">Visit Date</p>
                <p className="font-medium text-gray-900">{formatDate(visit.visitDate)}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Created By</p>
                <p className="font-medium text-gray-900">{visit.createdBy}</p>
              </div>
            </div>
          </div>

          {/* Results Section */}
          {tests.length > 0 && (
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-6">Test Results</h2>
              <div className="space-y-8">
                {tests.map((testWithTemplate) => {
                  const testName = testWithTemplate.testTypeInfo?.name || 'Unknown Test';
                  const showResults = canViewResults(testName);

                  if (!showResults) {
                    return (
                      <div key={testWithTemplate.test.id} className="border-l-4 border-red-400 bg-red-50 p-4">
                        <p className="text-red-800 font-medium">
                          {testName} - Restricted Access
                        </p>
                        <p className="text-sm text-red-700 mt-1">Only doctors and administrators can view results for this sensitive test.</p>
                      </div>
                    );
                  }

                  return (
                    <div key={testWithTemplate.test.id} className="border-b pb-6 last:border-b-0">
                      <h3 className="text-base font-semibold text-gray-900 mb-4">{testName}</h3>

                      {testWithTemplate.fields && testWithTemplate.fields.length > 0 ? (
                        <div>
                          <div className="overflow-x-auto mb-4">
                            <table className="w-full text-sm">
                              <thead className="bg-gray-50 border-b border-gray-200">
                                <tr>
                                  <th className="px-4 py-3 text-left font-semibold text-gray-900">Parameter</th>
                                  <th className="px-4 py-3 text-left font-semibold text-gray-900">Result</th>
                                  <th className="px-4 py-3 text-left font-semibold text-gray-900">Unit</th>
                                  <th className="px-4 py-3 text-left font-semibold text-gray-900">Reference</th>
                                  <th className="px-4 py-3 text-left font-semibold text-gray-900">Flag</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-200">
                                {(fieldValues[testWithTemplate.test.id] || []).map((fieldWithValue, index) => {
                                  const bgColor = fieldWithValue.isAbnormal
                                    ? fieldWithValue.isHigh ? 'bg-red-50' : 'bg-yellow-50'
                                    : 'bg-white';
                                  const inputBgColor = fieldWithValue.isAbnormal
                                    ? fieldWithValue.isHigh ? 'bg-red-100 border-red-300' : 'bg-yellow-100 border-yellow-300'
                                    : 'bg-white border-gray-300';
                                  const textColor = fieldWithValue.isAbnormal
                                    ? fieldWithValue.isHigh ? 'text-red-900' : 'text-amber-900'
                                    : 'text-gray-900';

                                  return (
                                    <tr key={index} className={bgColor}>
                                      <td className="px-4 py-3 font-medium text-gray-900">
                                        {fieldWithValue.field.fieldName}
                                      </td>
                                      <td className="px-4 py-3">
                                        <input
                                          type="number"
                                          step="0.1"
                                          value={fieldWithValue.value}
                                          onChange={(e) => handleFieldValueChange(testWithTemplate.test.id, index, e.target.value)}
                                          placeholder="Enter value"
                                          className={`w-24 px-2 py-1 border rounded focus:outline-none focus:ring-2 focus:ring-green-600 ${inputBgColor}`}
                                        />
                                      </td>
                                      <td className={`px-4 py-3 text-gray-600 font-medium`}>
                                        {fieldWithValue.field.unit || '-'}
                                      </td>
                                      <td className="px-4 py-3 text-gray-500 text-sm">
                                        {fieldWithValue.field.normalMin !== null && fieldWithValue.field.normalMax !== null
                                          ? `${fieldWithValue.field.normalMin} - ${fieldWithValue.field.normalMax}`
                                          : '-'
                                        }
                                      </td>
                                      <td className="px-4 py-3">
                                        {fieldWithValue.isAbnormal && (
                                          <div className="flex items-center gap-1">
                                            <span className={`px-2 py-1 rounded text-xs font-bold text-white ${
                                              fieldWithValue.isHigh ? 'bg-red-600' : 'bg-amber-600'
                                            }`}>
                                              {fieldWithValue.isHigh ? 'H' : 'L'}
                                            </span>
                                            <svg className="w-4 h-4 text-orange-500" fill="currentColor" viewBox="0 0 20 20">
                                              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                                            </svg>
                                          </div>
                                        )}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>

                          {(userRole === UserRole.TECHNICIAN || userRole === UserRole.ADMIN) && (
                            <button
                              onClick={() => handleSaveResults(testWithTemplate.test.id)}
                              disabled={isSaving}
                              className="bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white font-medium py-2 px-4 rounded-lg transition text-sm"
                            >
                              {isSaving ? 'Saving...' : 'Save Results'}
                            </button>
                          )}
                        </div>
                      ) : (
                        <p className="text-gray-600 text-sm">No template fields configured for this test</p>
                      )}
                    </div>
                  );
                })}
              </div>

              {saveSuccess && (
                <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg text-green-800 text-sm">
                  Results saved successfully!
                </div>
              )}
            </div>
          )}

          {/* Samples Section */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Samples</h2>
            {samples.length === 0 ? (
              <p className="text-gray-600">No samples collected yet</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-2 text-left font-semibold text-gray-900">Sample Type</th>
                      <th className="px-4 py-2 text-left font-semibold text-gray-900">Status</th>
                      <th className="px-4 py-2 text-left font-semibold text-gray-900">Barcode</th>
                      <th className="px-4 py-2 text-left font-semibold text-gray-900">Collected By</th>
                      <th className="px-4 py-2 text-left font-semibold text-gray-900">Collected At</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {samples.map((sample) => (
                      <tr key={sample.id} className="hover:bg-gray-50">
                        <td className="px-4 py-2 capitalize text-gray-900">{sample.sampleType}</td>
                        <td className="px-4 py-2">
                          <span className={`inline-block px-2 py-1 rounded text-xs font-medium capitalize ${
                            sample.status === 'collected' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                          }`}>
                            {sample.status}
                          </span>
                        </td>
                        <td className="px-4 py-2 font-mono text-gray-600">{sample.barcode || '-'}</td>
                        <td className="px-4 py-2 text-gray-600">{sample.collectedBy || '-'}</td>
                        <td className="px-4 py-2 text-gray-600">{sample.collectedAt ? formatDateTime(sample.collectedAt) : '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Doctor Notes Section */}
          {(userRole === UserRole.DOCTOR || userRole === UserRole.ADMIN) && (
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Doctor Notes</h2>
              {notes.length === 0 ? (
                <p className="text-gray-600 mb-4">No notes yet</p>
              ) : (
                <div className="space-y-4 mb-4">
                  {notes.map((note) => (
                    <div key={note.id} className="border border-gray-200 rounded p-4 bg-gray-50">
                      <p className="text-sm font-medium text-gray-600 mb-2">{formatDateTime(note.createdAt)}</p>
                      <p className="text-gray-900">{note.notes}</p>
                    </div>
                  ))}
                </div>
              )}
              {/* Add Note Form */}
              <div className="border-t border-gray-200 pt-4">
                <textarea
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  rows={3}
                  placeholder="Add a note about this visit..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-600 text-sm"
                />
                <button
                  onClick={handleAddNote}
                  disabled={!newNote.trim() || actionLoading === 'note'}
                  className="mt-2 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white font-medium py-2 px-4 rounded-lg transition text-sm"
                >
                  {actionLoading === 'note' ? 'Adding...' : 'Add Note'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Payment Section */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Payment</h2>
            {payments.length === 0 ? (
              <p className="text-gray-600 mb-4">No payment recorded</p>
            ) : (
              <div className="space-y-3 mb-4">
                {payments.map((payment) => (
                  <div key={payment.id}>
                    <p className="text-sm text-gray-600">Amount</p>
                    <p className="text-2xl font-bold text-gray-900">GHS {payment.amount.toFixed(2)}</p>
                    <p className="text-sm text-gray-600 mt-2">Status</p>
                    <p className={`inline-block px-2 py-1 rounded text-xs font-medium capitalize ${
                      payment.status === 'paid' ? 'bg-green-100 text-green-800'
                        : payment.status === ('deferred' as any) ? 'bg-blue-100 text-blue-800'
                        : 'bg-yellow-100 text-yellow-800'
                    }`}>
                      {payment.status}
                    </p>
                    {payment.method && (
                      <>
                        <p className="text-sm text-gray-600 mt-2">Method</p>
                        <p className="text-sm font-medium text-gray-900 capitalize">{payment.method}</p>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
            {(userRole === UserRole.FRONT_DESK || userRole === UserRole.ADMIN) &&
              payments.length > 0 && payments[0].status === 'unpaid' && (
              <div className="space-y-3 border-t border-gray-200 pt-4">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="deferred"
                    checked={paymentDeferred}
                    onChange={(e) => setPaymentDeferred(e.target.checked)}
                    className="rounded border-gray-300 text-green-600 focus:ring-green-500"
                  />
                  <label htmlFor="deferred" className="text-sm text-gray-700">Mark as deferred</label>
                </div>
                {!paymentDeferred && (
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-600"
                  >
                    <option value="cash">Cash</option>
                    <option value="momo">Mobile Money</option>
                    <option value="card">Card</option>
                    <option value="insurance">Insurance</option>
                  </select>
                )}
                <button
                  onClick={handleRecordPayment}
                  disabled={actionLoading === 'payment'}
                  className="w-full bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white font-medium py-2 px-4 rounded-lg transition text-sm"
                >
                  {actionLoading === 'payment' ? 'Processing...' : paymentDeferred ? 'Mark Deferred' : 'Record Payment'}
                </button>
              </div>
            )}
          </div>

          {/* Timestamps Section */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Timestamps</h2>
            {timestamps.length === 0 ? (
              <p className="text-gray-600 text-sm">No timestamps recorded</p>
            ) : (
              <div className="space-y-2">
                {(() => {
                  const ts = timestamps[0]; // single row per visit
                  const stages = [
                    { label: 'Created', value: ts.created_at },
                    { label: 'Collected', value: ts.collected_at },
                    { label: 'Processing', value: ts.processed_at },
                    { label: 'Reviewed', value: ts.reviewed_at },
                    { label: 'Approved', value: ts.approved_at },
                    { label: 'Delivered', value: ts.delivered_at },
                  ].filter(s => s.value);
                  return stages.map((s) => (
                    <div key={s.label} className="flex justify-between text-sm">
                      <p className="text-gray-600">{s.label}:</p>
                      <p className="font-medium text-gray-900">{formatDateTime(s.value)}</p>
                    </div>
                  ));
                })()}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Actions</h2>
            <div className="space-y-2">
              {/* CREATED -> COLLECTED: Technician collects samples */}
              {(userRole === UserRole.TECHNICIAN || userRole === UserRole.ADMIN) && visit.status === VisitStatus.CREATED && (
                <button
                  onClick={handleCollectSamples}
                  disabled={actionLoading === 'collect'}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium py-2 px-4 rounded-lg transition text-sm"
                >
                  {actionLoading === 'collect' ? 'Collecting...' : 'Mark Samples Collected'}
                </button>
              )}

              {/* COLLECTED -> PROCESSING: Requires payment */}
              {(userRole === UserRole.TECHNICIAN || userRole === UserRole.ADMIN) && visit.status === VisitStatus.COLLECTED && (
                <>
                  {!canProceedToProcessing() && (
                    <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
                      <p className="font-medium">Payment Required</p>
                      <p className="text-xs mt-1">Payment must be recorded or deferred before processing can begin.</p>
                    </div>
                  )}
                  <button
                    onClick={() => handleTransitionStatus('processing')}
                    disabled={actionLoading === 'processing' || !canProceedToProcessing()}
                    className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-purple-400 disabled:cursor-not-allowed text-white font-medium py-2 px-4 rounded-lg transition text-sm"
                  >
                    {actionLoading === 'processing' ? 'Starting...' : 'Start Processing'}
                  </button>
                </>
              )}

              {/* PROCESSING -> REVIEW: Technician sends for review */}
              {(userRole === UserRole.TECHNICIAN || userRole === UserRole.ADMIN) && visit.status === VisitStatus.PROCESSING && (
                <button
                  onClick={() => handleTransitionStatus('review')}
                  disabled={actionLoading === 'review'}
                  className="w-full bg-orange-600 hover:bg-orange-700 disabled:bg-orange-400 text-white font-medium py-2 px-4 rounded-lg transition text-sm"
                >
                  {actionLoading === 'review' ? 'Submitting...' : 'Submit for Doctor Review'}
                </button>
              )}

              {/* REVIEW -> APPROVED or PROCESSING: Doctor approves or requests retest */}
              {(userRole === UserRole.DOCTOR || userRole === UserRole.ADMIN) && visit.status === VisitStatus.REVIEW && (
                <>
                  <button
                    onClick={() => handleTransitionStatus('approved')}
                    disabled={actionLoading === 'approved'}
                    className="w-full bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white font-medium py-2 px-4 rounded-lg transition text-sm"
                  >
                    {actionLoading === 'approved' ? 'Approving...' : 'Approve Results'}
                  </button>
                  <button
                    onClick={() => handleTransitionStatus('processing')}
                    disabled={actionLoading === 'processing'}
                    className="w-full bg-gray-600 hover:bg-gray-700 disabled:bg-gray-400 text-white font-medium py-2 px-4 rounded-lg transition text-sm"
                  >
                    {actionLoading === 'processing' ? 'Sending Back...' : 'Request Retesting'}
                  </button>
                </>
              )}

              {/* APPROVED -> DELIVERED: Front desk delivers */}
              {(userRole === UserRole.FRONT_DESK || userRole === UserRole.ADMIN) && visit.status === VisitStatus.APPROVED && (
                <button
                  onClick={() => handleTransitionStatus('delivered')}
                  disabled={actionLoading === 'delivered'}
                  className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-purple-400 text-white font-medium py-2 px-4 rounded-lg transition text-sm"
                >
                  {actionLoading === 'delivered' ? 'Delivering...' : 'Mark as Delivered'}
                </button>
              )}

              {/* Show current status info */}
              {visit.status === VisitStatus.DELIVERED && (
                <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800">
                  <p className="font-medium">Visit Complete</p>
                  <p className="text-xs mt-1">Results have been delivered to the patient.</p>
                </div>
              )}
            </div>
          </div>

          {/* Results Delivery Section */}
          {(visit.status === VisitStatus.APPROVED || visit.status === VisitStatus.DELIVERED) && (
            <div className="bg-white rounded-lg shadow">
              <div className="bg-green-600 px-6 py-4">
                <h2 className="text-lg font-semibold text-white">Results Delivery</h2>
              </div>
              <div className="p-6 space-y-6">
                {/* Generate Report Link */}
                <div>
                  <h3 className="text-md font-semibold text-gray-900 mb-3">Generate Report Link</h3>
                  <p className="text-sm text-gray-600 mb-3">Create a secure download link for the patient's report</p>
                  <button
                    onClick={handleGenerateReportToken}
                    disabled={actionLoading === 'generateToken'}
                    className="bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white font-medium py-2 px-4 rounded-lg transition text-sm"
                  >
                    {actionLoading === 'generateToken' ? 'Generating...' : 'Generate Report Link'}
                  </button>

                  {reportDownloadUrl && (
                    <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
                      <p className="text-sm font-medium text-gray-900 mb-2">Secure Download URL:</p>
                      <div className="flex items-center gap-2 mb-3">
                        <input
                          type="text"
                          value={reportDownloadUrl}
                          readOnly
                          className="flex-1 px-3 py-2 bg-white border border-gray-300 rounded text-sm font-mono"
                        />
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(reportDownloadUrl);
                          }}
                          className="bg-gray-600 hover:bg-gray-700 text-white font-medium py-2 px-3 rounded text-sm"
                        >
                          Copy
                        </button>
                      </div>
                      <p className="text-xs text-gray-600">Link expires in 72 hours</p>
                    </div>
                  )}
                </div>

                {/* View/Print Report */}
                <div>
                  <h3 className="text-md font-semibold text-gray-900 mb-3">View Report</h3>
                  <Link
                    href={`/dashboard/visits/${visit.id}/report`}
                    className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition text-sm"
                  >
                    View/Print Report
                  </Link>
                </div>

                {/* Send SMS Notification */}
                <div>
                  <h3 className="text-md font-semibold text-gray-900 mb-3">Send SMS Notification</h3>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Patient Phone Number</label>
                      <input
                        type="tel"
                        value={smsPhoneNumber}
                        onChange={(e) => setSmsPhoneNumber(e.target.value)}
                        placeholder="Patient phone number"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Message</label>
                      <textarea
                        value={smsMessage}
                        onChange={(e) => setSmsMessage(e.target.value)}
                        rows={3}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent text-sm"
                      />
                    </div>
                    <button
                      onClick={handleSendSmsNotification}
                      disabled={smsLoading}
                      className="bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white font-medium py-2 px-4 rounded-lg transition text-sm"
                    >
                      {smsLoading ? 'Sending...' : 'Send SMS'}
                    </button>
                    {smsSuccess && (
                      <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800">
                        <p className="font-medium">SMS sent successfully!</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* In-Person Collection */}
                {visit.status === VisitStatus.APPROVED && (
                  <div>
                    <h3 className="text-md font-semibold text-gray-900 mb-3">In-Person Collection</h3>
                    <div className="space-y-4">
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          id="patient-collected"
                          checked={patientCollected}
                          onChange={(e) => setPatientCollected(e.target.checked)}
                          className="w-4 h-4 text-green-600 rounded focus:ring-green-500 border-gray-300"
                        />
                        <label htmlFor="patient-collected" className="text-sm font-medium text-gray-700">
                          Patient collected results
                        </label>
                      </div>

                      {patientCollected && (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Collected by (name)
                          </label>
                          <input
                            type="text"
                            value={collectedByName}
                            onChange={(e) => setCollectedByName(e.target.value)}
                            placeholder="Enter name of person who collected results"
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent text-sm"
                          />
                        </div>
                      )}

                      <button
                        onClick={handleInPersonCollection}
                        disabled={actionLoading === 'in-person-delivery' || !patientCollected || !collectedByName.trim()}
                        className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-purple-400 text-white font-medium py-2 px-4 rounded-lg transition text-sm"
                      >
                        {actionLoading === 'in-person-delivery' ? 'Marking as Delivered...' : 'Mark as Delivered'}
                      </button>
                    </div>
                  </div>
                )}

                {/* Mark as Delivered via SMS/Online (for manual entry) */}
                {visit.status === VisitStatus.APPROVED && (
                  <div>
                    <h3 className="text-md font-semibold text-gray-900 mb-3">Remote Delivery</h3>
                    <button
                      onClick={() => handleTransitionStatus('delivered')}
                      disabled={actionLoading === 'delivered'}
                      className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium py-2 px-4 rounded-lg transition text-sm"
                    >
                      {actionLoading === 'delivered' ? 'Marking as Delivered...' : 'Mark as Delivered (Via SMS/Online)'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
