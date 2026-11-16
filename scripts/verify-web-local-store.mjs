import assert from 'node:assert/strict';
import {
  createLocalStore,
  createMemoryStorageDriver,
  createIndexedDbDriver,
  cleanupUnreferencedAudio,
} from '../client/src/localStore.js';

console.log('Testing createLocalStore with memory driver...');

// In-memory prefs storage helper for tests
function createTestPrefsStorage() {
  const map = new Map();
  return {
    getItem(key) {
      return map.has(key) ? map.get(key) : null;
    },
    setItem(key, value) {
      map.set(key, String(value));
    },
    removeItem(key) {
      map.delete(key);
    },
  };
}

let testIdCounter = 0;
const testNewId = () => `test-id-${++testIdCounter}`;
let testCurrentTime = 1700000000000;
const testNow = () => ++testCurrentTime;

const store = createLocalStore({
  driver: createMemoryStorageDriver(),
  prefsStorage: createTestPrefsStorage(),
  newId: testNewId,
  now: testNow,
});

// 1. Preference roundtrip: setLanguagePair('en', 'es'), setTtsVoice('onyx'), setActiveConversationId(conv.id) survive getPreferences()
{
  const initialPrefs = store.getPreferences();
  assert.equal(initialPrefs.activeConversationId, null);
  assert.equal(initialPrefs.myLanguageCode, 'en');
  assert.equal(initialPrefs.theirLanguageCode, 'es');
  assert.equal(initialPrefs.ttsVoice, 'marin');

  await store.setLanguagePair('es', 'fr');
  await store.setTtsVoice('onyx');
  await store.setActiveConversationId('conv-pref-1');

  const updatedPrefs = store.getPreferences();
  assert.equal(updatedPrefs.activeConversationId, 'conv-pref-1');
  assert.equal(updatedPrefs.myLanguageCode, 'es');
  assert.equal(updatedPrefs.theirLanguageCode, 'fr');
  assert.equal(updatedPrefs.ttsVoice, 'onyx');

  // Reset for subsequent tests
  await store.setLanguagePair('en', 'es');
  await store.setActiveConversationId(null);
  console.log('✓ 1. Preference roundtrip passed');
}

// 2. Conversation auto-titling & mode tags:
// creating 'New chat' (originMode: 'chat') and saving a ready message updates title to the trimmed first 80 chars;
// creating 'Single session' (originMode: 'single') retains originMode and updates title on first completed voice transcript.
{
  // Test chat mode auto-titling
  const chatConv = await store.createConversation({
    originMode: 'chat',
    myLanguageCode: 'en',
    theirLanguageCode: 'es',
  });
  assert.equal(chatConv.title, 'New chat');
  assert.equal(chatConv.originMode, 'chat');

  // Update conversation languages
  const langUpdated = await store.updateConversationLanguages(chatConv.id, 'en', 'de');
  assert.equal(langUpdated.theirLanguageCode, 'de');
  assert.equal((await store.getConversation(chatConv.id)).theirLanguageCode, 'de');

  // Saving a pending draft should not auto-title yet
  await store.saveMessage({
    id: 'msg-chat-pending',
    conversationId: chatConv.id,
    speaker: 'self',
    originMode: 'chat',
    kind: 'text',
    status: 'pending',
    originalText: 'Hello there, how are you today?',
  });
  let fetchedConv = await store.getConversation(chatConv.id);
  assert.equal(fetchedConv.title, 'New chat');

  // Saving a ready message updates title to trimmed first 80 chars
  const longText = 'Good morning my friend, this is a very long message designed to test the 80 character boundary limit of auto-titling.';
  await store.saveMessage({
    id: 'msg-chat-ready',
    conversationId: chatConv.id,
    speaker: 'self',
    originMode: 'chat',
    kind: 'text',
    status: 'ready',
    originalText: longText,
    translatedText: 'Buenos días amigo...',
  });
  fetchedConv = await store.getConversation(chatConv.id);
  assert.equal(fetchedConv.title, longText.slice(0, 80));

  // Second ready message does not overwrite the title
  await store.saveMessage({
    id: 'msg-chat-2',
    conversationId: chatConv.id,
    speaker: 'self',
    originMode: 'chat',
    kind: 'text',
    status: 'ready',
    originalText: 'A different subsequent message.',
    translatedText: 'Otro mensaje posterior.',
  });
  fetchedConv = await store.getConversation(chatConv.id);
  assert.equal(fetchedConv.title, longText.slice(0, 80));

  // Test single session mode auto-titling from transcript
  const singleConv = await store.createConversation({
    originMode: 'single',
    myLanguageCode: 'en',
    theirLanguageCode: 'es',
  });
  assert.equal(singleConv.title, 'Single session');
  assert.equal(singleConv.originMode, 'single');

  await store.saveMessage({
    id: 'msg-single-ready',
    conversationId: singleConv.id,
    speaker: 'self',
    originMode: 'single',
    kind: 'voice',
    status: 'ready',
    transcript: 'Voice transcript from single speaker mode for title check.',
    originalText: 'Voice transcript from single speaker mode for title check.',
    translatedText: 'Transcripción de voz...',
  });
  const fetchedSingle = await store.getConversation(singleConv.id);
  assert.equal(fetchedSingle.originMode, 'single');
  assert.equal(fetchedSingle.title, 'Voice transcript from single speaker mode for title check.');

  console.log('✓ 2. Conversation auto-titling & mode tags passed');
}

