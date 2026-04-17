'use client';

import { useState, useEffect, ChangeEvent } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Patient, UserRole } from '@/lib/types';

const ITEMS_PER_PAGE = 10;

export default function PatientsPage() {
  const supabase = createClient();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [filteredPatients, setFilteredPatients] = useState<Patient[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [userRole, setUserRole] = useState<UserRole | null>(null);

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

        const { data, error } = await supabase
          .from('patients')
          .select('*')
          .eq('is_active', true)
          .order('created_at', { ascending: false });

        if (!error && data) {
          // Map snake_case database fields to camelCase types
          const mapped: Patient[] = (data as any[]).map(p => ({
            id: p.id,
            patientId: p.patient_id,
            createdAt: p.created_at,
            updatedAt: p.updated_at,
            firstName: p.first_name,
            lastName: p.last_name,
            dateOfBirth: p.date_of_birth,
            gender: p.gender,
            phone: p.phone,
            email: p.email,
            address: p.address,
            city: p.city,
            state: p.state,
            postalCode: p.postal_code,
            insuranceProvider: p.insurance_provider,
            insuranceId: p.insurance_id,
            emergencyContactName: p.emergency_contact_name,
            emergencyContactPhone: p.emergency_contact_phone,
            notes: p.notes,
            isActive: p.is_active,
          }));
          setPatients(mapped);
          setFilteredPatients(mapped);
        }
      } catch (err) {
        console.error('Error fetching patients:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [supabase]);

  useEffect(() => {
    const filtered = patients.filter(patient =>
      patient.firstName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      patient.lastName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      patient.patientId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (patient.phone && patient.phone.includes(searchTerm))
    );
    setFilteredPatients(filtered);
    setCurrentPage(1);
  }, [searchTerm, patients]);

  const totalPages = Math.ceil(filteredPatients.length / ITEMS_PER_PAGE);
  const startIdx = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginatedPatients = filteredPatients.slice(startIdx, startIdx + ITEMS_PER_PAGE);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Patients</h1>
          <p className="text-gray-600 mt-1">Manage patient records and information</p>
        </div>
        {(userRole === UserRole.FRONT_DESK || userRole === UserRole.ADMIN) && (
          <Link
            href="/dashboard/patients/new"
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white font-medium py-2 px-4 rounded-lg transition"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Register New Patient
          </Link>
        )}
      </div>

      {/* Search */}
      <div className="bg-white rounded-lg shadow p-4">
        <input
          type="text"
          placeholder="Search by name, patient ID, or phone..."
          value={searchTerm}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setSearchTerm(e.target.value)}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none transition"
        />
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
        ) : paginatedPatients.length === 0 ? (
          <div className="flex items-center justify-center p-12 text-gray-600">
            <div className="text-center">
              <svg className="w-12 h-12 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.856-1.487M15 10a3 3 0 11-6 0 3 3 0 016 0zM6 20a9 9 0 0118 0v2h2v-2a11 11 0 10-20 0v2h2v-2z" />
              </svg>
              <p>No patients found</p>
            </div>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Patient ID</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Name</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Date of Birth</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Phone</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Registered</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {paginatedPatients.map((patient) => (
                    <tr key={patient.id} className="hover:bg-gray-50 transition">
                      <td className="px-6 py-4 text-sm text-gray-600 font-mono">{patient.patientId}</td>
                      <td className="px-6 py-4 text-sm font-medium text-gray-900">
                        {patient.firstName} {patient.lastName}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {formatDate(patient.dateOfBirth)}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">{patient.phone || '-'}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {formatDate(patient.createdAt)}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <Link
                          href={`/dashboard/patients/${patient.id}`}
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
                  Showing {startIdx + 1} to {Math.min(startIdx + ITEMS_PER_PAGE, filteredPatients.length)} of {filteredPatients.length}
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
