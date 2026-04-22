import { createAdminClient } from '@/lib/supabase/admin';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { token, password } = await request.json();

    // ── 1. Basic validation ─────────────────────────────────────────────────
    if (!token || typeof token !== 'string') {
      return NextResponse.json({ error: 'Invalid or missing invite token.' }, { status: 400 });
    }
    if (!password || password.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters.' },
        { status: 400 }
      );
    }

    const adminClient = createAdminClient();

    // ── 2. Look up the invite token ─────────────────────────────────────────
    const { data: invite, error: lookupError } = await (adminClient as any)
      .from('invites')
      .select('id, user_id, expires_at, used')
      .eq('token', token)
      .maybeSingle();

    if (lookupError) {
      console.error('[set-password] Token lookup error:', lookupError.message);
      return NextResponse.json({ error: 'Could not validate token.' }, { status: 500 });
    }

    if (!invite) {
      return NextResponse.json({ error: 'Invite link is invalid.' }, { status: 404 });
    }

    // ── 3. Check expiry and used status ─────────────────────────────────────
    if (invite.used) {
      return NextResponse.json(
        { error: 'This invite link has already been used. Please ask an admin for a new one.' },
        { status: 410 }
      );
    }

    if (new Date(invite.expires_at) < new Date()) {
      return NextResponse.json(
        { error: 'This invite link has expired. Please ask an admin for a new one.' },
        { status: 410 }
      );
    }

    // ── 4. Set the password via admin client (user is NOT authenticated yet) ─
    const { error: updateError } = await adminClient.auth.admin.updateUserById(
      invite.user_id,
      { password }
    );

    if (updateError) {
      console.error('[set-password] updateUserById error:', updateError.message);
      return NextResponse.json({ error: updateError.message }, { status: 422 });
    }

    // ── 5. Mark the token as used ───────────────────────────────────────────
    await (adminClient as any)
      .from('invites')
      .update({ used: true })
      .eq('id', invite.id);

    // ── 6. Update the profile updated_at timestamp ──────────────────────────
    await (adminClient as any)
      .from('profiles')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', invite.user_id);

    return NextResponse.json({
      success: true,
      message: 'Password set successfully. You can now log in.',
    });
  } catch (err) {
    console.error('[set-password] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}
