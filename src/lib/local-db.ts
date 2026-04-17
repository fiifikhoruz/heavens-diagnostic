import Dexie, { type Table } from 'dexie';

// Local patient record (mirrors Supabase schema)
export interface LocalPatient {
  id: string;           // UUID generated on frontend
  patientId: string;    // e.g. PAT123456789
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  createdAt: string;
  updatedAt: string;    // used for conflict resolution
  synced: boolean;      // false = pending sync
  syncError?: string;
}

export interface LocalVisit {
  id: string;
  patientId: string;
  visitDate: string;
  status: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  synced: boolean;
  syncError?: string;
}

export interface LocalTest {
  id: string;
  visitId: string;
  testTypeId: string;
  testTypeName: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  synced: boolean;
}

export type SyncAction =
  | 'CREATE_PATIENT'
  | 'CREATE_VISIT'
  | 'CREATE_VISIT_TEST';

// Priority controls sync ordering: patients must sync before visits, visits before tests
export const SYNC_PRIORITY: Record<SyncAction, number> = {
  CREATE_PATIENT: 1,
  CREATE_VISIT: 2,
  CREATE_VISIT_TEST: 3,
};

export type SyncStatus = 'pending' | 'processing' | 'failed' | 'done';

export interface SyncQueueItem {
  id?: number;           // auto-increment
  action: SyncAction;
  payload: Record<string, unknown>;
  status: SyncStatus;
  retries: number;       // never capped — items are never dropped
  nextRetryAt?: string;  // exponential backoff: won't retry before this time
  createdAt: string;
  lastAttempt?: string;
  errorMessage?: string;
  conflictDetected?: boolean;  // true if server has a newer version
}

class HeavensDB extends Dexie {
  patients!: Table<LocalPatient, string>;
  visits!: Table<LocalVisit, string>;
  tests!: Table<LocalTest, string>;
  syncQueue!: Table<SyncQueueItem, number>;

  constructor() {
    super('HeavensDB');
    this.version(2).stores({
      patients: 'id, patientId, firstName, lastName, phone, createdAt, updatedAt, synced',
      visits: 'id, patientId, status, createdAt, updatedAt, synced',
      tests: 'id, visitId, testTypeId, synced',
      syncQueue: '++id, action, status, createdAt, nextRetryAt',
    });
  }
}

// Singleton — safe to import anywhere
let _db: HeavensDB | null = null;

export function getLocalDB(): HeavensDB {
  if (typeof window === 'undefined') {
    throw new Error('LocalDB is only available in the browser');
  }
  if (!_db) {
    _db = new HeavensDB();
  }
  return _db;
}

// Helpers
export async function getPendingSyncCount(): Promise<number> {
  try {
    const db = getLocalDB();
    const now = new Date().toISOString();
    return await db.syncQueue
      .where('status').anyOf(['pending', 'failed'])
      .and(item => !item.nextRetryAt || item.nextRetryAt <= now)
      .count();
  } catch {
    return 0;
  }
}

export async function getTotalQueueCount(): Promise<number> {
  try {
    const db = getLocalDB();
    return await db.syncQueue.where('status').anyOf(['pending', 'failed', 'processing']).count();
  } catch {
    return 0;
  }
}

export async function getFailedItems(): Promise<SyncQueueItem[]> {
  try {
    const db = getLocalDB();
    return await db.syncQueue.where('status').equals('failed').reverse().sortBy('lastAttempt');
  } catch {
    return [];
  }
}

export async function enqueueAction(
  action: SyncAction,
  payload: Record<string, unknown>
): Promise<void> {
  const db = getLocalDB();
  await db.syncQueue.add({
    action,
    payload,
    status: 'pending',
    retries: 0,
    createdAt: new Date().toISOString(),
  });
}

// Exponential backoff delays (in milliseconds)
// 30s → 2min → 5min → 15min → every 30min thereafter
export function getBackoffDelay(retries: number): number {
  const delays = [30_000, 120_000, 300_000, 900_000];
  return delays[Math.min(retries, delays.length - 1)];
}