// 3. Retry deduplication: saving a 'error' message with id: 'msg-1' and then re-saving 'ready' with the same id: 'msg-1' produces 1 message in listMessages(conv.id), not 2.
{
  const testConv = await store.createConversation({
    originMode: 'chat',
    myLanguageCode: 'en',
    theirLanguageCode: 'es',
  });

  await store.saveMessage({
    id: 'msg-retry-1',
    conversationId: testConv.id,
    speaker: 'self',
    kind: 'text',
    status: 'error',
    originalText: 'Failed message to retry',
    errorMessage: 'Network timeout',
  });

  let messages = await store.listMessages(testConv.id);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].status, 'error');
  assert.equal(messages[0].errorMessage, 'Network timeout');

  // Retry with same id, updated to ready
  await store.saveMessage({
    id: 'msg-retry-1',
    conversationId: testConv.id,
    speaker: 'self',
    kind: 'text',
    status: 'ready',
    originalText: 'Failed message to retry',
    translatedText: 'Mensaje fallido para reintentar',
    errorMessage: null,
  });

  messages = await store.listMessages(testConv.id);
  assert.equal(messages.length, 1, 'Expected exactly 1 message after retry upsert');
  assert.equal(messages[0].id, 'msg-retry-1');
  assert.equal(messages[0].status, 'ready');
  assert.equal(messages[0].translatedText, 'Mensaje fallido para reintentar');
  assert.equal(messages[0].errorMessage, null);

  console.log('✓ 3. Retry deduplication passed');
}

