import { type NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { Database } from './database.types';

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          cookiesToSet.forEach(({ name, value, options }) => {
            supabaseResponse.cookies.set(name, value, options as any);
          });
        },
      },
    }
  );

  // Refresh the auth session to keep the user logged in
  await supabase.auth.getSession();

  // Check if user is authenticated for protected routes
  const {
    data: { session },
  } = await supabase.auth.getSession();

  // List of protected route patterns
  const protectedPatterns = [/^\/dashboard/];

  // Check if current path is protected
  const isProtectedRoute = protectedPatterns.some((pattern) =>
    pattern.test(request.nextUrl.pathname)
  );

  // Redirect to login if accessing protected route without session
  if (isProtectedRoute && !session) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    return NextResponse.redirect(loginUrl);
  }

  // Redirect to dashboard if already logged in and trying to access login page
  if (request.nextUrl.pathname === '/login' && session) {
    const dashboardUrl = request.nextUrl.clone();
    dashboardUrl.pathname = '/dashboard';
    return NextResponse.redirect(dashboardUrl);
  }

  return supabaseResponse;
}
