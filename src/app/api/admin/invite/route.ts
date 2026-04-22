import { createServerClient } from '@supabase/ssr';
import { createAdminClient } from '@/lib/supabase/admin';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { Database } from '@/lib/supabase/database.types';

const USERNAME_RE = /^[a-z0-9_-]{3,30}$/;
const VALID_ROLES = ['front_desk', 'technician', 'doctor', 'admin'];

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ||
  'https://heavens-diagnostic-qjvm-three.vercel.app';

export async function POST(request: NextRequest) {
  try {
    const { email, username, fullName, role } = await request.json();

    // ── 1. Validate ─────────────────────────────────────────────────────────
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return NextResponse.json({ error: 'A valid email address is required.' }, { status: 400 });
    }
    if (!username || !USERNAME_RE.test(username.toLowerCase())) {
      return NextResponse.json(
        { error: 'Username must be 3–30 characters: letters, numbers, underscores or hyphens.' },
        { status: 400 }
      );
    }
    if (!role || !VALID_ROLES.includes(role)) {
      return NextResponse.json({ error: 'Invalid role.' }, { status: 400 });
    }

    const normalizedUsername = username.trim().toLowerCase();

    // ── 2. Verify caller is an admin ────────────────────────────────────────
    const cookieStore = await cookies();
    const supabaseServer = createServerClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll(); },
          setAll(list) {
            try { list.forEach(({ name, value, options }) => cookieStore.set(name, value, options as any)); }
            catch { /* ignored */ }
          },
        },
      }
    );

    const { data: { user: caller } } = await supabaseServer.auth.getUser();
    if (!caller) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });

    const { data: callerProfile } = await supabaseServer
      .from('profiles').select('role').eq('id', caller.id).single();
    if (callerProfile?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden — admin only.' }, { status: 403 });
    }

    const adminClient = createAdminClient();

    // ── 3. Check username is not taken ──────────────────────────────────────
    const { data: existing } = await (adminClient as any)
      .from('profiles').select('id').ilike('username', normalizedUsername).maybeSingle();
    if (existing) {
      return NextResponse.json(
        { error: `Username "@${normalizedUsername}" is already taken.` },
        { status: 409 }
      );
    }

    // ── 4. Send Supabase invite email ───────────────────────────────────────
    // The link takes the user to /api/auth/callback which sets the session,
    // then redirects to /dashboard/set-password.
    const { data: inviteData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(
      email.trim().toLowerCase(),
      {
        data: { username: normalizedUsername, full_name: fullName?.trim() || null, role },
        redirectTo: `${SITE_URL}/api/auth/callback?next=/dashboard/set-password`,
      }
    );

    if (inviteError) {
      return NextResponse.json({ error: inviteError.message }, { status: 422 });
    }

    const newUserId = inviteData.user.id;

    // ── 5. Pre-create profile with username + role ──────────────────────────
    // Note: profiles does NOT have an email column — don't include it.
    const { error: profileError } = await (adminClient as any)
      .from('profiles')
      .upsert(
        {
          id: newUserId,
          username: normalizedUsername,
          full_name: fullName?.trim() || null,
          role,
          is_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id' }
      );

    if (profileError) {
      console.warn('[invite] Profile upsert warning:', profileError.message);
      // Non-fatal — user still gets the invite email and can log in.
      // Profile will be created/fixed when they land on set-password.
    }

    // ── 6. Log the action ───────────────────────────────────────────────────
    await (supabaseServer as any).from('admin_activity_log').insert({
      admin_id: caller.id,
      action: 'INVITE_USER',
      target_type: 'profiles',
      target_id: newUserId,
      details: { email: email.trim().toLowerCase(), username: normalizedUsername, role },
    }).catch(() => {});

    return NextResponse.json({
      success: true,
      message: `Invite sent to ${email.trim()}. They'll receive an email to set their password.`,
    });
  } catch (err) {
    console.error('[invite]', err);
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}
