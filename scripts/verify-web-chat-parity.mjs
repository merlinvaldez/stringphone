import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  getCarouselMessages,
  getTranscriptCardControlFlags,
  formatHistoryRowMeta,
  getTextDirectionAttrs,
  createBlobUrlTracker,
} from '../client/src/chatParityHelpers.js';
import {
  createLocalStore,
  createMemoryStorageDriver,
} from '../client/src/localStore.js';

const ROOT_DIR = resolve(import.meta.dirname, '..');

// ============================================================================
// 1. Pure Helper Unit Tests (client/src/chatParityHelpers.js)
// ============================================================================

// 1.1 getCarouselMessages
{
  const messages = [
    {
      id: 'm-chat-text-1',
      kind: 'text',
      originMode: 'chat',
      status: 'ready',
      originalText: 'Hello from typed chat',
      translatedText: 'Hola desde el chat escrito',
      createdAt: 1000,
    },
    {
      id: 'm-single-voice-1',
      kind: 'voice',
      originMode: 'single',
      status: 'ready',
      originalText: 'How are you?',
      translatedText: '¿Cómo estás?',
      createdAt: 2000,
    },
    {
      id: 'm-conv-voice-1',
      kind: 'voice',
      originMode: 'conversation',
      status: 'ready',
      originalText: 'Very well, thank you',
      translatedText: 'Muy bien, gracias',
      createdAt: 3000,
    },
  ];

  const liveDrafts = [
    {
      utteranceId: 'draft-single-1',
      id: 'draft-single-1',
      originMode: 'single',
      transcript: 'I am speaking right now...',
      translatedText: 'Estoy hablando ahora...',
      createdAt: 4000,
      status: 'translating',
    },
    {
      utteranceId: 'draft-conv-1',
      id: 'draft-conv-1',
      originMode: 'conversation',
      transcript: 'Partner is talking...',
      translatedText: 'El compañero está hablando...',
      createdAt: 2500,
      status: 'transcribing',
    },
  ];

  // For originMode 'single': must include all 3 messages (including typed chat text) + draft-single-1, excluding draft-conv-1
  const singleCarousel = getCarouselMessages(messages, liveDrafts, 'single');
  assert.equal(singleCarousel.length, 4, 'Single carousel must include all non-draft messages + matching single draft');
  assert.ok(
    singleCarousel.some((m) => m.id === 'm-chat-text-1'),
    'Single carousel must include typed chat text messages (Review Focus #4)',
  );
  assert.ok(
    singleCarousel.some((m) => m.id === 'draft-single-1'),
    'Single carousel must include single live draft',
  );
  assert.ok(
    !singleCarousel.some((m) => m.id === 'draft-conv-1'),
    'Single carousel must NOT include conversation live draft',
  );

  // Must be sorted chronologically by createdAt
  for (let i = 1; i < singleCarousel.length; i++) {
    const prevTime = new Date(singleCarousel[i - 1].createdAt).getTime();
    const currTime = new Date(singleCarousel[i].createdAt).getTime();
    assert.ok(prevTime <= currTime, 'Carousel messages must be sorted chronologically');
  }

  // For originMode 'conversation': includes all 3 messages + draft-conv-1, excluding draft-single-1
  const convCarousel = getCarouselMessages(messages, liveDrafts, 'conversation');
  assert.equal(convCarousel.length, 4, 'Conversation carousel must include all messages + matching conv draft');
  assert.ok(
    convCarousel.some((m) => m.id === 'draft-conv-1'),
    'Conversation carousel must include conversation live draft',
  );
  assert.ok(
    !convCarousel.some((m) => m.id === 'draft-single-1'),
    'Conversation carousel must NOT include single live draft',
  );

  // Does not duplicate if draft is already in messages by id or isDraft
  const duplicateDraftMessages = [
    ...messages,
    { id: 'draft-single-1', isDraft: true, createdAt: 4000 },
  ];
  const dedupedCarousel = getCarouselMessages(duplicateDraftMessages, liveDrafts, 'single');
  assert.equal(dedupedCarousel.length, 4, 'Must not duplicate draft messages');
  console.log('✓ 1.1 getCarouselMessages passed');
}

