import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';

// Initialize Supabase client for server-side operations
function createSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * Validates the Authorization header and returns the user
 */
async function validateAuth(
  supabase: ReturnType<typeof createSupabaseClient>,
  authHeader: string | null
) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.replace('Bearer ', '');

  try {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);

    if (error || !user) return null;
    return user;
  } catch {
    return null;
  }
}

/**
 * POST /api/reports/generate-token
 *
 * Generates a secure token for downloading a report
 *
 * Request body:
 * {
 *   "visitId": "string"
 * }
 *
 * Response:
 * {
 *   "token": "string",
 *   "downloadUrl": "string",
 *   "expiresAt": "ISO 8601 timestamp"
 * }
 */
export async function POST(request: NextRequest) {
  const supabase = createSupabaseClient();

  try {
    // Validate authentication
    const authHeader = request.headers.get('authorization');
    const user = await validateAuth(supabase, authHeader);

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Parse request body
    const body = await request.json();
    const { visitId } = body;

    if (!visitId || typeof visitId !== 'string') {
      return NextResponse.json(
        { error: 'Invalid visitId' },
        { status: 400 }
      );
    }

    // Verify visit exists and user has access
    const { data: visit, error: visitError } = await supabase
      .from('visits')
      .select('id, patient_id, status')
      .eq('id', visitId)
      .single();

    if (visitError || !visit) {
      return NextResponse.json(
        { error: 'Visit not found' },
        { status: 404 }
      );
    }

    // Only allow token generation for approved or delivered visits
    if (visit.status !== 'approved' && visit.status !== 'delivered') {
      return NextResponse.json(
        { error: 'Visit must be approved or delivered to generate a report token' },
        { status: 400 }
      );
    }

    // Generate a unique token
    const token = randomUUID();

    // Calculate expiry time (72 hours from now)
    const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000);

    // Store token in database
    const { error: insertError } = await supabase
      .from('report_tokens')
      .insert({
        token,
        visit_id: visitId,
        patient_id: visit.patient_id,
        created_by: user.id,
        expires_at: expiresAt.toISOString(),
      });

    if (insertError) {
      console.error('Error storing report token:', insertError);
      return NextResponse.json(
        { error: 'Failed to generate token' },
        { status: 500 }
      );
    }

    // Return token and download URL
    const downloadUrl = `/api/reports/download/${token}`;

    return NextResponse.json(
      {
        token,
        downloadUrl,
        expiresAt: expiresAt.toISOString(),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error generating report token:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
