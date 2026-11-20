import { useEffect, useState } from 'react';
import { createUiStringLoader, ENGLISH_UI_STRINGS, type UiStrings } from '../../../shared/uiStrings';
import { getApiUrl } from '../config/api';

const loadUiStrings = createUiStringLoader(async language => {
  const response = await fetch(getApiUrl('/ui/translations'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ targetLanguage: language }),
  });
  if (!response.ok) throw new Error(`UI translations returned HTTP ${response.status}.`);
  const payload = await response.json();
  return payload?.strings;
}, (language, error) => {
  const reason = error instanceof Error ? error.message : 'Unknown error.';
  console.warn(`UI translations unavailable for ${language}. Using English. ${reason}`);
});

export function useUiStrings(language: string) {
  const [loaded, setLoaded] = useState<{ language: string; strings: UiStrings }>();
  useEffect(() => {
    let current = true;
    void loadUiStrings(language).then(strings => {
      if (current) setLoaded({ language, strings });
    });
    return () => {
      current = false;
    };
  }, [language]);

  return loaded?.language === language ? loaded.strings : ENGLISH_UI_STRINGS;
}