// 4. Search & reference-safe deletion (Review Focus #1):
// save a ready voice message with sourceAudioId into Phrasebook (savePhrasebookFromMessage),
// verify listConversations('Buenos') matches message text,
// then deleteConversation(conv.id) — assert conversation and messages are gone,
// Phrasebook entry still exists with its text & sourceAudioId blob intact in getAudioAsset(sourceAudioId),
// while unreferenced audioAssets from non-saved messages in that deleted conversation are removed.
{
  const searchConv = await store.createConversation({
    title: 'Chat with Friend',
    originMode: 'chat',
    myLanguageCode: 'en',
    theirLanguageCode: 'es',
  });

  // Create two audio assets:
  // audioSavedMsg: referenced by msg1 which will be saved to Phrasebook
  // audioUnsavedMsg: referenced by msg2 which will NOT be saved to Phrasebook
  const blobSaved = new Blob(['audio-saved-bytes'], { type: 'audio/webm' });
  const blobUnsaved = new Blob(['audio-unsaved-bytes'], { type: 'audio/webm' });

  const audioSavedId = await store.saveAudioAsset(blobSaved);
  const audioUnsavedId = await store.saveAudioAsset(blobUnsaved);

  assert.ok(audioSavedId);
  assert.ok(audioUnsavedId);
  assert.ok(await store.getAudioAsset(audioSavedId));
  assert.ok(await store.getAudioAsset(audioUnsavedId));

  // Save msg1 with sourceAudioId
  const msg1 = await store.saveMessage({
    id: 'msg-saved-phrase',
    conversationId: searchConv.id,
    speaker: 'them',
    kind: 'voice',
    status: 'ready',
    sourceLanguageCode: 'es',
    targetLanguageCode: 'en',
    originalText: 'Buenos días amigo mío',
    translatedText: 'Good morning my friend',
    sourceAudioId: audioSavedId,
  });

  // Save msg2 with unreferenced audio
  await store.saveMessage({
    id: 'msg-unsaved-phrase',
    conversationId: searchConv.id,
    speaker: 'self',
    kind: 'voice',
    status: 'ready',
    sourceLanguageCode: 'en',
    targetLanguageCode: 'es',
    originalText: 'Unsaved note text',
    translatedText: 'Texto no guardado',
    sourceAudioId: audioUnsavedId,
  });

  // Test search: listConversations('Buenos') should find searchConv via message text
  const matchedConvs = await store.listConversations('Buenos');
  assert.ok(matchedConvs.some(c => c.id === searchConv.id), 'listConversations("Buenos") should match message text');

  // Verify non-matching query returns empty or doesn’t include searchConv
  const nonMatched = await store.listConversations('NonExistentQueryXYZ');
  assert.ok(!nonMatched.some(c => c.id === searchConv.id));

  // Save msg1 into Phrasebook
  const phraseResult = await store.savePhrasebookFromMessage({
    id: msg1.id,
    sourceMessageId: msg1.id,
    sourceLanguageCode: msg1.sourceLanguageCode,
    targetLanguageCode: msg1.targetLanguageCode,
    originalText: msg1.originalText,
    translatedText: msg1.translatedText,
    sourceAudioId: msg1.sourceAudioId,
    kind: 'voice',
  });
  assert.equal(phraseResult.created, true);
  const savedPhraseEntryId = phraseResult.entry.id;

  // Deduplication check: re-saving same message should return created: false
  const dedupResult = await store.savePhrasebookFromMessage({
    id: msg1.id,
    sourceMessageId: msg1.id,
    sourceLanguageCode: msg1.sourceLanguageCode,
    targetLanguageCode: msg1.targetLanguageCode,
    originalText: msg1.originalText,
    translatedText: msg1.translatedText,
  });
  assert.equal(dedupResult.created, false);
  assert.equal(dedupResult.entry.id, savedPhraseEntryId);

  // Verify saved source message IDs tracking
  const savedSourceIds = await store.listSavedSourceMessageIds();
  assert.ok(savedSourceIds.has(msg1.id), 'listSavedSourceMessageIds should include msg1.id');

  // Now delete the conversation
  const deleteResult = await store.deleteConversation(searchConv.id);
  assert.equal(deleteResult.deleted, true);
  assert.equal(deleteResult.orphanedAudioCount, 1, 'Expected 1 orphaned audio asset to be cleaned up');

  // Assert conversation and its messages are gone
  assert.equal(await store.getConversation(searchConv.id), null);
  const remainingMsgs = await store.listMessages(searchConv.id);
  assert.equal(remainingMsgs.length, 0);

  // Deleting non-existent conversation returns deleted: false
  const doubleDelete = await store.deleteConversation(searchConv.id);
  assert.equal(doubleDelete.deleted, false);
  assert.equal(doubleDelete.orphanedAudioCount, 0);

  // Assert Phrasebook entry still exists with sourceAudioId blob intact
  const collectionDetail = await store.getPhrasebookCollection(phraseResult.entry.targetLanguageCode);
  assert.ok(collectionDetail);
  const phraseEntry = collectionDetail.entries.find(e => e.id === savedPhraseEntryId);
  assert.ok(phraseEntry, 'Phrasebook entry should still exist');
  assert.equal(phraseEntry.phraseText, 'Good morning my friend'); // target language phrase
  assert.equal(phraseEntry.sourceAudioId, audioSavedId);

  const retainedAsset = await store.getAudioAsset(audioSavedId);
  assert.ok(retainedAsset, 'Referenced audio asset should remain in audioAssets');
  assert.equal(await retainedAsset.blob.text(), 'audio-saved-bytes');

  // Assert unreferenced audio asset was removed
  const orphanedAsset = await store.getAudioAsset(audioUnsavedId);
  assert.equal(orphanedAsset, null, 'Unreferenced audio asset should have been deleted');

  console.log('✓ 4. Search & reference-safe deletion passed');
}

