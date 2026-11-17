import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  createLocalStore,
  createMemoryStorageDriver,
} from '../client/src/localStore.js';

const ROOT_DIR = resolve(import.meta.dirname, '..');

console.log('--- Testing Web Phrasebook Parity ---');

// ============================================================================
// 1. Pure Helper Unit Tests (client/src/components/learning/phrasebookHelpers.js)
// ============================================================================
const helpersPath = resolve(
  ROOT_DIR,
  'client/src/components/learning/phrasebookHelpers.js',
);

assert.ok(
  existsSync(helpersPath),
  'client/src/components/learning/phrasebookHelpers.js must exist',
);

const { validatePhrasebookEditorInput, getFlashcardBackDisplay } = await import(
  '../client/src/components/learning/phrasebookHelpers.js'
);

// 1.1 validatePhrasebookEditorInput
{
  // 1.1.1 Rejects empty or whitespace phraseText
  for (const emptyPhrase of ['', '   ', null, undefined]) {
    assert.throws(
      () =>
        validatePhrasebookEditorInput(
          { phraseText: emptyPhrase, meaningText: 'Hello' },
          { requireMeaning: false },
        ),
      (err) => /phrase/i.test(err?.message || ''),
      `Expected error about phrase for ${emptyPhrase}`,
    );
  }

  // 1.1.2 Allows empty meaningText when requireMeaning is false (guest mode)
  for (const emptyMeaning of ['', '   ', null, undefined]) {
    const result = validatePhrasebookEditorInput(
      {
        phraseText: '  Bonjour  ',
        meaningText: emptyMeaning,
        targetLanguageCode: ' FR ',
        sourceLanguageCode: ' EN ',
        phrasePronunciation: '  bɔ̃ʒuʁ  ',
        noteText: '  Friendly greeting  ',
      },
      { requireMeaning: false },
    );
    assert.equal(result.phraseText, 'Bonjour');
    assert.equal(result.meaningText, '');
    assert.equal(result.targetLanguageCode, 'fr');
    assert.equal(result.sourceLanguageCode, 'en');
    assert.equal(result.phrasePronunciation, 'bɔ̃ʒuʁ');
    assert.equal(result.meaningPronunciation, null);
    assert.equal(result.noteText, 'Friendly greeting');
  }

  // 1.1.3 Rejects empty meaningText when requireMeaning is true (signed-in Postgres mode)
  for (const emptyMeaning of ['', '   ', null, undefined]) {
    assert.throws(
      () =>
        validatePhrasebookEditorInput(
          { phraseText: 'Bonjour', meaningText: emptyMeaning },
          { requireMeaning: true },
        ),
      (err) => /meaning/i.test(err?.message || ''),
      `Expected error about meaning when requireMeaning is true for ${emptyMeaning}`,
    );
  }

  // 1.1.4 Normalizes all fields when non-empty
  const full = validatePhrasebookEditorInput(
    {
      phraseText: '  Guten Tag  ',
      phrasePronunciation: '  ɡuːtn̩ taːk  ',
      meaningText: '  Good day  ',
      meaningPronunciation: '  ɡʊd deɪ  ',
      noteText: '  Formal hello  ',
      targetLanguageCode: ' DE ',
      sourceLanguageCode: ' EN ',
    },
    { requireMeaning: true },
  );
  assert.equal(full.phraseText, 'Guten Tag');
  assert.equal(full.phrasePronunciation, 'ɡuːtn̩ taːk');
  assert.equal(full.meaningText, 'Good day');
  assert.equal(full.meaningPronunciation, 'ɡʊd deɪ');
  assert.equal(full.noteText, 'Formal hello');
  assert.equal(full.targetLanguageCode, 'de');
  assert.equal(full.sourceLanguageCode, 'en');

  // 1.1.5 Default fallback languages
  const minimal = validatePhrasebookEditorInput({ phraseText: 'Hola' });
  assert.equal(minimal.phraseText, 'Hola');
  assert.equal(minimal.meaningText, '');
  assert.equal(minimal.targetLanguageCode, 'es');
  assert.equal(minimal.sourceLanguageCode, 'en');
  assert.equal(minimal.phrasePronunciation, null);
  assert.equal(minimal.meaningPronunciation, null);
  assert.equal(minimal.noteText, '');

  console.log('✓ 1.1 validatePhrasebookEditorInput tests passed');
}

