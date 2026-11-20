import { getApiUrl } from '../mobile/src/config/api.ts';
import { UI_STRING_KEYS } from '../shared/uiStrings.ts';

try {
  const response = await fetch(getApiUrl('/ui/translations'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ targetLanguage: 'en' }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const payload = await response.json();
  const missing = UI_STRING_KEYS.filter(key => typeof payload?.strings?.[key] !== 'string');
  if (missing.length) {
    console.warn(`::warning::The configured API is missing ${missing.length} UI translation keys: ${missing.join(', ')}`);
  } else {
    console.log(`The configured API serves all ${UI_STRING_KEYS.length} UI translation keys.`);
  }
} catch (error) {
  console.warn(`::warning::Could not verify the configured UI translation API: ${error.message}`);
}