// 1.2 getTranscriptCardControlFlags
{
  // Voice message ready with both texts
  const voiceReady = {
    id: 'v1',
    kind: 'voice',
    status: 'ready',
    audioUrl: 'blob:voice-audio',
    originalText: 'Hello',
    translatedText: 'Hola',
  };
  const voiceFlags = getTranscriptCardControlFlags(voiceReady, 'both', true);
  assert.equal(voiceFlags.showSourcePlayer, true, 'Voice message ready with audio must show source player');
  assert.equal(voiceFlags.showTranslationPlayer, true, 'Ready message with translatedText must show translation player');
  assert.equal(voiceFlags.canSaveToPhrasebook, true, 'Ready message with both texts and save handler can save');

  // Text message: kind === 'text' omits source-voice player
  const textReady = {
    id: 't1',
    kind: 'text',
    status: 'ready',
    originalText: 'Typed text',
    translatedText: 'Texto escrito',
  };
  const textFlags = getTranscriptCardControlFlags(textReady, 'both', true);
  assert.equal(textFlags.showSourcePlayer, false, 'Typed text message must NOT show source-voice player');
  assert.equal(textFlags.showTranslationPlayer, true, 'Ready text message must show translated TTS player');
  assert.equal(textFlags.canSaveToPhrasebook, true, 'Ready text message can save to phrasebook');

  // Pending message: cannot play translated, cannot save
  const voicePending = {
    id: 'v-pend',
    kind: 'voice',
    status: 'pending',
    originalText: 'Recording...',
    translatedText: '',
  };
  const pendingFlags = getTranscriptCardControlFlags(voicePending, 'both', true);
  assert.equal(pendingFlags.showSourcePlayer, false, 'Pending voice message must NOT show source player');
  assert.equal(pendingFlags.showTranslationPlayer, false, 'Pending message must NOT show translation player');
  assert.equal(pendingFlags.canSaveToPhrasebook, false, 'Pending message cannot save to phrasebook');

  // Missing save handler: canSaveToPhrasebook must be false
  const noHandlerFlags = getTranscriptCardControlFlags(voiceReady, 'both', false);
  assert.equal(noHandlerFlags.canSaveToPhrasebook, false, 'Cannot save when hasSaveHandler is false');

  // playbackMode === 'original' excludes translation player; 'translated' excludes source player
  const origOnlyFlags = getTranscriptCardControlFlags(voiceReady, 'original', true);
  assert.equal(origOnlyFlags.showSourcePlayer, true);
  assert.equal(origOnlyFlags.showTranslationPlayer, false);

  const transOnlyFlags = getTranscriptCardControlFlags(voiceReady, 'translated', true);
  assert.equal(transOnlyFlags.showSourcePlayer, false);
  assert.equal(transOnlyFlags.showTranslationPlayer, true);

  console.log('✓ 1.2 getTranscriptCardControlFlags passed');
}

// 1.3 formatHistoryRowMeta
{
  const singleConv = {
    id: 'c1',
    originMode: 'single',
    createdAt: 1700000000000,
  };
  const metaSingle = formatHistoryRowMeta(singleConv);
  assert.ok(metaSingle.includes('· Single'), 'Must include "· Single" for originMode === single');

  const convConv = {
    id: 'c2',
    originMode: 'conversation',
    createdAt: 1700000000000,
  };
  const metaConv = formatHistoryRowMeta(convConv);
  assert.ok(metaConv.includes('· Conversation'), 'Must include "· Conversation" for originMode === conversation');

  const chatConv = {
    id: 'c3',
    originMode: 'chat',
    createdAt: 1700000000000,
  };
  const metaChat = formatHistoryRowMeta(chatConv);
  assert.ok(!metaChat.includes('· Single'), 'Must NOT include "· Single" for chat');
  assert.ok(!metaChat.includes('· Conversation'), 'Must NOT include "· Conversation" for chat');

  // Suffix without date
  const metaNoDate = formatHistoryRowMeta({ originMode: 'single' });
  assert.ok(metaNoDate.includes('· Single'), 'Must include suffix even without createdAt');

  console.log('✓ 1.3 formatHistoryRowMeta passed');
}