// 1.2 getFlashcardBackDisplay
{
  // When meaningText is empty
  const emptyMeaningEntry = {
    id: 'entry-1',
    phraseText: 'Konnichiwa',
    phrasePronunciation: 'kon-nee-chee-wah',
    meaningText: '   ',
    meaningPronunciation: null,
    noteText: 'Afternoon greeting',
  };
  const backEmpty = getFlashcardBackDisplay(emptyMeaningEntry);
  assert.equal(backEmpty.hasMeaning, false);
  assert.equal(backEmpty.meaningText, '');
  assert.equal(backEmpty.canPlayMeaningAudio, false);
  assert.equal(backEmpty.noteText, 'Afternoon greeting');
  assert.match(backEmpty.flipPrompt, /tap.*flip/i);

  // When meaningText is provided
  const withMeaningEntry = {
    id: 'entry-2',
    phraseText: 'Arigatou',
    phrasePronunciation: 'ah-ree-gah-toh',
    meaningText: 'Thank you',
    meaningPronunciation: 'thangk yoo',
    noteText: 'Polite expression',
  };
  const backMeaning = getFlashcardBackDisplay(withMeaningEntry);
  assert.equal(backMeaning.hasMeaning, true);
  assert.equal(backMeaning.meaningText, 'Thank you');
  assert.equal(backMeaning.meaningPronunciation, 'thangk yoo');
  assert.equal(backMeaning.canPlayMeaningAudio, true);
  assert.equal(backMeaning.noteText, 'Polite expression');
  assert.match(backMeaning.flipPrompt, /tap.*flip/i);

  console.log('✓ 1.2 getFlashcardBackDisplay tests passed');
}

// ============================================================================
// 2. Integration / LocalStore Phrasebook CRUD Tests
// ============================================================================
{
  const store = createLocalStore(createMemoryStorageDriver());

  // 2.1 Create with optional meaning
  const created = await store.createPhrasebookEntry(
    {
      targetLanguageCode: 'es',
      sourceLanguageCode: 'en',
      phraseText: 'Por favor',
      phrasePronunciation: 'por fah-vor',
      meaningText: '',
      noteText: 'Please',
    },
    { allowOptionalMeaning: true },
  );
  assert.equal(created.created, true);
  assert.equal(created.entry.phraseText, 'Por favor');
  assert.equal(created.entry.meaningText, '');

  // 2.2 Verify collection retrieval
  const colEs = await store.getPhrasebookCollection('es');
  assert.ok(colEs);
  assert.equal(colEs.entryCount, 1);
  assert.equal(colEs.entries[0].id, created.entry.id);

  // 2.3 Update entry and re-home to French
  const updated = await store.updatePhrasebookEntry(
    created.entry.id,
    {
      targetLanguageCode: 'fr',
      phraseText: "S'il vous plaît",
      meaningText: 'Please',
      noteText: 'Polite in French',
    },
    { allowOptionalMeaning: true },
  );
  assert.equal(updated.entry.targetLanguageCode, 'fr');
  assert.equal(updated.entry.phraseText, "S'il vous plaît");
  assert.equal(updated.entry.meaningText, 'Please');

  // Verify 'es' is now empty/null and 'fr' has the entry
  const colEsAfter = await store.getPhrasebookCollection('es');
  assert.equal(colEsAfter, null);
  const colFr = await store.getPhrasebookCollection('fr');
  assert.ok(colFr);
  assert.equal(colFr.entryCount, 1);
  assert.equal(colFr.entries[0].id, created.entry.id);

  // 2.4 Cached TTS cleanup on delete
  await store.putCachedTtsAudio(`phrasebook:${created.entry.id}:translated:marin`, new Blob(['wav']));
  const cachedBefore = await store.getCachedTtsAudio(`phrasebook:${created.entry.id}:translated:marin`);
  assert.ok(cachedBefore);

  const deleted = await store.deletePhrasebookEntry(created.entry.id);
  assert.equal(deleted.deleted, true);

  const cachedAfter = await store.getCachedTtsAudio(`phrasebook:${created.entry.id}:translated:marin`);
  assert.equal(cachedAfter, null);

  const colFrAfter = await store.getPhrasebookCollection('fr');
  assert.equal(colFrAfter, null);

  console.log('✓ 2. LocalStore Phrasebook CRUD tests passed');
}

// ============================================================================
// 3. Structural and Wiring Checks
// ============================================================================

// 3.1 PhraseEditorModal.jsx exists and matches requirements
const phraseEditorModalPath = resolve(
  ROOT_DIR,
  'client/src/components/learning/PhraseEditorModal.jsx',
);
assert.ok(
  existsSync(phraseEditorModalPath),
  'client/src/components/learning/PhraseEditorModal.jsx must exist',
);

const phraseEditorModalSrc = readFileSync(phraseEditorModalPath, 'utf-8');

// Front-first field layout and labels
assert.match(
  phraseEditorModalSrc,
  /Phrase language/i,
  'PhraseEditorModal must include "Phrase language" label',
);
assert.match(
  phraseEditorModalSrc,
  /Meaning language/i,
  'PhraseEditorModal must include "Meaning language" label',
);
assert.match(
  phraseEditorModalSrc,
  /targetLanguageCode/,
  'PhraseEditorModal must bind targetLanguageCode',
);
assert.match(
  phraseEditorModalSrc,
  /sourceLanguageCode/,
  'PhraseEditorModal must bind sourceLanguageCode',
);
assert.match(
  phraseEditorModalSrc,
  /phraseText/,
  'PhraseEditorModal must bind phraseText',
);
assert.match(
  phraseEditorModalSrc,
  /phrasePronunciation/,
  'PhraseEditorModal must bind phrasePronunciation',
);
assert.match(
  phraseEditorModalSrc,
  /meaningText/,
  'PhraseEditorModal must bind meaningText',
);
assert.match(
  phraseEditorModalSrc,
  /meaningPronunciation/,
  'PhraseEditorModal must bind meaningPronunciation',
);
assert.match(
  phraseEditorModalSrc,
  /noteText/,
  'PhraseEditorModal must bind noteText',
);
assert.match(
  phraseEditorModalSrc,
  /getTextDirectionAttrs/,
  'PhraseEditorModal must apply getTextDirectionAttrs for RTL support',
);
assert.match(
  phraseEditorModalSrc,
  /backdrop-blur/,
  'PhraseEditorModal must include dark modal styling (backdrop-blur)',
);

