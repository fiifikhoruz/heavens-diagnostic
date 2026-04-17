// In-memory draft storage (survives within session, not across page reloads)
const drafts = new Map<string, { data: any; savedAt: number }>();
const failedQueue: Array<{
  id: string;
  table: string;
  operation: 'insert' | 'update' | 'upsert';
  data: any;
  retryCount: number;
  maxRetries: number;
  createdAt: number;
}> = [];

// Save draft — call this on every input change (debounced)
export function saveDraft(key: string, data: any): void {
  drafts.set(key, { data: structuredClone(data), savedAt: Date.now() });
}

// Load draft
export function loadDraft<T = any>(key: string): T | null {
  const draft = drafts.get(key);
  return draft ? (draft.data as T) : null;
}

// Clear draft after successful save
export function clearDraft(key: string): void {
  drafts.delete(key);
}

// Check if draft exists and is newer than given timestamp
export function hasDraft(key: string, newerThan?: number): boolean {
  const draft = drafts.get(key);
  if (!draft) return false;
  if (newerThan) return draft.savedAt > newerThan;
  return true;
}

// Get draft age in seconds
export function getDraftAge(key: string): number | null {
  const draft = drafts.get(key);
  return draft ? Math.floor((Date.now() - draft.savedAt) / 1000) : null;
}

// Queue a failed submission for retry
export function queueForRetry(
  table: string,
  operation: 'insert' | 'update' | 'upsert',
  data: any,
  maxRetries: number = 3
): string {
  const id = crypto.randomUUID();
  failedQueue.push({ id, table, operation, data, retryCount: 0, maxRetries, createdAt: Date.now() });
  return id;
}

// Get pending retry count
export function getPendingRetryCount(): number {
  return failedQueue.length;
}

// Get all pending items
export function getPendingRetries(): typeof failedQueue {
  return [...failedQueue];
}

// Process retry queue — pass a supabase client
export async function processRetryQueue(supabase: any): Promise<{
  succeeded: number;
  failed: number;
  remaining: number;
}> {
  let succeeded = 0;
  let failed = 0;
  const stillPending: typeof failedQueue = [];

  for (const item of failedQueue) {
    try {
      let result;
      if (item.operation === 'insert') {
        result = await supabase.from(item.table).insert(item.data);
      } else if (item.operation === 'update') {
        result = await supabase.from(item.table).update(item.data.updates).eq('id', item.data.id);
      } else if (item.operation === 'upsert') {
        result = await supabase.from(item.table).upsert(item.data);
      }

      if (result?.error) throw result.error;
      succeeded++;
    } catch (err) {
      item.retryCount++;
      if (item.retryCount < item.maxRetries) {
        stillPending.push(item);
      } else {
        failed++;
      }
    }
  }

  // Replace queue with still-pending items
  failedQueue.length = 0;
  failedQueue.push(...stillPending);

  return { succeeded, failed, remaining: failedQueue.length };
}

// Online status detection
export function isOnline(): boolean {
  return typeof navigator !== 'undefined' ? navigator.onLine : true;
}
