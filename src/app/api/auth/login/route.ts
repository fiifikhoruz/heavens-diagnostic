import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { Database } from '@/lib/supabase/database.types';

// Admin client — used only for non-fatal security helpers (rate limit, lock check).
// If SUPABASE_SERVICE_ROLE_KEY is not set these calls fail silently — login still works.
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'missing',
);

function getClientIp(request: NextRequest): string {
  const forwardedFor = request.headers.get('x-forwarded-for');
  const realIp = request.headers.get('x-real-ip');
  return forwardedFor?.split(',')[0].trim() || realIp || 'unknown';
}

function getUserAgent(request: NextRequest): string {
  return request.headers.get('user-agent') || 'unknown';
}

/**
 * Resolve username → Supabase auth email via SECURITY DEFINER RPC.
 * Uses the anon-key server client — no service role required.
 * Falls back to treating the input as a raw email (for legacy accounts).
 */
async function resolveToEmail(usernameOrEmail: string): Promise<string> {
  const input = usernameOrEmail.trim().toLowerCase();

  try {
    const cookieStore = await cookies();
    const supabase = createServerClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll(); },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options as any)
              );
            } catch { /* ignored */ }
          },
        },
      }
    );

    const { data, error } = await (supabase as any).rpc('lookup_email_by_username', {
      p_username: input,
    });

    if (!error && data) {
      return data as string;
    }

    if (error) {
      console.warn('[login] lookup_email_by_username error (non-fatal):', error.message);
    }
  } catch (err) {
    console.warn('[login] resolveToEmail threw (non-fatal):', err);
  }

  // Fall back: treat input as a raw email (handles existing accounts
  // created before username login, e.g. odoifiifi@gmail.com)
  return input;
}

/**
 * POST /api/auth/login
 *
 * Authenticates via username (or legacy email) + password.
 * Rate limiting and account locking are non-fatal — if those DB functions
 * error they are logged and skipped, never blocking login.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const { username, password } = body as { username: string; password: string };

    if (!username || !password) {
      return NextResponse.json(
        { error: 'Username and password are required' },
        { status: 400 }
      );
    }

    const clientIp = getClientIp(request);
    const userAgent = getUserAgent(request);

    // ── 1. Resolve username → internal email ────────────────────────────────
    const resolvedEmail = await resolveToEmail(username);

    // ── 2. Rate limit check (non-fatal) ─────────────────────────────────────
    try {
      const { data: rateOk } = await (supabaseAdmin as any).rpc('check_rate_limit', {
        p_ip: clientIp,
        p_window_minutes: 15,
        p_max_attempts: 10,
      });
      if (rateOk === false) {
        return NextResponse.json(
          { error: 'Too many requests. Please try again later.' },
          { status: 429 }
        );
      }
    } catch (e) {
      console.warn('[login] check_rate_limit error (non-fatal):', e);
    }

    // ── 3. Account lock check (non-fatal) ───────────────────────────────────
    try {
      const { data: lockRows, error: lockErr } = await (supabaseAdmin as any).rpc(
        'check_account_lock',
        { user_email: resolvedEmail }
      );
      if (!lockErr && lockRows?.[0]?.is_locked) {
        await (supabaseAdmin as any).rpc('record_login_attempt', {
          p_email: resolvedEmail,
          p_ip: clientIp,
          p_user_agent: userAgent,
          p_success: false,
        }).catch(() => {});

        return NextResponse.json(
          { error: 'Account is temporarily locked due to too many failed attempts. Please try again in 30 minutes.' },
          { status: 423 }
        );
      }
      if (lockErr) {
        console.warn('[login] check_account_lock error (non-fatal):', lockErr.message);
      }
    } catch (e) {
      console.warn('[login] check_account_lock threw (non-fatal):', e);
    }

    // ── 4. Authenticate with Supabase Auth ──────────────────────────────────
    const supabaseAuth = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const { data, error } = await supabaseAuth.auth.signInWithPassword({
      email: resolvedEmail,
      password,
    });

    if (error) {
      await (supabaseAdmin as any).rpc('record_login_attempt', {
        p_email: resolvedEmail,
        p_ip: clientIp,
        p_user_agent: userAgent,
        p_success: false,
      }).catch(() => {});

      return NextResponse.json(
        { error: 'Invalid username or password.' },
        { status: 401 }
      );
    }

    // ── 5. Record success (non-fatal) ───────────────────────────────────────
    await (supabaseAdmin as any).rpc('record_login_attempt', {
      p_email: resolvedEmail,
      p_ip: clientIp,
      p_user_agent: userAgent,
      p_success: true,
    }).catch(() => {});

    return NextResponse.json({
      session: data.session,
      user: {
        id: data.user?.id,
        email: data.user?.email,
        user_metadata: data.user?.user_metadata,
      },
    });
  } catch (err) {
    console.error('[login] Unhandled error:', err);
    return NextResponse.json(
      { error: 'An unexpected error occurred. Please try again.' },
      { status: 500 }
    );
  }
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}
