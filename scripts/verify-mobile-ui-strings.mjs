import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { BUNDLED_UI_STRINGS } from '../shared/bundledUiStrings.ts';
import { SUPPORTED_TTS_LANGUAGE_OPTIONS } from '../shared/languages.ts';
import {
  createUiStringLoader,
  ENGLISH_UI_STRINGS,
  interpolateTemplate,
  isCompleteUiStringCatalog,
  UI_STRING_KEYS,
} from '../shared/uiStrings.ts';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === './languages' && context.parentURL?.endsWith('/shared/languageOptions.ts')) {
      return nextResolve('./languages.ts', context);
    }
    return nextResolve(specifier, context);
  },
});

const {
  getNativeLanguageName,
  LANGUAGE_OPTIONS,
  NATIVE_LANGUAGE_NAMES,
} = await import('../shared/languageOptions.ts');

// 1. Native language names work for all 43 languages even when Intl.DisplayNames is missing (Hermes).
assert.equal(Object.keys(NATIVE_LANGUAGE_NAMES).length, SUPPORTED_TTS_LANGUAGE_OPTIONS.length);
assert.equal(LANGUAGE_OPTIONS.length, SUPPORTED_TTS_LANGUAGE_OPTIONS.length);

const originalDisplayNames = Intl.DisplayNames;
try {
  // @ts-ignore simulate Hermes runtime lacking Intl.DisplayNames
  Intl.DisplayNames = undefined;
  for (const language of SUPPORTED_TTS_LANGUAGE_OPTIONS) {
    const nativeName = getNativeLanguageName(language.code);
    assert.ok(nativeName && nativeName.trim().length > 0, `Missing native name for ${language.code}`);
    assert.equal(nativeName, NATIVE_LANGUAGE_NAMES[language.code]);
  }
  assert.equal(getNativeLanguageName('es'), 'Español');
  assert.equal(getNativeLanguageName('ar'), 'العربية');
  assert.equal(getNativeLanguageName('ja'), '日本語');
  assert.equal(getNativeLanguageName('zh'), '中文');
  assert.equal(getNativeLanguageName('fa'), 'فارسی');
} finally {
  Intl.DisplayNames = originalDisplayNames;
}

// 2. BUNDLED_UI_STRINGS covers all 42 non-English languages completely with preserved placeholders.
const nonEnglishCodes = SUPPORTED_TTS_LANGUAGE_OPTIONS.map(l => l.code).filter(c => c !== 'en');
assert.equal(Object.keys(BUNDLED_UI_STRINGS).length, nonEnglishCodes.length);

const sentinelKeys = [
  'speak',
  'listen',
  'tap',
  'history',
  'newConversation',
  'searchLanguages',
  'messageIn',
  'speechVoice',
  'modePhrasebook',
];

for (const code of nonEnglishCodes) {
  const catalog = BUNDLED_UI_STRINGS[code];
  assert.ok(catalog, `Missing bundled catalog for ${code}`);
  assert.equal(
    isCompleteUiStringCatalog(catalog),
    true,
    `Bundled catalog for ${code} is incomplete or broke placeholders`,
  );
  for (const key of UI_STRING_KEYS) {
    const expectedPlaceholders = ENGLISH_UI_STRINGS[key].match(/\{\w+\}/g) ?? [];
    for (const placeholder of expectedPlaceholders) {
      assert.ok(
        catalog[key].includes(placeholder),
        `Missing placeholder ${placeholder} in ${code}.${key}`,
      );
    }
  }
  for (const sentinel of sentinelKeys) {
    assert.notEqual(
      catalog[sentinel],
      ENGLISH_UI_STRINGS[sentinel],
      `Sentinel ${code}.${sentinel} was not translated`,
    );
  }
}

// 3. Loader behavior: offline/bundled zero-network hit, partial fallback preservation, unbundled retry.
let bundledCalls = 0;
const bundledLoader = createUiStringLoader(
  async language => {
    bundledCalls += 1;
    if (language === 'xx') throw new Error('Network error');
    return { ...ENGLISH_UI_STRINGS, speak: 'Loaded Speak' };
  },
  {
    bundledCatalogs: {
      es: BUNDLED_UI_STRINGS.es,
      pt: { speak: 'Falar Bundled' }, // partial
    },
  },
);

