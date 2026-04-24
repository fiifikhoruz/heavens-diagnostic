import { createServerClient } from '@supabase/ssr';
import { createAdminClient } from '@/lib/supabase/admin';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { Database } from '@/lib/supabase/database.types';
import crypto from 'crypto';

const USERNAME_RE = /^[a-z0-9_-]{3,30}$/;
const VALID_ROLES = ['front_desk', 'technician', 'doctor', 'admin'];

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ||
  'https://heavens-diagnostic-qjvm-three.vercel.app';

export async function POST(request: NextRequest) {
  try {
    const { username, fullName, role } = await request.json();

    // ── 1. Validate ─────────────────────────────────────────────────────────
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

    // Internal email — users never see this. Same pattern as create-user.
    const internalEmail = `${normalizedUsername}@staff.heavens`;

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

    // ── 4. Create the auth user WITHOUT a password ──────────────────────────
    // Uses internal email — staff never see or need it.
    // email_confirm: true skips any Supabase confirmation email.
    const { data: newAuthUser, error: createError } = await adminClient.auth.admin.createUser({
      email: internalEmail,
      email_confirm: true,
      user_metadata: {
        username: normalizedUsername,
        full_name: fullName?.trim() || null,
        role,
      },
    });

    if (createError) {
      return NextResponse.json({ error: createError.message }, { status: 422 });
    }

    const newUserId = newAuthUser.user.id;

    // ── 5. Pre-create profile with username + role ──────────────────────────
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
    }

    // ── 6. Generate a cryptographically secure one-time token ───────────────
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    const { error: inviteError } = await (adminClient as any)
      .from('invites')
      .insert({
        user_id: newUserId,
        token,
        expires_at: expiresAt.toISOString(),
        used: false,
      });

    if (inviteError) {
      // Roll back the auth user if we can't store the invite
      await adminClient.auth.admin.deleteUser(newUserId);
      return NextResponse.json(
        { error: `Failed to create invite token: ${inviteError.message}` },
        { status: 500 }
      );
    }

    // ── 7. Build the invite link ─────────────────────────────────────────────
    const inviteLink = `${SITE_URL}/set-password?token=${token}`;

    // ── 8. Log the action ───────────────────────────────────────────────────
    await (supabaseServer as any).from('admin_activity_log').insert({
      admin_id: caller.id,
      action: 'INVITE_USER',
      target_type: 'profiles',
      target_id: newUserId,
      details: { username: normalizedUsername, role },
    }).catch(() => {});

    return NextResponse.json({
      success: true,
      message: `Account created for @${normalizedUsername}. Share the invite link below — it expires in 24 hours.`,
      inviteLink,
    });
  } catch (err) {
    console.error('[invite]', err);
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}
