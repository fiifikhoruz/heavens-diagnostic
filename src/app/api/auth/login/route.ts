import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Plain anon client — used for username lookup RPC and signInWithPassword.
// No cookies, no server client, no service role needed for the core login flow.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

// Admin client — used only for non-fatal security logging.
// Falls back gracefully if SUPABASE_SERVICE_ROLE_KEY is not set.
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'not-configured',
);

function getClientIp(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0].trim()
    ?? req.headers.get('x-real-ip')
    ?? 'unknown';
}

/**
 * Resolve a username (or raw email) to the Supabase auth email.
 * - If the input already contains "@" it is an email → use directly.
 * - Otherwise try the lookup_email_by_username() RPC (runs SECURITY DEFINER,
 *   so the anon key is sufficient).
 * - If the RPC fails or returns nothing, fall back to treating input as email.
 * Never throws.
 */
async function resolveToEmail(input: string): Promise<string> {
  const normalized = input.trim().toLowerCase();

  // Looks like an email already — skip the RPC
  if (normalized.includes('@')) return normalized;

  try {
    const { data, error } = await (supabase as any).rpc(
      'lookup_email_by_username',
      { p_username: normalized },
    );
    if (!error && data) return data as string;
    if (error) console.warn('[login] lookup_email_by_username:', error.message);
  } catch (e) {
    console.warn('[login] resolveToEmail error (non-fatal):', e);
  }

  // Last resort — treat the input as a direct email
  return normalized;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const { username, password } = body as { username?: string; password?: string };

    if (!username?.trim() || !password) {
      return NextResponse.json(
        { error: 'Username and password are required.' },
        { status: 400 },
      );
    }

    // ── 1. Resolve to email ─────────────────────────────────────────────────
    const email = await resolveToEmail(username);

    // ── 2. Authenticate ─────────────────────────────────────────────────────
    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    const ip = getClientIp(request);
    const ua = request.headers.get('user-agent') ?? 'unknown';

    if (authError) {
      // Record failed attempt — non-fatal
      await (supabaseAdmin as any)
        .rpc('record_login_attempt', { p_email: email, p_ip: ip, p_user_agent: ua, p_success: false })
        .catch(() => {});

      return NextResponse.json(
        { error: 'Invalid username or password.' },
        { status: 401 },
      );
    }

    // ── 3. Record success — non-fatal ───────────────────────────────────────
    await (supabaseAdmin as any)
      .rpc('record_login_attempt', { p_email: email, p_ip: ip, p_user_agent: ua, p_success: true })
      .catch(() => {});

    return NextResponse.json({ session: data.session });
  } catch (err) {
    console.error('[login] unhandled error:', err);
    return NextResponse.json(
      { error: 'An unexpected error occurred. Please try again.' },
      { status: 500 },
    );
  }
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}
