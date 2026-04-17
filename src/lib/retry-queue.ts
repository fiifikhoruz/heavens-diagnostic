'use client';

interface QueuedOperation {
  id: string;
  table: string;
  operation: 'insert' | 'update' | 'upsert';
  data: any;
  matchColumns?: string[];   // for upsert
  filterColumn?: string;     // for update .eq()
  filterValue?: string;
  attempts: number;
  maxAttempts: number;
  createdAt: number;
  lastAttempt: number | null;
  error: string | null;
}

const QUEUE_KEY = 'heavens_retry_queue';

function getQueue(): QueuedOperation[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveQueue(queue: QueuedOperation[]): void {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export function enqueueOperation(op: Omit<QueuedOperation, 'id' | 'attempts' | 'createdAt' | 'lastAttempt' | 'error'>): string {
  const id = crypto.randomUUID();
  const queue = getQueue();
  queue.push({
    ...op,
    id,
    attempts: 0,
    maxAttempts: op.maxAttempts || 5,
    createdAt: Date.now(),
    lastAttempt: null,
    error: null,
  });
  saveQueue(queue);
  return id;
}

export function getQueuedOperations(): QueuedOperation[] {
  return getQueue();
}

export function getPendingCount(): number {
  return getQueue().filter(op => op.attempts < op.maxAttempts).length;
}

export function removeFromQueue(id: string): void {
  saveQueue(getQueue().filter(op => op.id !== id));
}

export function clearQueue(): void {
  localStorage.removeItem(QUEUE_KEY);
}

export async function processQueue(supabase: any): Promise<{ processed: number; failed: number; remaining: number }> {
  const queue = getQueue();
  let processed = 0;
  let failed = 0;

  for (const op of queue) {
    if (op.attempts >= op.maxAttempts) {
      failed++;
      continue;
    }

    op.attempts++;
    op.lastAttempt = Date.now();

    try {
      let result;
      if (op.operation === 'insert') {
        result = await supabase.from(op.table).insert(op.data);
      } else if (op.operation === 'update' && op.filterColumn && op.filterValue) {
        result = await supabase.from(op.table).update(op.data).eq(op.filterColumn, op.filterValue);
      } else if (op.operation === 'upsert') {
        result = await supabase.from(op.table).upsert(op.data, op.matchColumns ? { onConflict: op.matchColumns.join(',') } : undefined);
      }

      if (result?.error) throw new Error(result.error.message);

      // Success - remove from queue
      op.attempts = op.maxAttempts + 1; // mark as done
      processed++;
    } catch (err: any) {
      op.error = err.message || 'Unknown error';
      if (op.attempts >= op.maxAttempts) failed++;
    }
  }

  // Save updated queue, keeping only pending items
  saveQueue(queue.filter(op => op.attempts < op.maxAttempts));

  return { processed, failed, remaining: getPendingCount() };
}