// 1.4 getTextDirectionAttrs
{
  // RTL languages: Arabic (ar), Hebrew (he), Persian/Farsi (fa), Urdu (ur)
  for (const code of ['ar', 'he', 'fa', 'ur']) {
    const attrs = getTextDirectionAttrs(code);
    assert.equal(attrs.dir, 'rtl', `${code} must have dir="rtl"`);
    assert.equal(attrs.className, 'text-right', `${code} must have className="text-right"`);
  }

  // LTR languages: English (en), Spanish (es), French (fr), Japanese (ja), Chinese (zh)
  for (const code of ['en', 'es', 'fr', 'ja', 'zh']) {
    const attrs = getTextDirectionAttrs(code);
    assert.equal(attrs.dir, 'ltr', `${code} must have dir="ltr"`);
    assert.equal(attrs.className, 'text-left', `${code} must have className="text-left"`);
  }
  console.log('✓ 1.4 getTextDirectionAttrs passed');
}

// 1.5 createBlobUrlTracker: creation, deduplication, revocation, and atomic re-creation after eviction
{
  let urlSeq = 0;
  const createdUrls = [];
  const revokedUrls = [];

  const tracker = createBlobUrlTracker({
    createObjectURL: (_blob) => {
      const url = `blob:test_${++urlSeq}`;
      createdUrls.push(url);
      return url;
    },
    revokeObjectURL: (url) => {
      revokedUrls.push(url);
    },
  });

  const dummyBlob = { size: 100, type: 'audio/webm' };

  // Initial creation
  const url1 = tracker.getOrCreate('audio-1', dummyBlob);
  assert.equal(url1, 'blob:test_1');
  assert.equal(tracker.has('audio-1'), true);
  assert.equal(tracker.size(), 1);

  // Deduplication on repeated call
  const url1Again = tracker.getOrCreate('audio-1', dummyBlob);
  assert.equal(url1Again, 'blob:test_1', 'Must return cached URL for existing key');
  assert.equal(createdUrls.length, 1);

  // Revocation by key evicts from cache
  tracker.revokeByKey('audio-1');
  assert.equal(tracker.has('audio-1'), false, 'Key must be evicted from cache upon revokeByKey');
  assert.equal(tracker.size(), 0);
  assert.deepEqual(revokedUrls, ['blob:test_1'], 'Underlying revokeObjectURL must be called');

  // Re-creation after revocation must create a FRESH non-revoked URL (Finding 2)
  const url1Fresh = tracker.getOrCreate('audio-1', dummyBlob);
  assert.equal(url1Fresh, 'blob:test_2', 'Must generate fresh URL after revocation/eviction');
  assert.equal(tracker.size(), 1);

  // Revocation by url
  tracker.revokeByUrl(url1Fresh);
  assert.equal(tracker.has('audio-1'), false, 'Key must be evicted upon revokeByUrl');
  assert.equal(tracker.size(), 0);
  assert.equal(revokedUrls.length, 2);

  // revokeAll clears everything
  tracker.getOrCreate('audio-2', dummyBlob);
  tracker.getOrCreate('audio-3', dummyBlob);
  assert.equal(tracker.size(), 2);
  tracker.revokeAll();
  assert.equal(tracker.size(), 0);

  console.log('✓ 1.5 createBlobUrlTracker unit tests passed');
}

// ============================================================================
// 2. LocalStore & Phrasebook Integration Runtime Tests
// ============================================================================

