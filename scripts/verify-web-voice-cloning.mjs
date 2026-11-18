import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  createLocalStore,
  createMemoryPrefsStorage,
  createMemoryStorageDriver,
  MIN_VOICE_CLONE_DURATION_MS,
} from "../client/src/localStore.js";

// 1. Constant verification
assert.equal(MIN_VOICE_CLONE_DURATION_MS, 10_000);

function makeBlob(text, type = "audio/webm") {
  return new Blob([text], { type });
}

// 2. Single 10s+ sample vs multi-sample merge vs <10s insufficient (Review Focus #1, #2, #3)
{
  let nowValue = 1_000;
  let idSeq = 0;
  const store = createLocalStore({
    driver: createMemoryStorageDriver(),
    prefsStorage: createMemoryPrefsStorage(),
    now: () => (nowValue += 10),
    newId: () => `id_${++idSeq}`,
  });

  const conv1 = await store.createConversation({
    originMode: "chat",
    myLanguageCode: "en",
    theirLanguageCode: "es",
  });
  const conv2 = await store.createConversation({
    originMode: "conversation",
    myLanguageCode: "en",
    theirLanguageCode: "es",
  });

  // A) < 10s single audio sample for 'en' in conv1 (8.5s) -> not eligible
  const audioEnShort = await store.saveAudioAsset(makeBlob("en-8.5s"), undefined, {
    durationMs: 8_500,
  });
  await store.saveMessage({
    id: "m_en_1",
    conversationId: conv1.id,
    speaker: "self",
    kind: "voice",
    status: "ready",
    originalText: "Hello grandma",
    translatedText: "Hola abuela",
    sourceLanguageCode: "en",
    targetLanguageCode: "es",
    sourceAudioId: audioEnShort,
  });

  const checkUnder10 = await store.collectEligibleCloneAudioSamples(conv1.id, "en");
  assert.equal(checkUnder10.eligible, false);
  assert.equal(checkUnder10.mode, "insufficient");
  assert.equal(checkUnder10.totalDurationMs, 8_500);
  assert.equal(checkUnder10.samples.length, 0);

  // B) A single >= 10s audio sample for 'en' in conv1 (10.6s) -> eligible via 'single' mode
  const audioEnSingle10 = await store.saveAudioAsset(makeBlob("en-10.6s"), undefined, {
    durationMs: 10_600,
  });
  await store.saveMessage({
    id: "m_en_2",
    conversationId: conv1.id,
    speaker: "self",
    kind: "voice",
    status: "ready",
    originalText: "This is a single ten second voice recording",
    translatedText: "Esta es una grabacion de diez segundos",
    sourceLanguageCode: "en",
    targetLanguageCode: "es",
    sourceAudioId: audioEnSingle10,
  });

  const checkSingle10 = await store.collectEligibleCloneAudioSamples(conv1.id, "en");
  assert.equal(checkSingle10.eligible, true);
  assert.equal(checkSingle10.mode, "single");
  assert.equal(checkSingle10.totalDurationMs, 10_600);
  assert.equal(checkSingle10.samples.length, 1);
  assert.equal(checkSingle10.samples[0].audioId, audioEnSingle10);

  // C) Meanwhile 'es' in conv1 has one 5.4s sample -> not eligible yet (Review Focus #2)
  const audioEs1 = await store.saveAudioAsset(makeBlob("es-5.4s"), undefined, {
    durationMs: 5_400,
  });
  await store.saveMessage({
    id: "m_es_1",
    conversationId: conv1.id,
    speaker: "partner",
    kind: "voice",
    status: "ready",
    originalText: "Hola nieto",
    translatedText: "Hello grandson",
    sourceLanguageCode: "es",
    targetLanguageCode: "en",
    sourceAudioId: audioEs1,
  });

  const checkEsPart1 = await store.collectEligibleCloneAudioSamples(conv1.id, "es");
  assert.equal(checkEsPart1.eligible, false);
  assert.equal(checkEsPart1.mode, "insufficient");
  assert.equal(checkEsPart1.totalDurationMs, 5_400);

  // D) Second 'es' sample (5.2s) in conv1 merges with first (5.4s + 5.2s = 10.6s >= 10s) -> eligible via 'merged' mode (Review Focus #3)
  const audioEs2 = await store.saveAudioAsset(makeBlob("es-5.2s"), undefined, {
    durationMs: 5_200,
  });
  await store.saveMessage({
    id: "m_es_2",
    conversationId: conv1.id,
    speaker: "partner",
    kind: "voice",
    status: "ready",
    originalText: "Que alegria escucharte hoy",
    translatedText: "So happy to hear you today",
    sourceLanguageCode: "es",
    targetLanguageCode: "en",
    sourceAudioId: audioEs2,
  });

  const checkEsMerged = await store.collectEligibleCloneAudioSamples(conv1.id, "es");
  assert.equal(checkEsMerged.eligible, true);
  assert.equal(checkEsMerged.mode, "merged");
  assert.equal(checkEsMerged.totalDurationMs, 10_600);
  assert.equal(checkEsMerged.samples.length, 2);
  assert.deepEqual(
    checkEsMerged.samples.map((s) => s.audioId),
    [audioEs1, audioEs2],
  );

  // E) conv2 has 0 samples for 'en' and 'es' -> chat isolation (Review Focus #3)
  const checkConv2En = await store.collectEligibleCloneAudioSamples(conv2.id, "en");
  assert.equal(checkConv2En.eligible, false);
  assert.equal(checkConv2En.totalDurationMs, 0);

  // F) Saving clones per language per chat & evicting default-voice TTS cache (Review Focus #2, #3, #5)
  await store.putCachedTtsAudio("message:m_en_1:translated:marin", makeBlob("cached-default-en", "audio/wav"));
  await store.putCachedTtsAudio("message:m_es_1:translated:marin", makeBlob("cached-default-es", "audio/wav"));
  assert.ok(await store.getCachedTtsAudio("message:m_en_1:translated:marin"));
  assert.ok(await store.getCachedTtsAudio("message:m_es_1:translated:marin"));

  // Reject saving a clone below 10s
  await assert.rejects(
    store.setChatVoiceClone(conv1.id, "en", {
      voiceId: "bad_short_clone",
      totalDurationMs: 9_000,
      mode: "single",
    }),
    /10 seconds/i,
  );

  // Save 'en' clone on conv1
  const savedEnClone = await store.setChatVoiceClone(conv1.id, "en", {
    voiceId: "fish_clone_en_conv1",
    totalDurationMs: 10_600,
    mode: "single",
  });
  assert.equal(savedEnClone.voiceId, "fish_clone_en_conv1");
  assert.equal(savedEnClone.languageCode, "en");

  // Default-voice TTS cache for 'en' messages in conv1 is evicted, while 'es' message cache remains untouched!
  assert.equal(await store.getCachedTtsAudio("message:m_en_1:translated:marin"), null);
  assert.ok(await store.getCachedTtsAudio("message:m_es_1:translated:marin"));

  // Per-language & per-chat lookup verification
  assert.equal((await store.getChatVoiceClone(conv1.id, "en"))?.voiceId, "fish_clone_en_conv1");
  assert.equal(await store.getChatVoiceClone(conv1.id, "es"), null);
  assert.equal(await store.getChatVoiceClone(conv2.id, "en"), null);

  // Save 'es' clone on conv1
  await store.setChatVoiceClone(conv1.id, "es", {
    voiceId: "fish_clone_es_conv1",
    totalDurationMs: 10_600,
    mode: "merged",
  });
  assert.equal((await store.getChatVoiceClone(conv1.id, "es"))?.voiceId, "fish_clone_es_conv1");
  assert.equal(await store.getCachedTtsAudio("message:m_es_1:translated:marin"), null);

  const conv1Clones = await store.getChatVoiceClones(conv1.id);
  assert.equal(conv1Clones.en.voiceId, "fish_clone_en_conv1");
  assert.equal(conv1Clones.es.voiceId, "fish_clone_es_conv1");
  assert.deepEqual(await store.getChatVoiceClones(conv2.id), {});

  // Deleting conv1 removes its voice clones
  await store.deleteConversation(conv1.id);
  assert.equal(await store.getChatVoiceClone(conv1.id, "en"), null);
  assert.equal(await store.getChatVoiceClone(conv1.id, "es"), null);
}

// 3. Source contract checks on client/src/chatApi.js, MessageBubble.jsx, useLiveConversationCapture.js, and StringPhoneApp.jsx
{
  const chatApiSource = readFileSync("client/src/chatApi.js", "utf8");
  assert.match(chatApiSource, /export async function requestChatVoiceClone\b/);
  assert.match(chatApiSource, /\/speech\/clone/);
  assert.match(chatApiSource, /clonedVoiceId/);

  const captureSource = readFileSync(
    "client/src/components/live/useLiveConversationCapture.js",
    "utf8",
  );
  assert.match(captureSource, /durationMs/);

  const bubbleSource = readFileSync(
    "client/src/components/chat/MessageBubble.jsx",
    "utf8",
  );
  assert.match(bubbleSource, /sourceLanguageCode:\s*message\.sourceLanguageCode/);

  const appSource = readFileSync("client/src/StringPhoneApp.jsx", "utf8");
  assert.match(appSource, /ensureChatLanguageVoiceClone/);
  assert.match(appSource, /requestChatVoiceClone/);
}

console.log("PASS Task 3: Web App per-chat, per-language 10s single/merged voice cloning and TTS cache eviction");
