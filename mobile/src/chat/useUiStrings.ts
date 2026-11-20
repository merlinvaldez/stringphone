import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { BUNDLED_UI_STRINGS } from '../../../shared/bundledUiStrings';
import { createUiStringLoader, ENGLISH_UI_STRINGS, type UiStrings } from '../../../shared/uiStrings';
import { getApiUrl } from '../config/api';

const MAX_REMOTE_RETRIES = 3;
const RETRY_DELAY_MS = 5_000;

const loadUiStrings = createUiStringLoader(
  async language => {
    const response = await fetch(getApiUrl('/ui/translations'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetLanguage: language }),
    });
    if (!response.ok) throw new Error(`UI translations returned HTTP ${response.status}.`);
    const payload = await response.json();
    return payload?.strings;
  },
  {
    bundledCatalogs: BUNDLED_UI_STRINGS,
    onFailure: (language, error) => {
      const reason = error instanceof Error ? error.message : 'Unknown error.';
      console.warn(`UI translations unavailable for ${language}. Using fallback catalog. ${reason}`);
    },
  },
);

export function useUiStrings(language: string) {
  const normalized = (language || 'en').trim().toLowerCase() || 'en';
  const syncStrings = loadUiStrings.getSync(normalized);
  const [loaded, setLoaded] = useState<{ language: string; strings: UiStrings } | undefined>(() =>
    syncStrings ? { language: normalized, strings: syncStrings } : undefined,
  );

  useEffect(() => {
    if (loadUiStrings.isCached(normalized)) {
      return undefined;
    }

    let current = true;
    let attempts = 0;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const attemptLoad = () => {
      void loadUiStrings(normalized).then(strings => {
        if (!current) return;
        setLoaded({ language: normalized, strings });
        if (!loadUiStrings.isCached(normalized) && attempts < MAX_REMOTE_RETRIES) {
          attempts += 1;
          retryTimer = setTimeout(attemptLoad, RETRY_DELAY_MS);
        }
      });
    };

    attemptLoad();

    const appStateSub = AppState.addEventListener('change', nextState => {
      if (nextState === 'active' && !loadUiStrings.isCached(normalized)) {
        if (retryTimer) {
          clearTimeout(retryTimer);
          retryTimer = null;
        }
        attemptLoad();
      }
    });

    return () => {
      current = false;
      if (retryTimer) clearTimeout(retryTimer);
      appStateSub.remove();
    };
  }, [normalized]);

  return syncStrings ?? (loaded?.language === normalized ? loaded.strings : ENGLISH_UI_STRINGS);
}