// 5. Per-voice TTS cache isolation (Review Focus #2):
// putCachedTtsAudio('message:m1:translated:marin', blobA) and
// putCachedTtsAudio('message:m1:translated:onyx', blobB) do not overwrite each other;
// getCachedTtsAudio('message:m1:translated:onyx') returns blobB.
{
  const blobA = new Blob(['tts-marin-speech-audio'], { type: 'audio/wav' });
  const blobB = new Blob(['tts-onyx-speech-audio'], { type: 'audio/wav' });

  const keyMarin = 'message:m1:translated:marin';
  const keyOnyx = 'message:m1:translated:onyx';

  await store.putCachedTtsAudio(keyMarin, blobA);
  await store.putCachedTtsAudio(keyOnyx, blobB);

  const fetchedMarin = await store.getCachedTtsAudio(keyMarin);
  const fetchedOnyx = await store.getCachedTtsAudio(keyOnyx);

  assert.ok(fetchedMarin, 'Marin cached audio should exist');
  assert.ok(fetchedOnyx, 'Onyx cached audio should exist');

  assert.equal(await fetchedMarin.text(), 'tts-marin-speech-audio');
  assert.equal(await fetchedOnyx.text(), 'tts-onyx-speech-audio');

  const fetchedNonExistent = await store.getCachedTtsAudio('message:m1:translated:other');
  assert.equal(fetchedNonExistent, null);

  console.log('✓ 5. Per-voice TTS cache isolation passed');
}