console.log('✓ 3.1 PhraseEditorModal source checks passed');

// 3.2 CollectionScreen.jsx source checks
const collectionScreenPath = resolve(
  ROOT_DIR,
  'client/src/components/learning/CollectionScreen.jsx',
);
const collectionScreenSrc = readFileSync(collectionScreenPath, 'utf-8');

// Does NOT gate guests behind SignInCallout
assert.doesNotMatch(
  collectionScreenSrc,
  /if\s*\(\s*!isSignedIn\s*\)\s*\{\s*return\s*\(?\s*<SignInCallout/s,
  'CollectionScreen must NOT gate guests behind SignInCallout',
);

// Routes CRUD and queries to localStore when !isSignedIn
assert.match(
  collectionScreenSrc,
  /localStore/,
  'CollectionScreen must accept and use localStore prop',
);
assert.match(
  collectionScreenSrc,
  /listPhrasebookCollections|getPhrasebookCollection/,
  'CollectionScreen must query localStore for phrasebook collections in guest mode',
);
assert.match(
  collectionScreenSrc,
  /createPhrasebookEntry/,
  'CollectionScreen must call localStore.createPhrasebookEntry in guest mode',
);
assert.match(
  collectionScreenSrc,
  /updatePhrasebookEntry/,
  'CollectionScreen must call localStore.updatePhrasebookEntry in guest mode',
);
assert.match(
  collectionScreenSrc,
  /deletePhrasebookEntry/,
  'CollectionScreen must call localStore.deletePhrasebookEntry in guest mode',
);

// CollectionComposer includes Manual fields toggle and manual fields
assert.match(
  collectionScreenSrc,
  /Manual fields/i,
  'CollectionComposer must include "Manual fields" toggle',
);

// Card actions in CollectionDetailView include Edit (Edit card) button and delete confirmation
assert.match(
  collectionScreenSrc,
  /data-collection-card-actions/,
  'CollectionDetailView must contain [data-collection-card-actions]',
);
assert.match(
  collectionScreenSrc,
  /Edit card|Edit phrase|aria-label=["']Edit card["']/i,
  'Card actions must include Edit card action',
);
assert.match(
  collectionScreenSrc,
  /window\.confirm/,
  'Local card deletion must confirm before deleting (window.confirm)',
);

// PhraseEditorModal is integrated into CollectionScreen
assert.match(
  collectionScreenSrc,
  /PhraseEditorModal/,
  'CollectionScreen must import and render PhraseEditorModal',
);

// createBlobUrlTracker used for guest audio
assert.match(
  collectionScreenSrc,
  /createBlobUrlTracker/,
  'CollectionScreen must use createBlobUrlTracker for leak-free audio blob URLs',
);

// Empty meaning handling
assert.match(
  collectionScreenSrc,
  /getFlashcardBackDisplay/,
  'CollectionScreen must use getFlashcardBackDisplay to handle empty meaning gracefully',
);

console.log('✓ 3.2 CollectionScreen source checks passed');

// 3.3 LearningScreen.jsx & StringPhoneApp.jsx prop threading
const learningScreenPath = resolve(
  ROOT_DIR,
  'client/src/components/learning/LearningScreen.jsx',
);
const learningScreenSrc = readFileSync(learningScreenPath, 'utf-8');

assert.match(
  learningScreenSrc,
  /localStore/,
  'LearningScreen must accept localStore prop',
);
assert.match(
  learningScreenSrc,
  /onPhrasebookChanged/,
  'LearningScreen must accept onPhrasebookChanged prop',
);

const stringPhoneAppPath = resolve(
  ROOT_DIR,
  'client/src/StringPhoneApp.jsx',
);
const stringPhoneAppSrc = readFileSync(stringPhoneAppPath, 'utf-8');

assert.match(
  stringPhoneAppSrc,
  /<LearningScreen[\s\S]*?localStore=\{localStore\}/,
  'StringPhoneApp must pass localStore to LearningScreen',
);
assert.match(
  stringPhoneAppSrc,
  /<LearningScreen[\s\S]*?onPhrasebookChanged=/,
  'StringPhoneApp must pass onPhrasebookChanged to LearningScreen',
);

console.log('✓ 3.3 Prop threading checks passed');

console.log('\nAll Web Phrasebook Parity verification checks passed successfully!');
