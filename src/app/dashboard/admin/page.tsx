'use client';

import { useState, useEffect, FormEvent, ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Profile, UserRole, AuditLog } from '@/lib/types';

const ITEMS_PER_PAGE = 10;

export default function AdminPage() {
  const router = useRouter();
  const supabase = createClient();

  const [users, setUsers] = useState<Profile[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'users' | 'audit'>('users');
  const [currentPage, setCurrentPage] = useState(1);
  const [error, setError] = useState('');

  // Create User form
  const [newUsername, setNewUsername] = useState('');
  const [newFullName, setNewFullName] = useState('');
  const [newRole, setNewRole] = useState<UserRole>(UserRole.FRONT_DESK);
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [createSuccess, setCreateSuccess] = useState('');

  useEffect(() => {
    const checkAccess = async () => {
      try {
        const { data: authData } = await supabase.auth.getSession();
        if (!authData.session) {
          router.push('/login');
          return;
        }

        const { data: profileData } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', authData.session.user.id)
          .single();

        if (!profileData || profileData.role !== UserRole.ADMIN) {
          router.push('/dashboard');
          return;
        }

        await fetchData();
      } catch (err) {
        console.error('Error checking access:', err);
        router.push('/login');
      }
    };

    checkAccess();
  }, [supabase, router]);

  const fetchData = async () => {
    try {
      const { data: usersData } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (usersData) {
        // Map snake_case to camelCase
        const mapped: Profile[] = (usersData as any[]).map(u => ({
          id: u.id,
          createdAt: u.created_at,
          updatedAt: u.updated_at,
          email: u.email,
          username: u.username ?? null,
          fullName: u.full_name,
          role: u.role,
          phone: u.phone,
          avatarUrl: u.avatar_url,
          isActive: u.is_active,
        }));
        setUsers(mapped);
      }

      const { data: logsData } = await supabase
        .from('audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (logsData) {
        // Map snake_case to camelCase
        const mapped: AuditLog[] = (logsData as any[]).map(l => ({
          id: l.id,
          createdAt: l.created_at,
          userId: l.user_id,
          action: l.action,
          resourceType: l.resource_type,
          resourceId: l.resource_id,
          changes: l.changes,
          ipAddress: l.ip_address,
          userAgent: l.user_agent,
        }));
        setAuditLogs(mapped);
      }
    } catch (err) {
      console.error('Error fetching data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateUser = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setCreateSuccess('');

    if (newPassword !== newPasswordConfirm) {
      setError('Passwords do not match.');
      return;
    }
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    setIsCreating(true);

    try {
      const res = await fetch('/api/admin/create-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: newUsername.trim().toLowerCase(),
          fullName: newFullName.trim() || undefined,
          role: newRole,
          password: newPassword,
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        setError(json.error || 'Failed to create account');
        return;
      }

      setCreateSuccess(`Account created for @${newUsername.trim().toLowerCase()}. Share the username and password with the staff member.`);
      setNewUsername('');
      setNewFullName('');
      setNewRole(UserRole.FRONT_DESK);
      setNewPassword('');
      setNewPasswordConfirm('');

      await fetchData();
    } catch (err) {
      setError('Network error — could not create account');
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeactivateUser = async (userId: string) => {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ is_active: false })
        .eq('id', userId);

      if (error) {
        setError(error.message);
      } else {
        setUsers(users.map(u => u.id === userId ? { ...u, isActive: false } : u));
      }
    } catch (err) {
      setError('Failed to deactivate user');
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getRoleColor = (role: UserRole | string): string => {
    switch (role) {
      case UserRole.ADMIN:
        return 'bg-purple-100 text-purple-800';
      case UserRole.DOCTOR:
        return 'bg-blue-100 text-blue-800';
      case UserRole.TECHNICIAN:
        return 'bg-green-100 text-green-800';
      case UserRole.FRONT_DESK:
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getRoleLabel = (role: UserRole | string): string => {
    return String(role)
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  const usersPaginatedData = users.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const usersPages = Math.ceil(users.length / ITEMS_PER_PAGE);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Admin Panel</h1>
        <p className="text-gray-600 mt-1">Manage users and view system activity</p>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Success Message */}
      {createSuccess && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-green-800 text-sm flex items-start gap-3">
          <svg className="w-5 h-5 text-green-600 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>{createSuccess}</span>
        </div>
      )}

      {/* Tabs */}
      <div className="bg-white rounded-lg shadow border-b border-gray-200">
        <div className="flex">
          <button
            onClick={() => {
              setActiveTab('users');
              setCurrentPage(1);
            }}
            className={`flex-1 px-6 py-4 font-medium transition ${
              activeTab === 'users'
                ? 'border-b-2 border-green-600 text-green-600'
                : 'text-gray-700 hover:text-gray-900'
            }`}
          >
            User Management
          </button>
          <button
            onClick={() => {
              setActiveTab('audit');
              setCurrentPage(1);
            }}
            className={`flex-1 px-6 py-4 font-medium transition ${
              activeTab === 'audit'
                ? 'border-b-2 border-green-600 text-green-600'
                : 'text-gray-700 hover:text-gray-900'
            }`}
          >
            Audit Log
          </button>
        </div>
      </div>

      {/* User Management Tab */}
      {activeTab === 'users' && (
        <div className="space-y-6">
          {/* Create User Form */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Create Staff Account</h2>
            <p className="text-sm text-gray-500 mb-4">Create a login for a new staff member. Share the username and password with them directly.</p>
            <form onSubmit={handleCreateUser} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Username */}
                <div>
                  <label htmlFor="newUsername" className="block text-sm font-medium text-gray-700 mb-1">
                    Username <span className="text-gray-400 font-normal text-xs">(used to log in)</span>
                  </label>
                  <div className="relative">
                    <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400 text-sm">@</span>
                    <input
                      id="newUsername"
                      type="text"
                      value={newUsername}
                      onChange={(e: ChangeEvent<HTMLInputElement>) => setNewUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
                      required
                      minLength={3}
                      maxLength={30}
                      pattern="[a-z0-9_-]+"
                      disabled={isCreating}
                      className="w-full pl-7 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none transition disabled:bg-gray-100 font-mono"
                      placeholder="dr.mensah"
                    />
                  </div>
                  <p className="text-xs text-gray-400 mt-1">Letters, numbers, underscores, hyphens only</p>
                </div>

                {/* Full Name */}
                <div>
                  <label htmlFor="newFullName" className="block text-sm font-medium text-gray-700 mb-1">
                    Full Name <span className="text-gray-400 font-normal">(optional)</span>
                  </label>
                  <input
                    id="newFullName"
                    type="text"
                    value={newFullName}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setNewFullName(e.target.value)}
                    disabled={isCreating}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none transition disabled:bg-gray-100"
                    placeholder="Dr. Kofi Mensah"
                  />
                </div>

                {/* Role */}
                <div>
                  <label htmlFor="newRole" className="block text-sm font-medium text-gray-700 mb-1">
                    Role
                  </label>
                  <select
                    id="newRole"
                    value={newRole}
                    onChange={(e: ChangeEvent<HTMLSelectElement>) => setNewRole(e.target.value as UserRole)}
                    disabled={isCreating}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none transition disabled:bg-gray-100"
                  >
                    <option value={UserRole.FRONT_DESK}>Front Desk</option>
                    <option value={UserRole.TECHNICIAN}>Technician</option>
                    <option value={UserRole.DOCTOR}>Doctor</option>
                    <option value={UserRole.ADMIN}>Admin</option>
                  </select>
                </div>

                {/* Password */}
                <div>
                  <label htmlFor="newPassword" className="block text-sm font-medium text-gray-700 mb-1">
                    Initial Password
                  </label>
                  <div className="relative">
                    <input
                      id="newPassword"
                      type={showNewPassword ? 'text' : 'password'}
                      value={newPassword}
                      onChange={(e: ChangeEvent<HTMLInputElement>) => setNewPassword(e.target.value)}
                      required
                      minLength={8}
                      disabled={isCreating}
                      className="w-full pr-10 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none transition disabled:bg-gray-100"
                      placeholder="Min. 8 characters"
                    />
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => setShowNewPassword(v => !v)}
                      className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600"
                    >
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        {showNewPassword
                          ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 4.411m0 0L21 21" />
                          : <><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></>
                        }
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Confirm Password */}
                <div>
                  <label htmlFor="newPasswordConfirm" className="block text-sm font-medium text-gray-700 mb-1">
                    Confirm Password
                  </label>
                  <input
                    id="newPasswordConfirm"
                    type={showNewPassword ? 'text' : 'password'}
                    value={newPasswordConfirm}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setNewPasswordConfirm(e.target.value)}
                    required
                    minLength={8}
                    disabled={isCreating}
                    className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none transition disabled:bg-gray-100 ${
                      newPasswordConfirm && newPassword !== newPasswordConfirm
                        ? 'border-red-400 bg-red-50'
                        : 'border-gray-300'
                    }`}
                    placeholder="Re-enter password"
                  />
                  {newPasswordConfirm && newPassword !== newPasswordConfirm && (
                    <p className="text-xs text-red-500 mt-1">Passwords do not match</p>
                  )}
                </div>

                {/* Submit */}
                <div className="flex items-end">
                  <button
                    type="submit"
                    disabled={isCreating || (!!newPasswordConfirm && newPassword !== newPasswordConfirm)}
                    className="w-full px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white rounded-lg font-medium transition flex items-center justify-center gap-2"
                  >
                    {isCreating ? (
                      <>
                        <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        Creating...
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                        </svg>
                        Create Account
                      </>
                    )}
                  </button>
                </div>
              </div>
            </form>
          </div>

          {/* Users Table */}
          <div className="bg-white rounded-lg shadow overflow-hidden">
            {isLoading ? (
              <div className="flex items-center justify-center p-12">
                <svg className="animate-spin h-8 w-8 text-green-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Name</th>
                        <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Username</th>
                        <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Role</th>
                        <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Status</th>
                        <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Joined</th>
                        <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {usersPaginatedData.map((user) => (
                        <tr key={user.id} className="hover:bg-gray-50 transition">
                          <td className="px-6 py-4 text-sm font-medium text-gray-900">{user.fullName || 'N/A'}</td>
                          <td className="px-6 py-4 text-sm text-gray-600 font-mono">
                            {user.username ? `@${user.username}` : <span className="text-gray-400 italic">no username</span>}
                          </td>
                          <td className="px-6 py-4 text-sm">
                            <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${getRoleColor(user.role)}`}>
                              {getRoleLabel(user.role)}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-sm">
                            <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${user.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                              {user.isActive ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-600">{formatDate(user.createdAt)}</td>
                          <td className="px-6 py-4 text-sm">
                            {user.isActive && (
                              <button
                                onClick={() => handleDeactivateUser(user.id)}
                                className="text-red-600 hover:text-red-700 font-medium"
                              >
                                Deactivate
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {usersPages > 1 && (
                  <div className="bg-gray-50 border-t border-gray-200 px-6 py-4 flex items-center justify-between">
                    <div className="text-sm text-gray-600">
                      Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1} to {Math.min(currentPage * ITEMS_PER_PAGE, users.length)} of {users.length}
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
                        {Array.from({ length: usersPages }, (_, i) => i + 1).map((pageNum) => (
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
                        ))}
                      </div>
                      <button
                        onClick={() => setCurrentPage(Math.min(usersPages, currentPage + 1))}
                        disabled={currentPage === usersPages}
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
      )}

      {/* Audit Log Tab */}
      {activeTab === 'audit' && (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          {isLoading ? (
            <div className="flex items-center justify-center p-12">
              <svg className="animate-spin h-8 w-8 text-green-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            </div>
          ) : auditLogs.length === 0 ? (
            <div className="p-12 text-center text-gray-600">
              <p>No audit logs available</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">User</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Action</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Resource</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Timestamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {auditLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-gray-50 transition">
                      <td className="px-6 py-4 text-sm text-gray-900">{log.userId}</td>
                      <td className="px-6 py-4 text-sm">
                        <span className="inline-block px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 capitalize">
                          {log.action}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {log.resourceType} - {log.resourceId.substring(0, 8)}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">{formatDate(log.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-gray-600 text-sm font-medium">Total Users</p>
          <p className="text-3xl font-bold text-gray-900 mt-2">{users.length}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-gray-600 text-sm font-medium">Active Users</p>
          <p className="text-3xl font-bold text-gray-900 mt-2">{users.filter(u => u.isActive).length}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-gray-600 text-sm font-medium">Audit Events</p>
          <p className="text-3xl font-bold text-gray-900 mt-2">{auditLogs.length}</p>
        </div>
      </div>
    </div>
  );
}
