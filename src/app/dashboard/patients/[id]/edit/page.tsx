'use client';

import { useState, useEffect, FormEvent, ChangeEvent } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

interface FormState {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender: 'male' | 'female' | 'other';
  phone: string;
  email: string;
  address: string;
  city: string;
  state: string;
  postalCode: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  insuranceProvider: string;
  insuranceId: string;
  notes: string;
}

const EMPTY: FormState = {
  firstName: '', lastName: '', dateOfBirth: '', gender: 'male',
  phone: '', email: '', address: '', city: '', state: '', postalCode: '',
  emergencyContactName: '', emergencyContactPhone: '',
  insuranceProvider: '', insuranceId: '', notes: '',
};

export default function EditPatientPage() {
  const router = useRouter();
  const params = useParams();
  const patientId = params.id as string;
  const supabase = createClient();

  const [form, setForm] = useState<FormState>(EMPTY);
  const [patientDisplayId, setPatientDisplayId] = useState('');
  const [patientName, setPatientName] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    const init = async () => {
      try {
        // ── 1. Auth + role check ──────────────────────────────────────────────
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { router.replace('/login'); return; }

        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single();

        if (!profile || !['front_desk', 'admin'].includes(profile.role)) {
          router.replace(`/dashboard/patients/${patientId}`);
          return;
        }

        setAuthorized(true);

        // ── 2. Load patient ───────────────────────────────────────────────────
        const { data: p, error: fetchErr } = await supabase
          .from('patients')
          .select('*')
          .eq('id', patientId)
          .single();

        if (fetchErr || !p) {
          setError('Patient not found.');
          setLoading(false);
          return;
        }

        setPatientDisplayId((p as any).patient_id ?? '');
        setPatientName(`${(p as any).first_name} ${(p as any).last_name}`);

        setForm({
          firstName: (p as any).first_name ?? '',
          lastName: (p as any).last_name ?? '',
          dateOfBirth: (p as any).date_of_birth ?? '',
          gender: (['male', 'female', 'other'].includes((p as any).gender) ? (p as any).gender : 'male') as 'male' | 'female' | 'other',
          phone: (p as any).phone ?? '',
          email: (p as any).email ?? '',
          address: (p as any).address ?? '',
          city: (p as any).city ?? '',
          state: (p as any).state ?? '',
          postalCode: (p as any).postal_code ?? '',
          emergencyContactName: (p as any).emergency_contact_name ?? '',
          emergencyContactPhone: (p as any).emergency_contact_phone ?? '',
          insuranceProvider: (p as any).insurance_provider ?? '',
          insuranceId: (p as any).insurance_id ?? '',
          notes: (p as any).notes ?? '',
        });
      } catch (err: any) {
        setError(err?.message ?? 'Failed to load patient.');
      } finally {
        setLoading(false);
      }
    };

    init();
  }, [patientId]);

  const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');

    if (!form.firstName.trim()) { setError('First name is required.'); return; }
    if (!form.lastName.trim()) { setError('Last name is required.'); return; }
    if (!form.dateOfBirth) { setError('Date of birth is required.'); return; }
    if (!form.phone.trim()) { setError('Phone number is required.'); return; }

    setSaving(true);

    const { error: updateErr } = await supabase
      .from('patients')
      .update({
        first_name: form.firstName.trim(),
        last_name: form.lastName.trim(),
        date_of_birth: form.dateOfBirth,
        gender: form.gender,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        address: form.address.trim() || null,
        city: form.city.trim() || null,
        state: form.state.trim() || null,
        postal_code: form.postalCode.trim() || null,
        emergency_contact_name: form.emergencyContactName.trim() || null,
        emergency_contact_phone: form.emergencyContactPhone.trim() || null,
        insurance_provider: form.insuranceProvider.trim() || null,
        insurance_id: form.insuranceId.trim() || null,
        notes: form.notes.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', patientId);

    setSaving(false);

    if (updateErr) {
      setError(`Save failed: ${updateErr.message}`);
      return;
    }

    router.replace(`/dashboard/patients/${patientId}`);
  };

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-green-600 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">Loading…</p>
        </div>
      </div>
    );
  }

  if (!authorized || error === 'Patient not found.') {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-2xl mx-auto bg-white rounded-lg shadow p-6 text-center">
          <p className="text-red-600 font-medium">{error || 'Access denied.'}</p>
          <Link href={`/dashboard/patients/${patientId}`} className="mt-4 inline-block text-green-600 hover:underline text-sm">
            ← Back to patient
          </Link>
        </div>
      </div>
    );
  }

  const field = (
    label: string,
    name: keyof FormState,
    type = 'text',
    required = false,
    placeholder = ''
  ) => (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}{required && <span className="text-red-500 ml-1">*</span>}
      </label>
      <input
        type={type}
        name={name}
        value={form[name]}
        onChange={handleChange}
        required={required}
        disabled={saving}
        placeholder={placeholder}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none transition disabled:bg-gray-100 text-sm"
      />
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6">
      <div className="max-w-3xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Edit Patient</h1>
            <p className="text-sm text-gray-500 mt-0.5">{patientName} · {patientDisplayId}</p>
          </div>
          <Link
            href={`/dashboard/patients/${patientId}`}
            className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Cancel
          </Link>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">

          {/* Personal Information */}
          <section className="bg-white rounded-lg shadow p-6 space-y-4">
            <h2 className="text-base font-semibold text-gray-900 border-b pb-2">Personal Information</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {field('First Name', 'firstName', 'text', true)}
              {field('Last Name', 'lastName', 'text', true)}
              {field('Date of Birth', 'dateOfBirth', 'date', true)}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Gender <span className="text-red-500">*</span></label>
                <select
                  name="gender"
                  value={form.gender}
                  onChange={handleChange}
                  disabled={saving}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none transition disabled:bg-gray-100 text-sm"
                >
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>
          </section>

          {/* Contact Details */}
          <section className="bg-white rounded-lg shadow p-6 space-y-4">
            <h2 className="text-base font-semibold text-gray-900 border-b pb-2">Contact Details</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {field('Phone', 'phone', 'tel', true, '+233...')}
              {field('Email', 'email', 'email', false)}
              {field('Address', 'address', 'text', false)}
              {field('City', 'city', 'text', false)}
              {field('Region / State', 'state', 'text', false)}
              {field('Postal Code', 'postalCode', 'text', false)}
            </div>
          </section>

          {/* Emergency Contact */}
          <section className="bg-white rounded-lg shadow p-6 space-y-4">
            <h2 className="text-base font-semibold text-gray-900 border-b pb-2">Emergency Contact</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {field('Name', 'emergencyContactName', 'text', false)}
              {field('Phone', 'emergencyContactPhone', 'tel', false, '+233...')}
            </div>
          </section>

          {/* Insurance */}
          <section className="bg-white rounded-lg shadow p-6 space-y-4">
            <h2 className="text-base font-semibold text-gray-900 border-b pb-2">Insurance</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {field('Provider', 'insuranceProvider', 'text', false, 'e.g. NHIS, Enterprise Life')}
              {field('Insurance ID', 'insuranceId', 'text', false, 'e.g. GHA-123456789-0')}
            </div>
          </section>

          {/* Notes */}
          <section className="bg-white rounded-lg shadow p-6 space-y-4">
            <h2 className="text-base font-semibold text-gray-900 border-b pb-2">Notes</h2>
            <textarea
              name="notes"
              value={form.notes}
              onChange={handleChange}
              disabled={saving}
              rows={3}
              placeholder="Any additional notes about this patient…"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none transition disabled:bg-gray-100 text-sm resize-none"
            />
          </section>

          {/* Error */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pb-6">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-medium py-2.5 rounded-lg transition flex items-center justify-center gap-2"
            >
              {saving ? (
                <>
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Saving…
                </>
              ) : 'Save Changes'}
            </button>
            <Link
              href={`/dashboard/patients/${patientId}`}
              className="px-6 py-2.5 border border-gray-300 text-gray-700 hover:bg-gray-50 font-medium rounded-lg transition text-center"
            >
              Cancel
            </Link>
          </div>

        </form>
      </div>
    </div>
  );
}
