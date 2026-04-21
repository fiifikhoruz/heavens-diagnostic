import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const { username, password } = await request.json();

    if (!username || !password) {
      return NextResponse.json(
        { error: 'Username and password are required.' },
        { status: 400 }
      );
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    // If the input looks like an email, use it directly.
    // Otherwise try to resolve username → email via the lookup function.
    let email = username.trim().toLowerCase();

    if (!email.includes('@')) {
      const { data } = await (supabase as any).rpc('lookup_email_by_username', {
        p_username: email,
      });
      if (data) email = data as string;
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      console.error('[login]', error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ session: data.session });
  } catch (err) {
    console.error('[login] unhandled:', err);
    return NextResponse.json(
      { error: 'An unexpected error occurred. Please try again.' },
      { status: 500 }
    );
  }
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}
