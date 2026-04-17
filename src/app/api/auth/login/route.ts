import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase admin client with service role key
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface LoginRequest {
  email: string;
  password: string;
}

interface LoginAttemptCheckResponse {
  is_locked: boolean;
  failed_count: number;
  lock_until: string;
}

interface RateLimitCheckResponse {
  success: boolean;
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
 * POST /api/auth/login
 *
 * Authenticates a user with email and password while enforcing:
 * - Rate limiting (per IP address)
 * - Account locking (after 5 failed attempts in 15 minutes)
 * - Login attempt tracking
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // Parse and validate request body
    const body = await request.json() as LoginRequest;
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    // Extract request metadata
    const clientIp = getClientIp(request);
    const userAgent = getUserAgent(request);

    // Step 1: Check rate limit (10 attempts per IP per 15 minutes)
    const rateLimitResult = await (supabaseAdmin as any).rpc(
      'check_rate_limit',
      {
        p_ip: clientIp,
        p_window_minutes: 15,
        p_max_attempts: 10,
      }
    );

    if (rateLimitResult.error || !rateLimitResult.data) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429 }
      );
    }

    // Step 2: Check account lock status (5+ failed attempts in 15 minutes auto-locks)
    const lockCheckResult = await (supabaseAdmin as any).rpc(
      'check_account_lock',
      {
        user_email: email,
      }
    );

    if (lockCheckResult.error) {
      console.error('Account lock check error:', lockCheckResult.error);
      return NextResponse.json(
        { error: 'Service temporarily unavailable' },
        { status: 503 }
      );
    }

    const lockData = lockCheckResult.data?.[0];
    if (lockData?.is_locked) {
      // Record the failed attempt
      await supabaseAdmin.rpc('record_login_attempt', {
        p_email: email,
        p_ip: clientIp,
        p_user_agent: userAgent,
        p_success: false,
      });

      return NextResponse.json(
        {
          error: 'Account is temporarily locked due to too many failed attempts. Please try again in 30 minutes.',
        },
        { status: 423 }
      );
    }

    // Step 3: Attempt authentication via Supabase Auth
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      // Record failed login attempt
      const attemptResult = await supabaseAdmin.rpc('record_login_attempt', {
        p_email: email,
        p_ip: clientIp,
        p_user_agent: userAgent,
        p_success: false,
      });

      if (attemptResult.error) {
        console.error('Failed to record login attempt:', attemptResult.error);
      }

      return NextResponse.json(
        { error: 'Invalid email or password.' },
        { status: 401 }
      );
    }

    // Step 4: Record successful login
    const successResult = await supabaseAdmin.rpc('record_login_attempt', {
      p_email: email,
      p_ip: clientIp,
      p_user_agent: userAgent,
      p_success: true,
    });

    if (successResult.error) {
      console.error('Failed to record successful login:', successResult.error);
      // Continue despite logging failure - auth was successful
    }

    // Step 5: Return session and user data
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

/**
 * Disable other HTTP methods
 */
export async function GET(): Promise<NextResponse> {
  return NextResponse.json(
    { error: 'Method not allowed' },
    { status: 405 }
  );
}
