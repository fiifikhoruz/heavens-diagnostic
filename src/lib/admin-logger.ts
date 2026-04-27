import { createClient } from '@/lib/supabase/client';

/**
 * Log an admin action from client-side code (browser).
 * Calls the SECURITY DEFINER RPC `log_admin_action_secure` which:
 *  - Verifies the caller is an admin inside the DB function
 *  - Inserts into admin_activity_log bypassing RLS
 * Non-fatal: failures are logged to console and swallowed.
 */
export async function logAdminAction(
  action: string,
  targetType?: string,
  targetId?: string,
  details?: Record<string, any>
) {
  try {
    const supabase = createClient();
    const { error } = await (supabase as any).rpc('log_admin_action_secure', {
      p_action:      action,
      p_target_type: targetType ?? null,
      p_target_id:   targetId   ?? null,
      p_details:     details    ?? null,
    });
    if (error) {
      console.error('[admin-logger] log_admin_action_secure:', error.message);
    }
  } catch (err) {
    console.error('[admin-logger] unexpected error:', err);
  }
}

/**
 * Log an admin action from server-side API routes.
 * Uses the adminClient (service role) which can call the
 * SECURITY DEFINER `log_admin_action_server` function.
 * Pass adminId explicitly since service role has no auth.uid().
 */
export async function logAdminActionServer(
  adminId: string,
  action: string,
  targetType?: string,
  targetId?: string,
  details?: Record<string, any>
) {
  try {
    const { createAdminClient } = await import('@/lib/supabase/admin');
    const adminClient = createAdminClient();
    const { error } = await (adminClient as any).rpc('log_admin_action_server', {
      p_admin_id:    adminId,
      p_action:      action,
      p_target_type: targetType ?? null,
      p_target_id:   targetId   ?? null,
      p_details:     details    ?? null,
    });
    if (error) {
      console.error('[admin-logger] log_admin_action_server:', error.message);
    }
  } catch (err) {
    console.error('[admin-logger] server log error:', err);
  }
}
