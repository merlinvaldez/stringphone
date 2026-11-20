import { getApiUrl } from '../mobile/src/config/api.ts';
import { BUNDLED_UI_STRINGS } from '../shared/bundledUiStrings.ts';
import { isCompleteUiStringCatalog, UI_STRING_KEYS } from '../shared/uiStrings.ts';

const incompleteBundled = Object.entries(BUNDLED_UI_STRINGS)
  .filter(([, catalog]) => !isCompleteUiStringCatalog(catalog))
  .map(([code]) => code);

if (incompleteBundled.length > 0) {
  console.error(
    `Bundled UI translation catalogs are incomplete for: ${incompleteBundled.join(', ')}`,
  );
  process.exit(1);
}

console.log(
  `Verified ${Object.keys(BUNDLED_UI_STRINGS).length} complete bundled UI translation catalogs (${UI_STRING_KEYS.length} keys each).`,
);

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