// 2.1 localStore.listPhrasebookCollections includes entryCount and lastAddedAt (Finding 3)
{
  const store = createLocalStore({
    driver: createMemoryStorageDriver(),
    prefsStorage: new Map(),
  });

  // Save two Spanish cards and one French card
  await store.savePhrasebookFromMessage({
    phraseText: 'Hola',
    meaningText: 'Hello',
    targetLanguageCode: 'es',
    sourceLanguageCode: 'en',
  });
  await store.savePhrasebookFromMessage({
    phraseText: 'Buenos días',
    meaningText: 'Good morning',
    targetLanguageCode: 'es',
    sourceLanguageCode: 'en',
  });
  await store.savePhrasebookFromMessage({
    phraseText: 'Bonjour',
    meaningText: 'Hello',
    targetLanguageCode: 'fr',
    sourceLanguageCode: 'en',
  });

  const collections = await store.listPhrasebookCollections();
  assert.equal(collections.length, 2);

  const esCol = collections.find((c) => c.languageCode === 'es');
  assert.ok(esCol, 'Spanish collection must exist');
  assert.equal(typeof esCol.entryCount, 'number', 'entryCount must be a number');
  assert.equal(esCol.entryCount, 2, 'Spanish entryCount must be 2');
  assert.equal(typeof esCol.lastAddedAt, 'number', 'lastAddedAt must be a number');
  assert.ok(esCol.lastAddedAt > 0, 'lastAddedAt must be a valid timestamp');
  assert.equal(esCol.count, 2, 'count backwards compatibility');
  assert.equal(esCol.totalCount, 2, 'totalCount backwards compatibility');

  const frCol = collections.find((c) => c.languageCode === 'fr');
  assert.ok(frCol, 'French collection must exist');
  assert.equal(frCol.entryCount, 1, 'French entryCount must be 1');

  // getPhrasebookCollection also returns entryCount and lastAddedAt
  const esDetail = await store.getPhrasebookCollection('es');
  assert.equal(esDetail.entryCount, 2);
  assert.ok(esDetail.lastAddedAt > 0);

  console.log('✓ 2.1 localStore.listPhrasebookCollections entryCount & lastAddedAt passed');
}

// 2.2 TranscriptCard / handleSaveMessageToCollection parameter normalization (Finding 1)
{
  const store = createLocalStore({
    driver: createMemoryStorageDriver(),
    prefsStorage: new Map(),
  });

  // Mock handleSaveMessageToCollection logic reflecting StringPhoneApp.jsx
  const handleSave = async (messageOrId, maybeMessage) => {
    const message =
      typeof messageOrId === 'object' && messageOrId !== null
        ? messageOrId
        : typeof maybeMessage === 'object' && maybeMessage !== null
          ? maybeMessage
          : null;
    if (!message || !message.id) return { saved: false };

    const result = await store.savePhrasebookFromMessage({
      ...message,
      sourceAudioBlob: null,
    });
    return { saved: Boolean(result?.entry?.id || result?.created) };
  };

  const sampleMessage = {
    id: 'msg-save-test-1',
    originalText: 'Thank you very much',
    translatedText: 'Muchas gracias',
    sourceLanguageCode: 'en',
    targetLanguageCode: 'es',
    status: 'ready',
    kind: 'text',
  };

  // Calling with (message) works cleanly
  const res1 = await handleSave(sampleMessage);
  assert.equal(res1.saved, true, 'Saving with (message) must succeed');

  // Calling with (message.id, message) also normalizes cleanly without error
  const sampleMessage2 = {
    id: 'msg-save-test-2',
    originalText: 'You are welcome',
    translatedText: 'De nada',
    sourceLanguageCode: 'en',
    targetLanguageCode: 'es',
    status: 'ready',
    kind: 'text',
  };
  const res2 = await handleSave(sampleMessage2.id, sampleMessage2);
  assert.equal(res2.saved, true, 'Saving with (message.id, message) must succeed defensively');

  console.log('✓ 2.2 handleSaveMessageToCollection parameter normalization passed');
}