assert.equal(bundledLoader.isCached('en'), true);
assert.equal(bundledLoader.isCached('es'), true);
assert.equal(bundledLoader.isCached('pt'), false);
assert.equal(bundledLoader.getSync('es')?.speak, BUNDLED_UI_STRINGS.es.speak);
assert.equal(bundledCalls, 0);
assert.equal((await bundledLoader('es')).history, BUNDLED_UI_STRINGS.es.history);
assert.equal(bundledCalls, 0);

// Partial catalog preserves bundled strings even when remote fetch fails.
let partialCalls = 0;
let partialOffline = true;
const partialFailures = [];
const partialLoader = createUiStringLoader(
  async language => {
    partialCalls += 1;
    if (partialOffline) throw new Error('Offline');
    return { speak: 'Falar Remote', listen: 'Ouvir Remote' };
  },
  {
    bundledCatalogs: { pt: { speak: 'Falar Bundled' } },
    onFailure: (language, error) => partialFailures.push([language, error.message]),
  },
);
assert.equal(partialLoader.getSync('pt')?.speak, 'Falar Bundled');
const failedPt = await partialLoader('pt');
assert.equal(failedPt.speak, 'Falar Bundled');
assert.equal(failedPt.listen, ENGLISH_UI_STRINGS.listen);
assert.equal(partialLoader.isCached('pt'), false);
partialOffline = false;
const recoveredPt = await partialLoader('pt');
assert.equal(recoveredPt.speak, 'Falar Remote');
assert.equal(recoveredPt.listen, 'Ouvir Remote');
assert.equal(partialLoader.isCached('pt'), true);
assert.equal(partialCalls, 2);
assert.deepEqual(partialFailures, [['pt', 'Offline']]);

// Original backward-compatible function-second-arg signature.
let calls = 0;
let offline = false;
const failures = [];
const load = createUiStringLoader(async language => {
  calls++;
  if (offline) throw new Error('Offline');
  return language === 'es'
    ? { speak: ' Hablar ', listen: '', messageIn: 'Sin marcador', unknown: 'ignored' }
    : { speak: 'Parler' };
}, (language, error) => failures.push([language, error.message]));

assert.equal(await load('en'), ENGLISH_UI_STRINGS);
assert.equal(calls, 0);
const [first, second] = await Promise.all([load('es'), load('es')]);
assert.equal(first, second);
assert.equal(first.speak, 'Hablar');
assert.equal(first.listen, ENGLISH_UI_STRINGS.listen);
assert.equal(first.messageIn, ENGLISH_UI_STRINGS.messageIn);
assert.equal(first.unknown, undefined);
assert.equal(await load('es'), first);
assert.equal(calls, 1);
offline = true;
assert.equal(await load('fr'), ENGLISH_UI_STRINGS);
offline = false;
assert.equal((await load('fr')).speak, 'Parler');
assert.equal(calls, 3);
assert.deepEqual(failures, [['fr', 'Offline']]);
assert.equal(interpolateTemplate(first.messageIn, { language: 'Español' }), 'Type message in Español');

// 4. Source-contract assertions for all localized mobile screens and components.
const mobileFilesUsingUiStrings = [
  'mobile/src/components/AppShell.tsx',
  'mobile/src/chat/HistorySheet.tsx',
  'mobile/src/app/phrasebook.tsx',
  'mobile/src/chat/ChatView.tsx',
  'mobile/src/chat/SingleView.tsx',
  'mobile/src/chat/ConversationView.tsx',
];
for (const file of mobileFilesUsingUiStrings) {
  const source = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
  assert.match(source, /useUiStrings/, `${file} must call useUiStrings`);
}

const mobileFilesReceivingStringsProp = [
  'mobile/src/phrasebook/PhraseEditorModal.tsx',
  'mobile/src/phrasebook/PhraseCard.tsx',
  'mobile/src/chat/MessageCard.tsx',
  'mobile/src/chat/TranscriptCarousel.tsx',
  'mobile/src/components/LanguagePicker.tsx',
];
for (const file of mobileFilesReceivingStringsProp) {
  const source = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
  assert.match(source, /\bstrings\b/, `${file} must accept/use localized strings`);
}

for (const file of ['mobile/src/chat/SingleView.tsx', 'mobile/src/chat/ConversationView.tsx']) {
  const source = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
  assert.doesNotMatch(
    source,
    /newLabel\s*=\s*["']New Conversation["']/,
    `${file} must not hardcode newLabel="New Conversation"`,
  );
}

console.log('UI string loader, native names, bundled catalogs, and APK localization checks passed');
