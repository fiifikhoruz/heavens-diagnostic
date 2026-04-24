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

    // ── 3. Check username is not taken in profiles ───────────────────────────
    const { data: existingProfile } = await (adminClient as any)
      .from('profiles').select('id').ilike('username', normalizedUsername).maybeSingle();
    if (existingProfile) {
      return NextResponse.json(
        { error: `Username "@${normalizedUsername}" is already taken.` },
        { status: 409 }
      );
    }

    // ── 4. Resolve auth user — create or recover orphaned one ────────────────
    // The internal email may already exist if a previous invite attempt partially
    // succeeded (auth user created, but profile or token was never stored).
    // In that case we recover the existing user rather than failing.
    let userId: string;

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
      const alreadyExists =
        createError.message.toLowerCase().includes('already been registered') ||
        createError.message.toLowerCase().includes('already registered') ||
        createError.message.toLowerCase().includes('already exists');

      if (!alreadyExists) {
        return NextResponse.json({ error: createError.message }, { status: 422 });
      }

      // Recover: find the orphaned auth user by scanning (small user base — safe)
      const { data: { users: allUsers } } = await adminClient.auth.admin.listUsers({
        perPage: 1000,
      });
      const orphan = allUsers.find(u => u.email === internalEmail);

      if (!orphan) {
        return NextResponse.json(
          { error: 'Account conflict — please try a different username.' },
          { status: 409 }
        );
      }

      // Update their metadata to match the current request
      await adminClient.auth.admin.updateUserById(orphan.id, {
        user_metadata: {
          username: normalizedUsername,
          full_name: fullName?.trim() || null,
          role,
        },
      });

      userId = orphan.id;
    } else {
      userId = newAuthUser.user.id;
    }

    // ── 5. Upsert profile ────────────────────────────────────────────────────
    await (adminClient as any)
      .from('profiles')
      .upsert(
        {
          id: userId,
          username: normalizedUsername,
          full_name: fullName?.trim() || null,
          role,
          is_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id' }
      );

    // ── 6. Invalidate any previous unused tokens for this user ───────────────
    await (adminClient as any)
      .from('invites')
      .update({ used: true })
      .eq('user_id', userId)
      .eq('used', false);

    // ── 7. Generate a fresh one-time token ───────────────────────────────────
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    const { error: inviteError } = await (adminClient as any)
      .from('invites')
      .insert({
        user_id: userId,
        token,
        expires_at: expiresAt.toISOString(),
        used: false,
      });

    if (inviteError) {
      return NextResponse.json(
        { error: `Failed to create invite token: ${inviteError.message}` },
        { status: 500 }
      );
    }

    // ── 8. Build the invite link ─────────────────────────────────────────────
    const inviteLink = `${SITE_URL}/set-password?token=${token}`;

    // ── 9. Log the action ────────────────────────────────────────────────────
    await (supabaseServer as any).from('admin_activity_log').insert({
      admin_id: caller.id,
      action: 'INVITE_USER',
      target_type: 'profiles',
      target_id: userId,
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
