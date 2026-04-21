import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase admin client with service role key
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface LoginRequest {
  username: string;
  password: string;
}

/**
 * Extract client IP from request headers
 * Handles both forwarded and direct IP scenarios
 */
function getClientIp(request: NextRequest): string {
  const forwardedFor = request.headers.get('x-forwarded-for');
  const realIp = request.headers.get('x-real-ip');
  return forwardedFor?.split(',')[0].trim() || realIp || 'unknown';
}

/**
 * Extract user agent from request headers
 */
function getUserAgent(request: NextRequest): string {
  return request.headers.get('user-agent') || 'unknown';
}

/**
 * Resolve a username or email string to the internal email used by Supabase Auth.
 *
 * Strategy:
 *   1. Look for a profile where username = input (exact match, case-insensitive)
 *   2. If found → return that profile's email (may be username@staff.heavens or a real email)
 *   3. If not found → treat the input itself as the email (backwards compat for
 *      existing accounts created before username login was introduced)
 */
async function resolveToEmail(usernameOrEmail: string): Promise<string> {
  const input = usernameOrEmail.trim().toLowerCase();

  const { data: profile } = await (supabaseAdmin as any)
    .from('profiles')
    .select('email')
    .ilike('username', input)
    .maybeSingle();

  if (profile?.email) {
    return profile.email as string;
  }

  // Fall back: treat input as a direct email (handles legacy admin accounts)
  return input;
}

/**
 * POST /api/auth/login
 *
 * Authenticates a user with username (or legacy email) and password, enforcing:
 * - Rate limiting (per IP address)
 * - Account locking (after 5 failed attempts in 15 minutes)
 * - Login attempt tracking
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json() as LoginRequest;
    const { username, password } = body;

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

    // ── 2. Rate limit check (10 attempts per IP per 15 minutes) ────────────
    // Non-fatal: if the RPC errors, log and continue — don't block login.
    const rateLimitResult = await (supabaseAdmin as any).rpc(
      'check_rate_limit',
      {
        p_ip: clientIp,
        p_window_minutes: 15,
        p_max_attempts: 10,
      }
    );

    if (!rateLimitResult.error && rateLimitResult.data === false) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429 }
      );
    }

    // ── 3. Account lock check ───────────────────────────────────────────────
    // Non-fatal: if the RPC errors (e.g. DB function not yet patched),
    // log the error and proceed rather than showing "service unavailable".
    const lockCheckResult = await (supabaseAdmin as any).rpc(
      'check_account_lock',
      { user_email: resolvedEmail }
    );

    if (lockCheckResult.error) {
      console.error('[login] check_account_lock error (non-fatal):', lockCheckResult.error.message);
      // Proceed with authentication — the lock check is a safeguard, not a gate
    } else {
      const lockData = lockCheckResult.data?.[0];
      if (lockData?.is_locked) {
        await (supabaseAdmin as any).rpc('record_login_attempt', {
          p_email: resolvedEmail,
          p_ip: clientIp,
          p_user_agent: userAgent,
          p_success: false,
        }).catch(() => {}); // non-fatal

        return NextResponse.json(
          {
            error: 'Account is temporarily locked due to too many failed attempts. Please try again in 30 minutes.',
          },
          { status: 423 }
        );
      }
    }

    // ── 4. Authenticate ─────────────────────────────────────────────────────
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const { data, error } = await supabase.auth.signInWithPassword({
      email: resolvedEmail,
      password,
    });

    if (error) {
      // Non-fatal — if record_login_attempt errors, we still return 401
      await (supabaseAdmin as any).rpc('record_login_attempt', {
        p_email: resolvedEmail,
        p_ip: clientIp,
        p_user_agent: userAgent,
        p_success: false,
      }).catch((e: unknown) => console.error('[login] record_login_attempt error:', e));

      return NextResponse.json(
        { error: 'Invalid username or password.' },
        { status: 401 }
      );
    }

    // ── 5. Record success ───────────────────────────────────────────────────
    await (supabaseAdmin as any).rpc('record_login_attempt', {
      p_email: resolvedEmail,
      p_ip: clientIp,
      p_user_agent: userAgent,
      p_success: true,
    }).catch((e: unknown) => console.error('[login] record_login_attempt error:', e));

    return NextResponse.json({
      session: data.session,
      user: {
        id: data.user?.id,
        email: data.user?.email,
        user_metadata: data.user?.user_metadata,
      },
    });
  } catch (error) {
    console.error('Login route error:', error);

    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { error: 'Invalid request body' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    );
  }
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json(
    { error: 'Method not allowed' },
    { status: 405 }
  );
}
