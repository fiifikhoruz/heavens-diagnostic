import { createServerClient } from '@supabase/ssr';
import { createAdminClient } from '@/lib/supabase/admin';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { Database } from '@/lib/supabase/database.types';

export async function POST(request: NextRequest) {
  try {
    const { email, role, fullName } = await request.json();

    // ── 1. Validate inputs ──────────────────────────────────────────────────
    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }
    if (!role || !['front_desk', 'technician', 'doctor', 'admin'].includes(role)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
    }

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
            } catch { /* ignored in server context */ }
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

    // ── 3. Use service-role admin client to send the invite ─────────────────
    const adminClient = createAdminClient();

    const { data: inviteData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(
      email.toLowerCase().trim(),
      {
        data: { role, full_name: fullName || '' },
        redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://heavens-diagnostic-qjvm-three.vercel.app'}/api/auth/callback?next=/dashboard/set-password`,
      }
    );

    if (inviteError) {
      // Supabase returns 422 if email already exists / already invited
      return NextResponse.json(
        { error: inviteError.message },
        { status: 422 }
      );
    }

    const newUserId = inviteData.user.id;

    // ── 4. Pre-create the profile row with the assigned role ────────────────
    // This makes the user appear in the admin list immediately, even before
    // they accept the invite and set their password.
    const { error: profileError } = await adminClient
      .from('profiles')
      .upsert(
        {
          id: newUserId,
          email: email.toLowerCase().trim(),
          full_name: fullName || null,
          role,
          is_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id' }
      );

    if (profileError) {
      // Non-fatal — profile trigger may have already created it
      console.warn('[invite] Profile upsert warning:', profileError.message);
    }

    // ── 5. Log the admin action ─────────────────────────────────────────────
    await (supabaseServer as any).from('admin_activity_log').insert({
      admin_id: callerUser.id,
      action: 'INVITE_USER',
      target_type: 'profiles',
      target_id: newUserId,
      details: { email, role, full_name: fullName || null },
    });

    return NextResponse.json({
      success: true,
      message: `Invite sent to ${email}`,
      userId: newUserId,
    });
  } catch (err) {
    console.error('[invite] Unexpected error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
