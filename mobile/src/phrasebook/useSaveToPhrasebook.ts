import { useCallback, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { getNativePhrasebookServices } from '../chat/native';
import { saveNativeMessageToPhrasebook } from './native';

export function useSaveToPhrasebook(messageIds: string[]) {
  const messageKey = [...new Set(messageIds.filter(Boolean))].join('\u0000');
  const ids = useMemo(() => messageKey ? messageKey.split('\u0000') : [], [messageKey]);
  const [savedIds, setSavedIds] = useState<ReadonlySet<string>>(() => new Set());
  const [savingIds, setSavingIds] = useState<ReadonlySet<string>>(() => new Set());
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const savingRef = useRef(new Set<string>());

  useFocusEffect(useCallback(() => {
    let active = true;
    void getNativePhrasebookServices()
      .then(({ phrasebook }) => phrasebook.savedSourceMessageIds(ids))
      .then(next => { if (active) setSavedIds(next); })
      .catch(() => { if (active) setSavedIds(new Set()); });
    return () => { active = false; };
  }, [ids]));

  const save = useCallback(async (messageId: string) => {
    if (savingRef.current.has(messageId)) return;
    savingRef.current.add(messageId);
    setSavingIds(new Set(savingRef.current));
    setError(null);
    setNotice(null);
    try {
      await saveNativeMessageToPhrasebook(messageId);
      setSavedIds(current => new Set(current).add(messageId));
      setNotice('Phrase saved to Phrasebook.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save this phrase.');
    } finally {
      savingRef.current.delete(messageId);
      setSavingIds(new Set(savingRef.current));
    }
  }, []);

  const clearNotices = useCallback(() => { setNotice(null); setError(null); }, []);
  return useMemo(() => ({
    isSaved: (messageId: string) => savedIds.has(messageId),
    isSaving: (messageId: string) => savingIds.has(messageId),
    save,
    notice,
    error,
    clearNotices,
  }), [savedIds, savingIds, save, notice, error, clearNotices]);
}