// 6. Optional meaningText + edit & collection re-homing (Review Focus #4):
// createPhrasebookEntry({ targetLanguageCode: 'es', sourceLanguageCode: 'en', phraseText: 'Hola', meaningText: '' }, { allowOptionalMeaning: true }) succeeds,
// updatePhrasebookEntry(id, { targetLanguageCode: 'fr', sourceLanguageCode: 'en', phraseText: 'Salut', meaningText: 'Hi' }) moves the card from 'es' collection to 'fr' collection and updates counts,
// and deletePhrasebookEntry(id) cleans up unreferenced audio.
{
  // Test creation with optional meaningText = ''
  const createdCard = await store.createPhrasebookEntry(
    {
      targetLanguageCode: 'es',
      sourceLanguageCode: 'en',
      phraseText: 'Hola',
      meaningText: '',
    },
    { allowOptionalMeaning: true },
  );
  assert.equal(createdCard.created, true);
  assert.equal(createdCard.entry.phraseText, 'Hola');
  assert.equal(createdCard.entry.meaningText, '');
  assert.equal(createdCard.entry.targetLanguageCode, 'es');

  // Verify allowOptionalMeaning = false throws when meaningText is missing
  await assert.rejects(async () => {
    await store.createPhrasebookEntry(
      {
        targetLanguageCode: 'es',
        sourceLanguageCode: 'en',
        phraseText: 'Hola',
        meaningText: '',
      },
      { allowOptionalMeaning: false },
    );
  }, /Meaning is required/);

  // Verify missing phraseText throws
  await assert.rejects(async () => {
    await store.createPhrasebookEntry({
      targetLanguageCode: 'es',
      phraseText: '   ',
    });
  }, /Phrase text is required/);

  // Verify 'es' collection count is at least 1
  let esCollection = await store.getPhrasebookCollection('es');
  assert.ok(esCollection);
  assert.ok(esCollection.totalCount >= 1);
  assert.ok(esCollection.entries.some(e => e.id === createdCard.entry.id));

  // Attach a private audio asset to this phrasebook card to test cleanup on delete
  const phraseAudioBlob = new Blob(['phrase-custom-audio'], { type: 'audio/webm' });
  const phraseAudioId = await store.saveAudioAsset(phraseAudioBlob);
  await store.updatePhrasebookEntry(createdCard.entry.id, {
    sourceAudioId: phraseAudioId,
  });

  // Verify update / re-homing to 'fr'
  const updateResult = await store.updatePhrasebookEntry(createdCard.entry.id, {
    targetLanguageCode: 'fr',
    sourceLanguageCode: 'en',
    phraseText: 'Salut',
    meaningText: 'Hi',
  });

  assert.equal(updateResult.entry.targetLanguageCode, 'fr');
  assert.equal(updateResult.entry.phraseText, 'Salut');
  assert.equal(updateResult.entry.meaningText, 'Hi');
  assert.equal(updateResult.entry.sourceAudioId, phraseAudioId);

  // 'es' collection should no longer contain this card
  esCollection = await store.getPhrasebookCollection('es');
  if (esCollection) {
    assert.ok(!esCollection.entries.some(e => e.id === createdCard.entry.id));
  }

  // 'fr' collection should now contain this card
  const frCollection = await store.getPhrasebookCollection('fr');
  assert.ok(frCollection);
  assert.ok(frCollection.entries.some(e => e.id === createdCard.entry.id));

  // Test collection list sorting and searching
  const collections = await store.listPhrasebookCollections();
  // Ensure alphabetical ordering by English language name
  for (let i = 1; i < collections.length; i++) {
    const prevName = collections[i - 1].languageName;
    const currName = collections[i].languageName;
    assert.ok(prevName.localeCompare(currName) <= 0, `Collections should be sorted alphabetically: ${prevName} vs ${currName}`);
  }

  // Search phrasebook collection by query
  const searchResults = await store.listPhrasebookCollections('Salut');
  assert.ok(searchResults.some(c => c.languageCode === 'fr'));

  // Test deletePhrasebookEntry cleans up unreferenced phraseAudioId
  assert.ok(await store.getAudioAsset(phraseAudioId));
  const deletePhraseResult = await store.deletePhrasebookEntry(createdCard.entry.id);
  assert.equal(deletePhraseResult.deleted, true);

  // Card is gone from collection
  const updatedFrCollection = await store.getPhrasebookCollection('fr');
  assert.ok(!updatedFrCollection || !updatedFrCollection.entries.some(e => e.id === createdCard.entry.id));

  // Audio asset should be cleaned up because it was only referenced by that card
  const cleanedAudio = await store.getAudioAsset(phraseAudioId);
  assert.equal(cleanedAudio, null, 'Unreferenced phrase audio asset should be cleaned up');

  // Deleting non-existent entry returns deleted: false
  const nonExistentDelete = await store.deletePhrasebookEntry('non-existent-id');
  assert.equal(nonExistentDelete.deleted, false);

  console.log('✓ 6. Optional meaningText + edit & collection re-homing passed');
}

// 7. Memory storage driver primitives verification
{
  const driver = createMemoryStorageDriver();
  await driver.put('messages', { id: 'm1', conversationId: 'c1', text: 'hi' });
  await driver.put('messages', { id: 'm2', conversationId: 'c1', text: 'there' });
  await driver.put('messages', { id: 'm3', conversationId: 'c2', text: 'other' });

  const c1Messages = await driver.getByIndex('messages', 'conversationId', 'c1');
  assert.equal(c1Messages.length, 2);
  assert.equal((await driver.getAll('messages')).length, 3);

  await driver.delete('messages', 'm2');
  assert.equal(await driver.get('messages', 'm2'), null);
  assert.equal((await driver.getAll('messages')).length, 2);

  await driver.clear('messages');
  assert.equal((await driver.getAll('messages')).length, 0);

  console.log('✓ 7. Memory storage driver primitives passed');
}

// 8. Verify Node environment safety and default factory without crashing
{
  assert.equal(typeof createIndexedDbDriver, 'function');
  assert.equal(typeof createMemoryStorageDriver, 'function');
  const defaultStore = createLocalStore();
  assert.ok(defaultStore);
  assert.equal(typeof defaultStore.getPreferences, 'function');
  assert.equal(typeof defaultStore.listConversations, 'function');
  console.log('✓ 8. Driver factories and Node import safety passed');
}

console.log('All web local store tests passed successfully!');
