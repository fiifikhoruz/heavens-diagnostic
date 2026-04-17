'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { getLocalDB, type SyncQueueItem, type SyncAction } from '@/lib/local-db';
import { processSyncQueue } from '@/lib/sync-engine';
import { useNetwork } from '@/hooks/useNetwork';

const ACTION_LABELS: Record<SyncAction, string> = {
  CREATE_PATIENT: 'New Patient',
  CREATE_VISIT: 'New Visit',
  CREATE_VISIT_TEST: 'New Test',
};

const ACTION_COLORS: Record<SyncAction, string> = {
  CREATE_PATIENT: 'bg-blue-100 text-blue-700',
  CREATE_VISIT: 'bg-green-100 text-green-700',
  CREATE_VISIT_TEST: 'bg-purple-100 text-purple-700',
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function nextRetryIn(iso?: string): string {
  if (!iso) return 'soon';
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return 'now';
  const m = Math.ceil(diff / 60000);
  if (m < 60) return `${m}m`;
  return `${Math.ceil(m / 60)}h`;
}

export default function SyncIssuesPage() {
  const { isOnline } = useNetwork();
  const [allItems, setAllItems] = useState<SyncQueueItem[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncResult, setLastSyncResult] = useState<{ synced: number; failed: number; conflicts: number } | null>(null);

  const loadItems = useCallback(async () => {
    try {
      const db = getLocalDB();
      const items = await db.syncQueue
        .where('status')
        .anyOf(['pending', 'failed', 'processing'])
        .reverse()
        .sortBy('createdAt');
      setAllItems(items);
    } catch {
      setAllItems([]);
    }
  }, []);

  useEffect(() => {
    loadItems();
    const interval = setInterval(loadItems, 5000);
    return () => clearInterval(interval);
  }, [loadItems]);

  const handleForceSync = async () => {
    if (!isOnline || isSyncing) return;
    setIsSyncing(true);
    setLastSyncResult(null);
    try {
      const result = await processSyncQueue();
      setLastSyncResult(result);
      await loadItems();
    } finally {
      setIsSyncing(false);
    }
  };

  const handleRetryItem = async (item: SyncQueueItem) => {
    try {
      const db = getLocalDB();
      await db.syncQueue.update(item.id!, {
        status: 'pending',
        nextRetryAt: undefined,
        conflictDetected: false,
        errorMessage: undefined,
      });
      await loadItems();
    } catch (err) {
      console.error('Failed to reset item:', err);
    }
  };

  const handleDismissItem = async (item: SyncQueueItem) => {
    try {
      const db = getLocalDB();
      await db.syncQueue.update(item.id!, { status: 'done' });
      await loadItems();
    } catch (err) {
      console.error('Failed to dismiss item:', err);
    }
  };

  const pending = allItems.filter(i => i.status === 'pending');
  const failed = allItems.filter(i => i.status === 'failed' && !i.conflictDetected);
  const conflicts = allItems.filter(i => i.conflictDetected);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <Link href="/dashboard/admin" className="text-green-600 hover:text-green-700 font-medium mb-4 inline-flex items-center gap-2 text-sm">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Admin
        </Link>
        <div className="flex items-center justify-between mt-2">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Sync Issues</h1>
            <p className="text-gray-500 text-sm mt-1">Records created offline that need to sync to the server</p>
          </div>
          <div className="flex items-center gap-3">
            {/* Online indicator */}
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${isOnline ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
              <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-green-500' : 'bg-amber-500 animate-pulse'}`} />
              {isOnline ? 'Online' : 'Offline'}
            </div>
            {/* Force sync button */}
            <button
              onClick={handleForceSync}
              disabled={!isOnline || isSyncing}
              className="flex items-center gap-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-medium px-4 py-2 rounded-lg text-sm transition"
            >
              {isSyncing ? (
                <>
                  <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Syncing...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Sync Now
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Last sync result */}
      {lastSyncResult && (
        <div className={`mb-6 rounded-lg px-4 py-3 text-sm font-medium ${lastSyncResult.failed === 0 && lastSyncResult.conflicts === 0 ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-amber-50 border border-amber-200 text-amber-700'}`}>
          Sync complete — {lastSyncResult.synced} synced
          {lastSyncResult.failed > 0 ? `, ${lastSyncResult.failed} failed` : ''}
          {lastSyncResult.conflicts > 0 ? `, ${lastSyncResult.conflicts} conflicts` : ''}
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-500 mb-1">Pending Sync</p>
          <p className="text-3xl font-bold text-amber-600">{pending.length}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-500 mb-1">Failed (will retry)</p>
          <p className="text-3xl font-bold text-red-600">{failed.length}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-500 mb-1">Conflicts</p>
          <p className="text-3xl font-bold text-purple-600">{conflicts.length}</p>
          <p className="text-xs text-gray-400 mt-1">Need manual review</p>
        </div>
      </div>

      {allItems.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
          <svg className="w-12 h-12 text-green-500 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-gray-900 font-semibold">All records synced</p>
          <p className="text-gray-500 text-sm mt-1">No pending offline changes</p>
        </div>
      ) : (
        <div className="space-y-4">

          {/* Conflicts — shown first, most urgent */}
          {conflicts.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3 flex items-center gap-2">
                <span className="w-2 h-2 bg-purple-500 rounded-full" />
                Conflicts — server data is newer
              </h2>
              <div className="space-y-2">
                {conflicts.map(item => (
                  <div key={item.id} className="bg-white border border-purple-200 rounded-lg p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${ACTION_COLORS[item.action]}`}>
                            {ACTION_LABELS[item.action]}
                          </span>
                          <span className="text-xs text-purple-600 font-medium">Conflict</span>
                        </div>
                        <p className="text-xs text-gray-500 truncate">
                          ID: {item.payload.id as string}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">{item.errorMessage}</p>
                        <p className="text-xs text-gray-400 mt-0.5">Created {timeAgo(item.createdAt)}</p>
                      </div>
                      <div className="flex gap-2 flex-shrink-0">
                        <button
                          onClick={() => handleRetryItem(item)}
                          className="text-xs text-purple-600 hover:text-purple-800 border border-purple-200 hover:border-purple-400 px-3 py-1.5 rounded-lg transition font-medium"
                        >
                          Force overwrite
                        </button>
                        <button
                          onClick={() => handleDismissItem(item)}
                          className="text-xs text-gray-500 hover:text-gray-700 border border-gray-200 px-3 py-1.5 rounded-lg transition"
                        >
                          Dismiss
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Failed items */}
          {failed.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3 flex items-center gap-2">
                <span className="w-2 h-2 bg-red-500 rounded-full" />
                Failed — will retry automatically
              </h2>
              <div className="space-y-2">
                {failed.map(item => (
                  <div key={item.id} className="bg-white border border-red-100 rounded-lg p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${ACTION_COLORS[item.action]}`}>
                            {ACTION_LABELS[item.action]}
                          </span>
                          <span className="text-xs text-red-600 font-medium">
                            {item.retries} {item.retries === 1 ? 'retry' : 'retries'}
                          </span>
                          {item.nextRetryAt && (
                            <span className="text-xs text-gray-400">
                              · Next retry in {nextRetryIn(item.nextRetryAt)}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-red-600 font-mono bg-red-50 rounded px-2 py-1 mt-1 truncate">
                          {item.errorMessage ?? 'Unknown error'}
                        </p>
                        <p className="text-xs text-gray-400 mt-1">
                          Last attempted {item.lastAttempt ? timeAgo(item.lastAttempt) : '—'} · Created {timeAgo(item.createdAt)}
                        </p>
                      </div>
                      <button
                        onClick={() => handleRetryItem(item)}
                        className="text-xs text-green-600 hover:text-green-800 border border-green-200 hover:border-green-400 px-3 py-1.5 rounded-lg transition font-medium flex-shrink-0"
                      >
                        Retry now
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Pending items */}
          {pending.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3 flex items-center gap-2">
                <span className="w-2 h-2 bg-amber-500 rounded-full animate-pulse" />
                Pending sync
              </h2>
              <div className="space-y-2">
                {pending.map(item => (
                  <div key={item.id} className="bg-white border border-amber-100 rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${ACTION_COLORS[item.action]}`}>
                            {ACTION_LABELS[item.action]}
                          </span>
                          {(item.payload.first_name as string | undefined) && (
                            <span className="text-sm text-gray-700 font-medium">
                              {item.payload.first_name as string} {item.payload.last_name as string}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-400 mt-1">Created {timeAgo(item.createdAt)}</p>
                      </div>
                      <span className="text-xs text-amber-600 font-medium">Waiting to sync</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
