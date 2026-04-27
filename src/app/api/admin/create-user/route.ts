import { createServerClient } from '@supabase/ssr';
import { createAdminClient } from '@/lib/supabase/admin';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { Database } from '@/lib/supabase/database.types';

const VALID_ROLES = ['front_desk', 'technician', 'doctor', 'admin'];

// Username rules: 3–30 chars, lowercase letters/numbers/underscores/hyphens
const USERNAME_RE = /^[a-z0-9_-]{3,30}$/;

export async function POST(request: NextRequest) {
  try {
    const { username, fullName, role, password } = await request.json();

    // ── 1. Validate inputs ──────────────────────────────────────────────────
    if (!username || !USERNAME_RE.test(username.toLowerCase())) {
      return NextResponse.json(
        { error: 'Username must be 3–30 characters and contain only letters, numbers, underscores, or hyphens.' },
        { status: 400 }
      );
    }
    if (!role || !VALID_ROLES.includes(role)) {
      return NextResponse.json({ error: 'Invalid role.' }, { status: 400 });
    }
    if (!password || password.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters.' },
        { status: 400 }
      );
    }

    const normalizedUsername = username.trim().toLowerCase();

    // ── 2. Verify caller is an authenticated admin ──────────────────────────
    const cookieStore = await cookies();
    const supabaseServer = createServerClient<Database>(
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

    const { data: { user: callerUser } } = await supabaseServer.auth.getUser();
    if (!callerUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: callerProfile } = await supabaseServer
      .from('profiles')
      .select('role')
      .eq('id', callerUser.id)
      .single();

    if (!callerProfile || callerProfile.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden — admin only' }, { status: 403 });
    }

    // ── 3. Check username is not already taken ──────────────────────────────
    const adminClient = createAdminClient();

    const { data: existing } = await adminClient
      .from('profiles')
      .select('id')
      .ilike('username', normalizedUsername)
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        { error: `Username "${normalizedUsername}" is already taken.` },
        { status: 409 }
      );
    }

    // ── 4. Generate the internal email ──────────────────────────────────────
    // Users never see this — it's only used internally by Supabase Auth.
    const internalEmail = `${normalizedUsername}@staff.heavens`;

    // ── 5. Create the auth user with the given password ─────────────────────
    const { data: newAuthUser, error: createError } = await adminClient.auth.admin.createUser({
      email: internalEmail,
      password,
      email_confirm: true, // skip email confirmation — admin is setting the account up
      user_metadata: {
        username: normalizedUsername,
        full_name: fullName?.trim() || null,
        role,
      },
    });

    if (createError) {
      return NextResponse.json(
        { error: createError.message },
        { status: 422 }
      );
    }

    const newUserId = newAuthUser.user.id;

    // ── 6. Create/upsert the profile row ────────────────────────────────────
    const { error: profileError } = await adminClient
      .from('profiles')
      .upsert(
        // Note: profiles has no email column — do not include it
        {
          id: newUserId,
          username: normalizedUsername,
          full_name: fullName?.trim() || null,
          role,
          is_active: true,
          updated_at: new Date().toISOString(),
        } as any,
        { onConflict: 'id' }
      );

    if (profileError) {
      // If profile creation fails, roll back the auth user
      await adminClient.auth.admin.deleteUser(newUserId);
      return NextResponse.json(
        { error: `Account created but profile setup failed: ${profileError.message}. Account rolled back.` },
        { status: 500 }
      );
    }

    // ── 7. Log the admin action via SECURITY DEFINER server function ──────────
    // Using logAdminActionServer because this is a server-side route; the
    // service role client has no auth.uid() so we pass adminId explicitly.
    try {
      const { logAdminActionServer } = await import('@/lib/admin-logger');
      await logAdminActionServer(callerUser.id, 'CREATE_USER', 'profiles', newUserId, {
        username: normalizedUsername,
        role,
        full_name: fullName?.trim() || null,
      });
    } catch { /* non-fatal */ }

    return NextResponse.json({
      success: true,
      message: `Account created for @${normalizedUsername}`,
      userId: newUserId,
    });
  } catch (err) {
    console.error('[create-user] Unexpected error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
