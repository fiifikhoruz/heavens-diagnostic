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
  // ── 0. Verify env vars are present before doing anything ──────────────────
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return NextResponse.json({ error: 'Config error: NEXT_PUBLIC_SUPABASE_URL missing' }, { status: 500 });
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Config error: SUPABASE_SERVICE_ROLE_KEY missing on Vercel' }, { status: 500 });
  }
  if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return NextResponse.json({ error: 'Config error: NEXT_PUBLIC_SUPABASE_ANON_KEY missing' }, { status: 500 });
  }

  try {
    const body = await request.json();
    const { username, fullName, role } = body;

    // ── 1. Validate ─────────────────────────────────────────────────────────
    if (!username || !USERNAME_RE.test(String(username).toLowerCase())) {
      return NextResponse.json(
        { error: 'Username must be 3–30 characters: letters, numbers, underscores or hyphens.' },
        { status: 400 }
      );
    }
    if (!role || !VALID_ROLES.includes(role)) {
      return NextResponse.json({ error: 'Invalid role.' }, { status: 400 });
    }

    const normalizedUsername = String(username).trim().toLowerCase();
    const internalEmail = `${normalizedUsername}@staff.heavens`;

    // ── 2. Verify caller is an admin ────────────────────────────────────────
    const cookieStore = await cookies();
    const supabaseServer = createServerClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
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

    const { data: authData, error: authError } = await supabaseServer.auth.getUser();
    if (authError || !authData?.user) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }
    const caller = authData.user;

    const { data: callerProfile, error: profileErr } = await supabaseServer
      .from('profiles').select('role').eq('id', caller.id).single();
    if (profileErr || callerProfile?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden — admin only.' }, { status: 403 });
    }

    const adminClient = createAdminClient();

    // ── 3. Check username not taken in profiles ──────────────────────────────
    const { data: existingProfile } = await (adminClient as any)
      .from('profiles').select('id').ilike('username', normalizedUsername).maybeSingle();
    if (existingProfile) {
      return NextResponse.json(
        { error: `Username "@${normalizedUsername}" is already taken.` },
        { status: 409 }
      );
    }

    // ── 4. Create auth user, or recover if the internal email already exists ─
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
      const msg = createError.message.toLowerCase();
      const alreadyExists =
        msg.includes('already been registered') ||
        msg.includes('already registered') ||
        msg.includes('already exists') ||
        msg.includes('duplicate');

      if (!alreadyExists) {
        // Surface the real Supabase error — not a generic 500
        return NextResponse.json({ error: `Auth error: ${createError.message}` }, { status: 422 });
      }

      // Recover the orphaned auth user by scanning users list
      const listResult = await adminClient.auth.admin.listUsers({ perPage: 1000 });
      if (listResult.error) {
        return NextResponse.json(
          { error: `Failed to look up existing account: ${listResult.error.message}` },
          { status: 500 }
        );
      }

      const orphan = (listResult.data?.users ?? []).find(u => u.email === internalEmail);
      if (!orphan) {
        return NextResponse.json(
          { error: 'Username conflict — no matching account found. Please try a different username.' },
          { status: 409 }
        );
      }

      // Update their metadata to match this request
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
    const { error: upsertErr } = await (adminClient as any)
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

    if (upsertErr) {
      console.error('[invite] profile upsert error:', upsertErr.message);
      // Non-fatal — continue
    }

    // ── 6. Void any previous unused tokens for this user ────────────────────
    await (adminClient as any)
      .from('invites')
      .update({ used: true })
      .eq('user_id', userId)
      .eq('used', false);

    // ── 7. Generate fresh one-time token ─────────────────────────────────────
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const { error: inviteErr } = await (adminClient as any)
      .from('invites')
      .insert({
        user_id: userId,
        token,
        expires_at: expiresAt.toISOString(),
        used: false,
      });

    if (inviteErr) {
      return NextResponse.json(
        { error: `Failed to create invite token: ${inviteErr.message}` },
        { status: 500 }
      );
    }

    // ── 8. Build link and log ─────────────────────────────────────────────────
    const inviteLink = `${SITE_URL}/set-password?token=${token}`;

    try {
      await (supabaseServer as any).from('admin_activity_log').insert({
        admin_id: caller.id,
        action: 'INVITE_USER',
        target_type: 'profiles',
        target_id: userId,
        details: { username: normalizedUsername, role },
      });
    } catch { /* non-fatal — don't block the invite */ }

    return NextResponse.json({
      success: true,
      message: `Account created for @${normalizedUsername}. Share the invite link — it expires in 24 hours.`,
      inviteLink,
    });

  } catch (err: any) {
    // Expose the real exception so we can diagnose — this is safe since only
    // admins can hit this route.
    const detail = err?.message ?? String(err);
    console.error('[invite] unhandled exception:', detail, err?.stack);
    return NextResponse.json(
      { error: `Server exception: ${detail}` },
      { status: 500 }
    );
  }
}
