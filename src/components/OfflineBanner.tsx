'use client';

import { useEffect, useState, useCallback } from 'react';
import { useNetwork } from '@/hooks/useNetwork';
import { processSyncQueue } from '@/lib/sync-engine';
import { getPendingSyncCount } from '@/lib/local-db';

export function OfflineBanner() {
  const { isOnline, wasOffline } = useNetwork();
  const [pendingCount, setPendingCount] = useState(0);
  const [syncMessage, setSyncMessage] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);

  const updatePending = useCallback(async () => {
    const count = await getPendingSyncCount();
    setPendingCount(count);
  }, []);

  useEffect(() => {
    updatePending();
    const interval = setInterval(updatePending, 5000);
    return () => clearInterval(interval);
  }, [isOnline, updatePending]);

  useEffect(() => {
    if (wasOffline && isOnline) {
      setSyncMessage('Syncing your changes...');
      processSyncQueue().then(({ synced, failed }) => {
        if (synced > 0 && failed === 0) {
          setSyncMessage(`${synced} record${synced > 1 ? 's' : ''} synced successfully.`);
        } else if (failed > 0) {
          setSyncMessage(`${synced} synced, ${failed} failed. Will retry.`);
        } else {
          setSyncMessage('');
        }
        updatePending();
      });
    }
  }, [wasOffline, isOnline, updatePending]);

  const handleManualSync = async () => {
    if (!isOnline || isSyncing) return;
    setIsSyncing(true);
    setSyncMessage('Syncing...');
    try {
      const { synced, failed } = await processSyncQueue();
      if (synced > 0 && failed === 0) {
        setSyncMessage(`${synced} record${synced > 1 ? 's' : ''} synced.`);
      } else if (failed > 0) {
        setSyncMessage(`${synced} synced, ${failed} failed.`);
      } else {
        setSyncMessage('Nothing to sync.');
      }
      await updatePending();
    } finally {
      setIsSyncing(false);
    }
  };

  if (isOnline && !wasOffline) return null;

  if (wasOffline && isOnline) {
    return (
      <div className="fixed top-0 left-0 right-0 z-50 bg-green-600 text-white text-sm font-medium px-4 py-2 flex items-center justify-center gap-2 shadow-lg">
        <svg className="w-4 h-4 flex-shrink-0 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        {syncMessage || 'Back online. Syncing your changes...'}
      </div>
    );
  }

  // Offline banner
  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-amber-600 text-white text-sm font-medium px-4 py-2 flex items-center justify-between shadow-lg">
      <div className="flex items-center gap-2">
        <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636a9 9 0 010 12.728M15.536 8.464a5 5 0 010 7.072M6.343 6.343a9 9 0 000 12.728m2.829-2.829a5 5 0 000-7.07M12 12h.01" />
        </svg>
        <span>
          Offline mode
          {pendingCount > 0 ? ` — ${pendingCount} change${pendingCount > 1 ? 's' : ''} pending sync` : ''}.
          {' '}Patient registration and visit creation still work.
        </span>
        {syncMessage && (
          <span className="text-amber-200 ml-1">· {syncMessage}</span>
        )}
      </div>
      {pendingCount > 0 && isOnline && (
        <button
          onClick={handleManualSync}
          disabled={isSyncing}
          className="ml-4 flex-shrink-0 flex items-center gap-1.5 bg-white/20 hover:bg-white/30 disabled:opacity-60 disabled:cursor-not-allowed text-white text-xs font-semibold px-3 py-1 rounded-full transition"
        >
          {isSyncing ? (
            <>
              <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Syncing...
            </>
          ) : (
            <>
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Sync Now
            </>
          )}
        </button>
      )}
    </div>
  );
}