// ============================================================================
// 3. Structural and Source Verification
// ============================================================================

const chatHistorySidebarSrc = readFileSync(
  resolve(ROOT_DIR, 'client/src/components/chat/ChatHistorySidebar.jsx'),
  'utf-8',
);
const messageBubbleSrc = readFileSync(
  resolve(ROOT_DIR, 'client/src/components/chat/MessageBubble.jsx'),
  'utf-8',
);
const chatScreenSrc = readFileSync(
  resolve(ROOT_DIR, 'client/src/components/chat/ChatScreen.jsx'),
  'utf-8',
);
const chatThreadSrc = readFileSync(
  resolve(ROOT_DIR, 'client/src/components/chat/ChatThread.jsx'),
  'utf-8',
);
const stringPhoneAppSrc = readFileSync(
  resolve(ROOT_DIR, 'client/src/StringPhoneApp.jsx'),
  'utf-8',
);

// 3.1 ChatHistorySidebar.jsx checks
{
  // No blocking signed-out Sign In callout blocking history actions
  assert.doesNotMatch(
    chatHistorySidebarSrc,
    /signedOutCallout/,
    'ChatHistorySidebar must remove signedOutCallout blocking drawer for guests',
  );

  // Search input with required placeholders
  assert.match(
    chatHistorySidebarSrc,
    /Search titles or messages/,
    'ChatHistorySidebar must include search placeholder "Search titles or messages"',
  );
  assert.match(
    chatHistorySidebarSrc,
    /Search phrasebook/,
    'ChatHistorySidebar must include search placeholder "Search phrasebook"',
  );

  // Tagging originMode on New Conversation
  assert.match(
    chatHistorySidebarSrc,
    /originMode/,
    'ChatHistorySidebar must support passing active originMode on New Conversation',
  );

  // Uses formatHistoryRowMeta for · Single / · Conversation tags
  assert.match(
    chatHistorySidebarSrc,
    /formatHistoryRowMeta/,
    'ChatHistorySidebar must import and use formatHistoryRowMeta',
  );

  // Delete local and signed-in conversations outright without a confirmation warning
  assert.doesNotMatch(
    chatHistorySidebarSrc,
    /confirm\s*\(/,
    'ChatHistorySidebar must delete conversations outright without a confirmation warning',
  );

  // Card count fallback uses entryCount / count / totalCount cleanly (Finding 3)
  assert.match(
    chatHistorySidebarSrc,
    /collection\.entryCount\s*\?\?\s*collection\.count/,
    'ChatHistorySidebar must check entryCount ?? count to avoid empty " cards" label',
  );

  console.log('✓ 3.1 ChatHistorySidebar.jsx structural checks passed');
}

// 3.2 MessageBubble.jsx checks
{
  assert.match(
    messageBubbleSrc,
    /getTextDirectionAttrs/,
    'MessageBubble.jsx must use getTextDirectionAttrs for RTL/LTR support',
  );
  assert.match(
    messageBubbleSrc,
    /Translating/,
    'MessageBubble.jsx must display "Translating" status text for parity with APK',
  );
  assert.match(
    messageBubbleSrc,
    /Needs retry/,
    'MessageBubble.jsx must display "Needs retry" status text for parity with APK',
  );
  assert.match(
    messageBubbleSrc,
    /isSaved/,
    'MessageBubble.jsx must accept an external isSaved prop for phrasebook sync',
  );
  assert.match(
    messageBubbleSrc,
    /message\.sender\s*\|\|\s*message\.speaker/,
    'MessageBubble.jsx must fall back to message.speaker when resolving sender',
  );
  assert.match(
    messageBubbleSrc,
    /showOriginalPronunciation\s*=\s*[\r\n\s]*!isLanguageOne/,
    'MessageBubble.jsx must base showOriginalPronunciation on !isLanguageOne',
  );
  assert.match(
    messageBubbleSrc,
    /showTranslatedPronunciation\s*=\s*[\r\n\s]*isLanguageOne/,
    'MessageBubble.jsx must base showTranslatedPronunciation on isLanguageOne',
  );

  console.log('✓ 3.2 MessageBubble.jsx structural checks passed');
}

// 3.3 SingleModeScreen checks in StringPhoneApp.jsx
{
  // Circular Invert languages button between language pickers
  assert.match(
    stringPhoneAppSrc,
    /aria-label=["']Invert languages["']/,
    'StringPhoneApp.jsx must render Invert languages button with aria-label="Invert languages"',
  );

  // Status labels matching APK
  assert.match(
    stringPhoneAppSrc,
    /CONNECTING\.\.\./,
    'SingleModeScreen must include CONNECTING... status label matching APK',
  );
  assert.match(
    stringPhoneAppSrc,
    /LISTENING/,
    'SingleModeScreen must include LISTENING status label matching APK',
  );
  assert.match(
    stringPhoneAppSrc,
    /TRANSLATING/,
    'SingleModeScreen must include TRANSLATING status label matching APK',
  );

  console.log('✓ 3.3 SingleModeScreen checks passed');
}

// 3.4 ConversationScreen checks in StringPhoneApp.jsx
{
  // Divider logo button with spin animation and aria-label
  assert.match(
    stringPhoneAppSrc,
    /<button[^>]*aria-label=["']Invert languages["'][^>]*>[\s\S]*?StringPhoneBrand/,
    'ConversationScreen divider must wrap StringPhoneBrand in an Invert languages button',
  );

  // 450ms cubic-bezier transition
  assert.match(
    stringPhoneAppSrc,
    /450ms/,
    'ConversationScreen divider spin must animate over 450ms',
  );

  // Outer landscape:-rotate-90 wrapper separated from inline transform (Finding 4)
  assert.match(
    stringPhoneAppSrc,
    /className=["']landscape:-rotate-90["']>\s*<div[^>]*style=\{\{\s*transform:/,
    'landscape:-rotate-90 must be on an outer wrapper element around the animated spin div',
  );

  // TranscriptCard with Save to Phrasebook bookmark and clean (message) invocation (Finding 1)
  assert.match(
    stringPhoneAppSrc,
    /onSaveToPhrasebook\?\.\(\s*message\s*\)/,
    'TranscriptCard must call onSaveToPhrasebook with message object as argument 0',
  );
  assert.match(
    stringPhoneAppSrc,
    /getTextDirectionAttrs/,
    'TranscriptCard in StringPhoneApp.jsx must use getTextDirectionAttrs',
  );

  console.log('✓ 3.4 ConversationScreen checks passed');
}

// 3.5 Guest localStore persistence, Blob URL cache, & Ruling 2 (leaveSharedRoom restoration)
{
  assert.match(
    stringPhoneAppSrc,
    /createLocalStore/,
    'StringPhoneApp.jsx must import and use createLocalStore for guest persistence',
  );
  assert.match(
    stringPhoneAppSrc,
    /createIndexedDbDriver/,
    'StringPhoneApp.jsx must import createIndexedDbDriver',
  );

  // Blob URL cache helper used in StringPhoneApp (Finding 2)
  assert.match(
    stringPhoneAppSrc,
    /createBlobUrlTracker/,
    'StringPhoneApp.jsx must import and use createBlobUrlTracker',
  );

  // Ruling 2: leaveSharedRoom restores active local conversation and messages for guests
  assert.match(
    stringPhoneAppSrc,
    /leaveSharedRoom[\s\S]*?listMessages/,
    'leaveSharedRoom must restore guest conversation and messages from localStore when leaving shared room',
  );

  console.log('✓ 3.5 Guest localStore persistence and leaveSharedRoom restoration passed');
}

console.log('All Web Chat Parity checks passed successfully.');
