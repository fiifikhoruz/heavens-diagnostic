'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { logAdminAction } from '@/lib/admin-logger';

interface LoginAttempt {
  id: string;
  email: string;
  ip_address: string;
  user_agent: string;
  success: boolean;
  attempted_at: string;
}

interface LockedAccount {
  id: string;
  email: string;
  full_name: string;
  locked_at: string;
  lock_reason: string;
  failed_login_count: number;
}

interface AdminActivityLog {
  id: string;
  admin_id: string;
  action: string;
  target_type: string;
  target_id: string;
  details: Record<string, any>;
  created_at: string;
  admin_name?: string;
}

interface SensitiveAccessLog {
  id: string;
  admin_id: string;
  admin_name?: string;
  action: string;
  target: string;
  details: string;
  accessed_at: string;
}

interface SecurityStats {
  failedAttempts24h: number;
  lockedAccountsCount: number;
  adminActionsToday: number;
  activeSessions: number;
}

export default function SecurityMonitoringPage() {
  const supabase = createClient();
  const [stats, setStats] = useState<SecurityStats>({
    failedAttempts24h: 0,
    lockedAccountsCount: 0,
    adminActionsToday: 0,
    activeSessions: 0,
  });

  const [loginAttempts, setLoginAttempts] = useState<LoginAttempt[]>([]);
  const [lockedAccounts, setLockedAccounts] = useState<LockedAccount[]>([]);
  const [adminActivityLog, setAdminActivityLog] = useState<AdminActivityLog[]>([]);
  const [sensitiveAccessLog, setSensitiveAccessLog] = useState<SensitiveAccessLog[]>([]);

  const [filterAttempts, setFilterAttempts] = useState<'all' | 'success' | 'failed'>('all');
  const [filterEmail, setFilterEmail] = useState('');
  const [filterAdminAction, setFilterAdminAction] = useState('');
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  // Check admin role
  useEffect(() => {
    const checkAdmin = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        window.location.href = '/login';
        return;
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      if (profile?.role !== 'admin') {
        window.location.href = '/dashboard';
        return;
      }

      setIsAdmin(true);
    };

    checkAdmin();
  }, [supabase]);

  // Fetch security stats
  useEffect(() => {
    if (!isAdmin) return;

    const fetchStats = async () => {
      const now = new Date();
      const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      try {
        // Failed attempts in last 24 hours
        const { data: failedAttempts } = await (supabase as any)
          .from('login_attempts')
          .select('id', { count: 'exact' })
          .eq('success', false)
          .gte('attempted_at', last24h.toISOString());

        // Locked accounts
        const { data: locked } = await (supabase as any)
          .from('profiles')
          .select('id', { count: 'exact' })
          .eq('is_locked', true);

        // Admin actions today
        const { data: adminActions } = await (supabase as any)
          .from('admin_activity_log')
          .select('id', { count: 'exact' })
          .gte('created_at', todayStart.toISOString());

        // Estimate active sessions (sessions from last hour)
        const lastHour = new Date(now.getTime() - 60 * 60 * 1000);
        const { data: activeSessions } = await (supabase as any)
          .from('login_attempts')
          .select('email', { count: 'exact' })
          .eq('success', true)
          .gte('attempted_at', lastHour.toISOString());

        setStats({
          failedAttempts24h: failedAttempts?.length || 0,
          lockedAccountsCount: locked?.length || 0,
          adminActionsToday: adminActions?.length || 0,
          activeSessions: activeSessions?.length || 0,
        });
      } catch (error) {
        console.error('Error fetching stats:', error);
      }
    };

    fetchStats();
  }, [isAdmin, supabase]);

  // Fetch login attempts
  useEffect(() => {
    if (!isAdmin) return;

    const fetchLoginAttempts = async () => {
      try {
        let query = (supabase as any)
          .from('login_attempts')
          .select('*')
          .order('attempted_at', { ascending: false })
          .limit(100);

        if (filterAttempts !== 'all') {
          query = query.eq('success', filterAttempts === 'success');
        }

        if (filterEmail) {
          query = query.ilike('email', `%${filterEmail}%`);
        }

        const { data } = await query;
        setLoginAttempts((data || []) as LoginAttempt[]);
      } catch (error) {
        console.error('Error fetching login attempts:', error);
      }
    };

    fetchLoginAttempts();
  }, [isAdmin, supabase, filterAttempts, filterEmail]);

  // Fetch locked accounts
  useEffect(() => {
    if (!isAdmin) return;

    const fetchLockedAccounts = async () => {
      try {
        const { data } = await (supabase as any)
          .from('profiles')
          .select('id, email, full_name, locked_at, lock_reason, failed_login_count')
          .eq('is_locked', true);

        setLockedAccounts((data || []) as LockedAccount[]);
      } catch (error) {
        console.error('Error fetching locked accounts:', error);
      }
    };

    fetchLockedAccounts();
  }, [isAdmin, supabase]);

  // Fetch admin activity log
  useEffect(() => {
    if (!isAdmin) return;

    const fetchAdminActivityLog = async () => {
      try {
        let query = (supabase as any)
          .from('admin_activity_log')
          .select('*')
          .order('created_at', { ascending: false });

        if (filterAdminAction) {
          query = query.eq('action', filterAdminAction);
        }

        const { data } = await query;

        // Enrich with admin names
        if (data) {
          const enrichedData = await Promise.all(
            data.map(async (log: any) => {
              const { data: admin } = await supabase
                .from('profiles')
                .select('full_name')
                .eq('id', log.admin_id)
                .single();

              return {
                ...log,
                admin_name: admin?.full_name || 'Unknown',
              } as AdminActivityLog;
            })
          );

          setAdminActivityLog(enrichedData);
        }
      } catch (error) {
        console.error('Error fetching admin activity log:', error);
      }
    };

    fetchAdminActivityLog();
  }, [isAdmin, supabase, filterAdminAction]);

  // Fetch sensitive data access log
  useEffect(() => {
    if (!isAdmin) return;

    const fetchSensitiveAccessLog = async () => {
      try {
        const { data } = await (supabase as any)
          .from('admin_activity_log')
          .select('*')
          .or("details->>'test_type'.ilike.%HIV%, details->>'test_type'.ilike.%Hepatitis B%")
          .order('created_at', { ascending: false });

        if (data) {
          const enrichedData = await Promise.all(
            data.map(async (log: any) => {
              const { data: admin } = await supabase
                .from('profiles')
                .select('full_name')
                .eq('id', log.admin_id)
                .single();

              return {
                id: log.id,
                admin_id: log.admin_id,
                admin_name: admin?.full_name || 'Unknown',
                action: log.action,
                target: log.target_type || 'Unknown',
                details: JSON.stringify(log.details),
                accessed_at: log.created_at,
              } as SensitiveAccessLog;
            })
          );

          setSensitiveAccessLog(enrichedData);
        }
      } catch (error) {
        console.error('Error fetching sensitive access log:', error);
      }
    };

    fetchSensitiveAccessLog();
  }, [isAdmin, supabase]);

  // Unlock account handler
  const handleUnlockAccount = async (accountId: string, email: string) => {
    try {
      await (supabase as any)
        .from('profiles')
        .update({
          is_locked: false,
          failed_login_count: 0,
          locked_at: null,
          lock_reason: null,
        })
        .eq('id', accountId);

      await logAdminAction('UNLOCK_ACCOUNT', 'profiles', accountId, { email });

      // Refresh locked accounts
      const { data } = await (supabase as any)
        .from('profiles')
        .select('id, email, full_name, locked_at, lock_reason, failed_login_count')
        .eq('is_locked', true);

      setLockedAccounts((data || []) as LockedAccount[]);
    } catch (error) {
      console.error('Error unlocking account:', error);
    }
  };

  if (!isAdmin) {
    return <div className="p-4 text-center">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-4xl font-bold text-gray-900 mb-8">Security Monitoring</h1>

        {/* Security Overview Stats */}
        <div className="grid grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow p-6 border-l-4 border-green-600">
            <p className="text-gray-500 text-sm font-semibold">Failed Login Attempts (24h)</p>
            <p className="text-3xl font-bold text-green-600 mt-2">{stats.failedAttempts24h}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-6 border-l-4 border-green-600">
            <p className="text-gray-500 text-sm font-semibold">Locked Accounts</p>
            <p className="text-3xl font-bold text-green-600 mt-2">{stats.lockedAccountsCount}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-6 border-l-4 border-green-600">
            <p className="text-gray-500 text-sm font-semibold">Admin Actions (Today)</p>
            <p className="text-3xl font-bold text-green-600 mt-2">{stats.adminActionsToday}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-6 border-l-4 border-green-600">
            <p className="text-gray-500 text-sm font-semibold">Active Sessions (Est.)</p>
            <p className="text-3xl font-bold text-green-600 mt-2">{stats.activeSessions}</p>
          </div>
        </div>

        {/* Login Attempts Table */}
        <div className="bg-white rounded-lg shadow mb-8">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Login Attempts</h2>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Filter by Status
                </label>
                <select
                  value={filterAttempts}
                  onChange={(e) => setFilterAttempts(e.target.value as any)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-green-600 focus:border-green-600"
                >
                  <option value="all">All</option>
                  <option value="success">Successful</option>
                  <option value="failed">Failed</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Search Email
                </label>
                <input
                  type="text"
                  value={filterEmail}
                  onChange={(e) => setFilterEmail(e.target.value)}
                  placeholder="Search email..."
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-green-600 focus:border-green-600"
                />
              </div>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                    Email
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                    IP Address
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                    User Agent
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                    Timestamp
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {loginAttempts.map((attempt) => (
                  <tr key={attempt.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm text-gray-900">{attempt.email}</td>
                    <td className="px-6 py-4 text-sm text-gray-600 font-mono">{attempt.ip_address}</td>
                    <td className="px-6 py-4 text-sm">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-semibold ${
                          attempt.success
                            ? 'bg-green-100 text-green-800'
                            : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {attempt.success ? 'Success' : 'Failed'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600 truncate max-w-xs">
                      {attempt.user_agent}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {new Date(attempt.attempted_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Locked Accounts Section */}
        <div className="bg-white rounded-lg shadow mb-8">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-2xl font-bold text-gray-900">Locked Accounts ({lockedAccounts.length})</h2>
          </div>
          {lockedAccounts.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                      Email
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                      Full Name
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                      Failed Attempts
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                      Locked At
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                      Reason
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {lockedAccounts.map((account) => (
                    <tr key={account.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-sm text-gray-900">{account.email}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">{account.full_name}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">{account.failed_login_count}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {new Date(account.locked_at).toLocaleString()}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">{account.lock_reason}</td>
                      <td className="px-6 py-4 text-sm">
                        <button
                          onClick={() => handleUnlockAccount(account.id, account.email)}
                          className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                        >
                          Unlock
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-6 text-center text-gray-500">No locked accounts</div>
          )}
        </div>

        {/* Admin Activity Log */}
        <div className="bg-white rounded-lg shadow mb-8">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Admin Activity Log</h2>
            <div className="flex gap-4">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Filter by Action
                </label>
                <input
                  type="text"
                  value={filterAdminAction}
                  onChange={(e) => setFilterAdminAction(e.target.value)}
                  placeholder="Search action..."
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-green-600 focus:border-green-600"
                />
              </div>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                    Admin Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                    Action
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                    Target
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                    Details
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                    Timestamp
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {adminActivityLog.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm text-gray-900">{log.admin_name}</td>
                    <td className="px-6 py-4 text-sm text-gray-600 font-semibold">{log.action}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{log.target_type}</td>
                    <td className="px-6 py-4 text-sm text-gray-600 truncate max-w-xs">
                      {JSON.stringify(log.details)}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {new Date(log.created_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Sensitive Data Access Log */}
        <div className="bg-white rounded-lg shadow">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-2xl font-bold text-gray-900">Sensitive Data Access (HIV, Hepatitis B)</h2>
          </div>
          {sensitiveAccessLog.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                      Admin Name
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                      Action
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                      Target
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                      Details
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                      Accessed At
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {sensitiveAccessLog.map((log) => (
                    <tr key={log.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-sm text-gray-900">{log.admin_name}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">{log.action}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">{log.target}</td>
                      <td className="px-6 py-4 text-sm text-gray-600 truncate max-w-xs">
                        {log.details}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {new Date(log.accessed_at).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-6 text-center text-gray-500">No sensitive data access logged</div>
          )}
        </div>
      </div>
    </div>
  );
}
