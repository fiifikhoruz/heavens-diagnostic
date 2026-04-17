import { createClient } from '@/lib/supabase/client';
import {
  getLocalDB,
  type SyncQueueItem,
  SYNC_PRIORITY,
  getBackoffDelay,
} from './local-db';

// ─────────────────────────────────────────────
// Conflict detection: only overwrite if local
// updatedAt is newer than the server record.
// If server is newer, flag conflict and skip.
// ─────────────────────────────────────────────
async function checkConflict(
  table: string,
  id: string,
  localUpdatedAt: string
): Promise<'ok' | 'conflict' | 'new'> {
  try {
    const supabase = createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from(table)
      .select('updated_at')
      .eq('id', id)
      .maybeSingle();

    if (error || !data) return 'new'; // record doesn't exist yet → safe to insert

    const serverTime = new Date(data.updated_at).getTime();
    const localTime = new Date(localUpdatedAt).getTime();

    if (localTime >= serverTime) return 'ok';   // local is newer or same → safe to write
    return 'conflict';                           // server is newer → skip, log
  } catch {
    return 'ok'; // if we can't check, proceed (write is safe on new records)
  }
}

async function processItem(item: SyncQueueItem): Promise<void> {
  const supabase = createClient();
  const db = getLocalDB();

  switch (item.action) {
    case 'CREATE_PATIENT': {
      const table = 'patients';
      const localUpdatedAt = item.payload.updated_at as string ?? item.payload.created_at as string;
      const conflictState = await checkConflict(table, item.payload.id as string, localUpdatedAt);

      if (conflictState === 'conflict') {
        // Server has a newer version — log conflict, don't overwrite
        await db.syncQueue.update(item.id!, {
          status: 'failed',
          conflictDetected: true,
          errorMessage: `Conflict: server record is newer (server updated_at > local ${localUpdatedAt}). Manual review needed.`,
          lastAttempt: new Date().toISOString(),
        });
        return; // don't throw — this isn't a retry-able error
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from(table)
        .upsert(item.payload, { onConflict: 'id' });
      if (error) throw new Error(error.message);
      break;
    }

    case 'CREATE_VISIT': {
      const table = 'visits';
      const localUpdatedAt = item.payload.updated_at as string ?? item.payload.created_at as string;
      const conflictState = await checkConflict(table, item.payload.id as string, localUpdatedAt);

      if (conflictState === 'conflict') {
        await db.syncQueue.update(item.id!, {
          status: 'failed',
          conflictDetected: true,
          errorMessage: `Conflict: server visit record is newer. Manual review needed.`,
          lastAttempt: new Date().toISOString(),
        });
        return;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from(table)
        .upsert(item.payload, { onConflict: 'id' });
      if (error) throw new Error(error.message);
      break;
    }

    case 'CREATE_VISIT_TEST': {
      // Tests don't have a meaningful conflict scenario (they're created once)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('visit_tests')
        .upsert(item.payload, { onConflict: 'id' });
      if (error) throw new Error(error.message);
      break;
    }

    default:
      throw new Error(`Unknown sync action: ${(item as SyncQueueItem).action}`);
  }

  // Success: mark done and update local synced flag
  await db.syncQueue.update(item.id!, {
    status: 'done',
    lastAttempt: new Date().toISOString(),
  });

  if (item.action === 'CREATE_PATIENT') {
    await db.patients.update(item.payload.id as string, { synced: true, syncError: undefined });
  } else if (item.action === 'CREATE_VISIT') {
    await db.visits.update(item.payload.id as string, { synced: true, syncError: undefined });
  } else if (item.action === 'CREATE_VISIT_TEST') {
    await db.tests.update(item.payload.id as string, { synced: true });
  }
}

// ─────────────────────────────────────────────
// Main queue processor
// - Sorts by SYNC_PRIORITY so patients always
//   sync before visits, visits before tests.
// - Respects exponential backoff (nextRetryAt).
// - NEVER drops failed items — retries forever
//   with increasing delays.
// ─────────────────────────────────────────────
export async function processSyncQueue(): Promise<{ synced: number; failed: number; conflicts: number }> {
  if (typeof window === 'undefined') return { synced: 0, failed: 0, conflicts: 0 };

  let synced = 0;
  let failed = 0;
  let conflicts = 0;

  try {
    const db = getLocalDB();
    const now = new Date().toISOString();

    // Fetch pending and failed items that are ready to retry
    const candidates = await db.syncQueue
      .where('status')
      .anyOf(['pending', 'failed'])
      .and(item =>
        !item.conflictDetected &&                              // don't auto-retry conflicts
        (!item.nextRetryAt || item.nextRetryAt <= now)         // respect backoff window
      )
      .toArray();

    // Sort: patients first (priority 1), visits second (2), tests last (3),
    // then by createdAt ascending within each group
    candidates.sort((a, b) => {
      const pa = SYNC_PRIORITY[a.action] ?? 99;
      const pb = SYNC_PRIORITY[b.action] ?? 99;
      if (pa !== pb) return pa - pb;
      return a.createdAt.localeCompare(b.createdAt);
    });

    for (const item of candidates) {
      // Mark as in-progress
      await db.syncQueue.update(item.id!, {
        status: 'processing',
        lastAttempt: now,
      });

      try {
        await processItem(item);

        if (item.conflictDetected) {
          conflicts++;
        } else {
          synced++;
        }
      } catch (err) {
        const newRetries = item.retries + 1;
        const delayMs = getBackoffDelay(newRetries);
        const nextRetryAt = new Date(Date.now() + delayMs).toISOString();

        await db.syncQueue.update(item.id!, {
          status: 'failed',
          retries: newRetries,
          nextRetryAt,
          lastAttempt: new Date().toISOString(),
          errorMessage: err instanceof Error ? err.message : 'Unknown error',
        });

        // Also flag the local record so UI can show the error
        if (item.action === 'CREATE_PATIENT') {
          await db.patients.update(item.payload.id as string, {
            syncError: err instanceof Error ? err.message : 'Sync failed',
          });
        } else if (item.action === 'CREATE_VISIT') {
          await db.visits.update(item.payload.id as string, {
            syncError: err instanceof Error ? err.message : 'Sync failed',
          });
        }

        failed++;
      }
    }
  } catch (err) {
    console.error('[SyncEngine] Queue processing error:', err);
  }

  return { synced, failed, conflicts };
}

// ─────────────────────────────────────────────
// Scheduler: runs on mount, reconnect, every 30s
// ─────────────────────────────────────────────
let syncInterval: ReturnType<typeof setInterval> | null = null;

export function startSyncScheduler(): () => void {
  if (typeof window === 'undefined') return () => {};

  const run = () => {
    if (navigator.onLine) {
      processSyncQueue().catch(console.error);
    }
  };

  run();
  syncInterval = setInterval(run, 30_000);
  window.addEventListener('online', run);

  return () => {
    if (syncInterval) clearInterval(syncInterval);
    window.removeEventListener('online', run);
  };
}
