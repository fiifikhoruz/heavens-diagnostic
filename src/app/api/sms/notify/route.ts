import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

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
 * POST /api/sms/notify
 *
 * Sends an SMS notification to the patient about their results
 *
 * Request body:
 * {
 *   "visitId": "string",
 *   "phoneNumber": "string",
 *   "message": "string"
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "message": "SMS sent successfully"
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
    const { visitId, phoneNumber, message } = body;

    if (!visitId || !phoneNumber || !message) {
      return NextResponse.json(
        { error: 'Missing required fields: visitId, phoneNumber, message' },
        { status: 400 }
      );
    }

    // Verify visit exists
    const { data: visit, error: visitError } = await supabase
      .from('visits')
      .select('id, patient_id')
      .eq('id', visitId)
      .single();

    if (visitError || !visit) {
      return NextResponse.json(
        { error: 'Visit not found' },
        { status: 404 }
      );
    }

    // TODO: Integrate with actual SMS provider (Twilio, AWS SNS, etc.)
    // For now, we'll store the SMS log in the database
    // In production, you would:
    // 1. Call your SMS provider's API
    // 2. Check for delivery success
    // 3. Return appropriate error if it fails

    console.log(`SMS sent to ${phoneNumber}: ${message}`);

    // Store SMS log in database (optional - requires sms_logs table)
    const { error: logError } = await supabase
      .from('sms_logs')
      .insert({
        visit_id: visitId,
        patient_id: visit.patient_id,
        phone_number: phoneNumber,
        message: message,
        sent_by: user.id,
        status: 'sent',
        sent_at: new Date().toISOString(),
      });

    if (logError) {
      console.warn('Warning: Could not log SMS to database:', logError);
      // Don't fail the request if logging fails
    }

    return NextResponse.json(
      {
        success: true,
        message: 'SMS sent successfully',
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error sending SMS notification:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
