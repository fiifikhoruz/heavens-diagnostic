'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { saveDraft, loadDraft, deleteDraft, timeAgo } from '@/lib/offline-drafts';

interface UseAutoSaveOptions {
  key: string;
  userId: string;
  debounceMs?: number;
  enabled?: boolean;
}

interface UseAutoSaveReturn {
  lastSaved: number | null;
  lastSavedLabel: string;
  isSaving: boolean;
  hasDraft: boolean;
  save: (data: any) => void;
  restore: () => Promise<any | null>;
  discard: () => Promise<void>;
}

export function useAutoSave({ key, userId, debounceMs = 5000, enabled = true }: UseAutoSaveOptions): UseAutoSaveReturn {
  const [lastSaved, setLastSaved] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [hasDraft, setHasDraft] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const dataRef = useRef<any>(null);

  // Check for existing draft on mount
  useEffect(() => {
    if (!enabled) return;
    loadDraft(key).then(draft => {
      if (draft) {
        setHasDraft(true);
        setLastSaved(draft.savedAt);
      }
    });
  }, [key, enabled]);

  // Update label every 30s
  const [lastSavedLabel, setLastSavedLabel] = useState('');
  useEffect(() => {
    const update = () => setLastSavedLabel(lastSaved ? timeAgo(lastSaved) : '');
    update();
    const interval = setInterval(update, 30000);
    return () => clearInterval(interval);
  }, [lastSaved]);

  const save = useCallback((data: any) => {
    if (!enabled) return;
    dataRef.current = data;

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      setIsSaving(true);
      try {
        await saveDraft(key, dataRef.current, userId);
        const now = Date.now();
        setLastSaved(now);
        setHasDraft(true);
      } catch (err) {
        console.error('Auto-save failed:', err);
      } finally {
        setIsSaving(false);
      }
    }, debounceMs);
  }, [key, userId, debounceMs, enabled]);

  const restore = useCallback(async () => {
    const draft = await loadDraft(key);
    return draft?.data || null;
  }, [key]);

  const discard = useCallback(async () => {
    await deleteDraft(key);
    setHasDraft(false);
    setLastSaved(null);
  }, [key]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return { lastSaved, lastSavedLabel, isSaving, hasDraft, save, restore, discard };
}
