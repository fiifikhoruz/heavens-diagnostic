import { createClient } from '@/lib/supabase/client';

export async function logAdminAction(
  action: string,
  targetType?: string,
  targetId?: string,
  details?: Record<string, any>
) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return;

  try {
    await (supabase as any).from('admin_activity_log').insert({
      admin_id: user.id,
      action,
      target_type: targetType || null,
      target_id: targetId || null,
      details: details || null,
    });
  } catch (error) {
    console.error('Failed to log admin action:', error);
  }
}
