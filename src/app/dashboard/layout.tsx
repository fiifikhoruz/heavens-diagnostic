'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Profile, UserRole } from '@/lib/types';
import Link from 'next/link';
import { OfflineBanner } from '@/components/OfflineBanner';
import { startSyncScheduler } from '@/lib/sync-engine';

interface NavigationItem {
  name: string;
  href: string;
  icon: React.ReactNode;
  roles: UserRole[];
}

const navigationItems: NavigationItem[] = [
  {
    name: 'Home',
    href: '/dashboard',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-3m0 0l7-4 7 4M5 9v10a1 1 0 001 1h12a1 1 0 001-1V9m-9 4v4m0 0H9m4 0h4" />
      </svg>
    ),
    roles: [UserRole.FRONT_DESK, UserRole.TECHNICIAN, UserRole.DOCTOR, UserRole.ADMIN],
  },
  {
    name: 'Front Desk',
    href: '/dashboard/front-desk',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
      </svg>
    ),
    roles: [UserRole.FRONT_DESK, UserRole.ADMIN],
  },
  {
    name: 'Doctor Hub',
    href: '/dashboard/doctor',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
      </svg>
    ),
    roles: [UserRole.DOCTOR, UserRole.ADMIN],
  },
  {
    name: 'Patients',
    href: '/dashboard/patients',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.856-1.487M15 10a3 3 0 11-6 0 3 3 0 016 0zM6 20a9 9 0 0118 0v2h2v-2a11 11 0 10-20 0v2h2v-2z" />
      </svg>
    ),
    roles: [UserRole.FRONT_DESK, UserRole.DOCTOR, UserRole.ADMIN],
  },
  {
    name: 'Visits',
    href: '/dashboard/visits',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
      </svg>
    ),
    roles: [UserRole.FRONT_DESK, UserRole.TECHNICIAN, UserRole.DOCTOR, UserRole.ADMIN],
  },
  {
    name: 'Tech Queue',
    href: '/dashboard/technician-queue',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
      </svg>
    ),
    roles: [UserRole.TECHNICIAN, UserRole.ADMIN],
  },
  {
    name: 'Doctor Review',
    href: '/dashboard/doctor-review',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
      </svg>
    ),
    roles: [UserRole.DOCTOR, UserRole.ADMIN],
  },
  {
    name: 'Admin',
    href: '/dashboard/admin',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
      </svg>
    ),
    roles: [UserRole.ADMIN],
  },
  {
    name: 'Security',
    href: '/dashboard/admin/security',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
      </svg>
    ),
    roles: [UserRole.ADMIN],
  },
  {
    name: 'Turnaround',
    href: '/dashboard/admin/turnaround',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    roles: [UserRole.ADMIN],
  },
  {
    name: 'Insights',
    href: '/dashboard/admin/insights',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
    roles: [UserRole.ADMIN],
  },
  {
    name: 'Sync Issues',
    href: '/dashboard/admin/sync-issues',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
      </svg>
    ),
    roles: [UserRole.ADMIN],
  },
];

function getRoleColor(role: UserRole): string {
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
}

function getRoleLabel(role: UserRole): string {
  return role.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 1024;
      setIsMobile(mobile);
      if (!mobile) setIsSidebarOpen(true); // always open on desktop
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);
  const lastActivityRef = useRef<number>(Date.now());
  const inactivityTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const SESSION_TIMEOUT = 20 * 60 * 1000; // 20 minutes

  const handleLogout = useCallback(async () => {
    await supabase.auth.signOut();
    router.push('/login');
  }, [supabase, router]);

  const resetInactivityTimer = useCallback(() => {
    lastActivityRef.current = Date.now();

    if (inactivityTimeoutRef.current) {
      clearTimeout(inactivityTimeoutRef.current);
    }

    inactivityTimeoutRef.current = setTimeout(() => {
      handleLogout();
    }, SESSION_TIMEOUT);
  }, [SESSION_TIMEOUT, handleLogout]);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const { data: authData } = await supabase.auth.getSession();

        if (!authData.session) {
          router.push('/login');
          return;
        }

        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', authData.session.user.id)
          .single();

        if (error || !data) {
          router.push('/login');
          return;
        }

        // Map snake_case database fields to camelCase types
        const mappedProfile: Profile = {
          id: data.id,
          createdAt: data.created_at,
          updatedAt: data.updated_at,
          email: data.email,
          username: (data as any).username ?? null,
          fullName: data.full_name,
          role: data.role as UserRole,
          phone: data.phone,
          avatarUrl: data.avatar_url,
          isActive: data.is_active,
        };

        setProfile(mappedProfile);
        resetInactivityTimer();
      } catch (err) {
        console.error('Error fetching profile:', err);
        router.push('/login');
      } finally {
        setIsLoading(false);
      }
    };

    fetchProfile();
  }, [supabase, router, resetInactivityTimer]);

  useEffect(() => {
    const handleActivity = () => {
      resetInactivityTimer();
    };

    window.addEventListener('mousemove', handleActivity);
    window.addEventListener('keypress', handleActivity);
    window.addEventListener('click', handleActivity);

    return () => {
      window.removeEventListener('mousemove', handleActivity);
      window.removeEventListener('keypress', handleActivity);
      window.removeEventListener('click', handleActivity);
      if (inactivityTimeoutRef.current) {
        clearTimeout(inactivityTimeoutRef.current);
      }
    };
  }, [resetInactivityTimer]);

  // Start sync scheduler when dashboard mounts
  useEffect(() => {
    const stop = startSyncScheduler();
    return stop;
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <svg className="animate-spin h-12 w-12 text-green-600 mx-auto mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <p className="text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (!profile) {
    return null;
  }

  const visibleNavItems = navigationItems.filter(item =>
    item.roles.includes(profile.role as UserRole)
  );

  const closeSidebar = () => { if (isMobile) setIsSidebarOpen(false); };

  return (
    <>
      <OfflineBanner />
      <div className="flex h-screen bg-gray-50 overflow-hidden">

        {/* Mobile backdrop */}
        {isMobile && isSidebarOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/50"
            onClick={() => setIsSidebarOpen(false)}
          />
        )}

        {/* Sidebar */}
        <aside
          className={`
            ${isMobile
              ? `fixed inset-y-0 left-0 z-50 w-72 transform transition-transform duration-300
                 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`
              : `relative z-auto transition-all duration-300 ${isSidebarOpen ? 'w-64' : 'w-20'}`
            }
            bg-white border-r border-gray-200 flex flex-col shadow-lg lg:shadow-none
          `}
        >
          {/* Logo */}
          <div className="p-5 border-b border-gray-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 shrink-0 bg-green-600 rounded-full flex items-center justify-center text-white font-bold text-sm">
                HD
              </div>
              {(isSidebarOpen) && (
                <div className="min-w-0">
                  <p className="font-bold text-gray-900 truncate">Heavens</p>
                  <p className="text-xs text-gray-500 truncate">Diagnostic Services</p>
                </div>
              )}
              {/* Close button on mobile */}
              {isMobile && (
                <button
                  onClick={() => setIsSidebarOpen(false)}
                  className="ml-auto p-1 text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
            {visibleNavItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={closeSidebar}
                className="flex items-center gap-3 px-3 py-3 text-gray-700 rounded-lg hover:bg-green-50 hover:text-green-700 transition active:bg-green-100"
                title={!isSidebarOpen && !isMobile ? item.name : ''}
              >
                <span className="shrink-0">{item.icon}</span>
                {(isSidebarOpen || isMobile) && (
                  <span className="font-medium text-sm">{item.name}</span>
                )}
              </Link>
            ))}
          </nav>

          {/* User Profile & Logout */}
          <div className="border-t border-gray-200 p-3 space-y-2">
            {(isSidebarOpen || isMobile) && (
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-sm font-semibold text-gray-900 truncate">{profile.fullName || 'User'}</p>
                <span className={`inline-block text-xs px-2 py-0.5 rounded mt-1 font-medium ${getRoleColor(profile.role as UserRole)}`}>
                  {getRoleLabel(profile.role as UserRole)}
                </span>
              </div>
            )}
            <button
              onClick={handleLogout}
              className="w-full flex items-center justify-center gap-2 px-3 py-2.5 text-gray-700 hover:bg-red-50 hover:text-red-700 rounded-lg transition"
              title={!isSidebarOpen && !isMobile ? 'Logout' : ''}
            >
              <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              {(isSidebarOpen || isMobile) && <span className="font-medium text-sm">Logout</span>}
            </button>
          </div>

          {/* Collapse toggle — desktop only */}
          {!isMobile && (
            <div className="p-3 border-t border-gray-200">
              <button
                onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                className="w-full flex items-center justify-center p-2 text-gray-400 hover:text-green-600 transition rounded-lg hover:bg-green-50"
              >
                <svg
                  className={`w-4 h-4 transition-transform duration-300 ${isSidebarOpen ? '' : 'rotate-180'}`}
                  fill="none" stroke="currentColor" viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
            </div>
          )}
        </aside>

        {/* Main Content */}
        <main className="flex-1 flex flex-col overflow-hidden min-w-0">
          {/* Top Bar */}
          <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3">
            {/* Hamburger — mobile only */}
            {isMobile && (
              <button
                onClick={() => setIsSidebarOpen(true)}
                className="p-2 -ml-1 text-gray-600 hover:text-green-700 hover:bg-green-50 rounded-lg transition"
                aria-label="Open menu"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
            )}
            <div className="flex items-center gap-2 min-w-0 flex-1">
              {isMobile && (
                <div className="w-7 h-7 shrink-0 bg-green-600 rounded-full flex items-center justify-center text-white font-bold text-xs">
                  HD
                </div>
              )}
              <h2 className="text-lg font-semibold text-gray-900 truncate">Dashboard</h2>
            </div>
            <div className="text-sm text-gray-600 shrink-0 hidden sm:block">
              Welcome, <span className="font-medium">{profile.fullName?.split(' ')[0] || 'User'}</span>
            </div>
          </header>

          {/* Content */}
          <div className="flex-1 overflow-auto">
            {children}
          </div>
        </main>
      </div>
    </>
  );
}
