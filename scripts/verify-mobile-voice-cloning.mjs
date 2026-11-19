import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import audioModule from "../mobile/src/storage/audio.ts";
import historyModule from "../mobile/src/storage/history.ts";
import deletionModule from "../mobile/src/storage/deletion.ts";
import migrations from "../mobile/src/storage/migrations.ts";
import transportModule from "../mobile/src/adapters/processingTransport.ts";
import speechModule from "../mobile/src/adapters/speech.ts";

const { createAudioStorage } = audioModule;
const { createHistoryRepository, MIN_VOICE_CLONE_DURATION_MS } = historyModule;
const { createDeletionService } = deletionModule;
const { migrateHistoryDatabase } = migrations;
const { createProcessingTransport } = transportModule;
const { createSpeechApi } = speechModule;

assert.equal(MIN_VOICE_CLONE_DURATION_MS, 10_000);

function createMockWavBytes(pcmLength = 2400, sampleRate = 24000) {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const buffer = new ArrayBuffer(44 + pcmLength);
  const view = new DataView(buffer);
  view.setUint8(0, 0x52); view.setUint8(1, 0x49); view.setUint8(2, 0x46); view.setUint8(3, 0x46);
  view.setUint32(4, 36 + pcmLength, true);
  view.setUint8(8, 0x57); view.setUint8(9, 0x41); view.setUint8(10, 0x56); view.setUint8(11, 0x45);
  view.setUint8(12, 0x66); view.setUint8(13, 0x6d); view.setUint8(14, 0x74); view.setUint8(15, 0x20);
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  view.setUint8(36, 0x64); view.setUint8(37, 0x61); view.setUint8(38, 0x74); view.setUint8(39, 0x61);
  view.setUint32(40, pcmLength, true);
  return new Uint8Array(buffer);
}

const directory = mkdtempSync(join(tmpdir(), "stringphone-mobile-clone-"));
const db = new DatabaseSync(join(directory, "history.db"));
db.exec("PRAGMA foreign_keys = ON");
const connection = {
  async execAsync(sql) { db.exec(sql); },
  async getFirstAsync(sql, ...args) { return db.prepare(sql).get(...args) ?? null; },
  async getAllAsync(sql, ...args) { return db.prepare(sql).all(...args); },
  async runAsync(sql, ...args) { return db.prepare(sql).run(...args); },
  async withExclusiveTransactionAsync(task) {
    db.exec("BEGIN IMMEDIATE");
    try { await task(connection); db.exec("COMMIT"); }
    catch (error) { db.exec("ROLLBACK"); throw error; }
  },
};

let audioSeq = 0;
let timeSeq = 1000;
const storedFiles = new Map();
const files = {
  async save(name, input) {
    const bytes = "bytes" in input ? input.bytes : new Uint8Array([1, 2, 3, 4]);
    storedFiles.set(name, bytes);
    return bytes.byteLength;
  },
  async stat(name) {
    return storedFiles.has(name)
      ? { uri: `file:///managed/${name}`, size: storedFiles.get(name).byteLength }
      : null;
  },
  async remove(name) {
    storedFiles.delete(name);
  },
  async list() {
    return [...storedFiles.keys()];
  },
  async readBytes(name) {
    return storedFiles.get(name) ?? null;
  },
};

try {
  await migrateHistoryDatabase(connection);
  const audio = createAudioStorage(connection, files, () => `audio_${++audioSeq}`);
  const history = createHistoryRepository(connection, () => (timeSeq += 10));
  const deletion = createDeletionService(connection, audio, async () => true);

  await history.createConversation({
    id: "conv_a",
    title: "Chat A",
    originMode: "conversation",
    myLanguage: "en",
    theirLanguage: "es",
  });
  await history.createConversation({
    id: "conv_b",
    title: "Chat B",
    originMode: "chat",
    myLanguage: "en",
    theirLanguage: "es",
  });

  // 1. Multi-utterance live capture deduplication & <10s rejection (Review Focus #1 & #4)
  // Two live utterances from the SAME 6000ms recording session (`cap123`) must count as 6000ms, NOT 12000ms!
  await history.saveReadyLiveMessage({
    id: "live_cap123_item1",
    requestId: "live_req_cap123_item1",
    conversationId: "conv_a",
    speaker: "me",
    originMode: "conversation",
    sourceLanguage: "en",
    targetLanguage: "es",
    originalText: "Hello grandma.",
    translatedText: "Hola abuela.",
  });
  await audio.save(
    { kind: "message", id: "live_cap123_item1", role: "source" },
    { bytes: new Uint8Array([10, 20, 30, 40]) },
    { format: "m4a", mimeType: "audio/mp4", durationMs: 6_000 },
  );

  await history.saveReadyLiveMessage({
    id: "live_cap123_item2",
    requestId: "live_req_cap123_item2",
    conversationId: "conv_a",
    speaker: "me",
    originMode: "conversation",
    sourceLanguage: "en",
    targetLanguage: "es",
    originalText: "How are you?",
    translatedText: "Como estas?",
  });
  await audio.save(
    { kind: "message", id: "live_cap123_item2", role: "source" },
    { bytes: new Uint8Array([10, 20, 30, 40]) },
    { format: "m4a", mimeType: "audio/mp4", durationMs: 6_000 },
  );

  const checkDeduplicated = await history.collectEligibleVoiceCloneSamples("conv_a", "en");
  assert.equal(checkDeduplicated.eligible, false);
  assert.equal(checkDeduplicated.mode, "insufficient");
  assert.equal(checkDeduplicated.totalDurationMs, 6_000);
  assert.equal(checkDeduplicated.samples.length, 0);

  // Cache a default-voice translated TTS on live_cap123_item1 before cloning unlocks
  await audio.save(
    { kind: "message", id: "live_cap123_item1", role: "translated" },
    { bytes: createMockWavBytes(1200) },
    { format: "wav", mimeType: "audio/wav", durationMs: 500 },
  );
  assert.ok(await audio.resolve({ kind: "message", id: "live_cap123_item1", role: "translated" }));

  // 2. Adding a second distinct 5000ms 'en' recording in conv_a merges to 6000 + 5000 = 11000ms >= 10000ms (Review Focus #3)
  await history.saveReadyLiveMessage({
    id: "live_cap456_item1",
    requestId: "live_req_cap456_item1",
    conversationId: "conv_a",
    speaker: "me",
    originMode: "conversation",
    sourceLanguage: "en",
    targetLanguage: "es",
    originalText: "I missed talking with you so much.",
    translatedText: "Extrane mucho hablar contigo.",
  });
  await audio.save(
    { kind: "message", id: "live_cap456_item1", role: "source" },
    { bytes: new Uint8Array([50, 60, 70, 80, 90]) },
    { format: "m4a", mimeType: "audio/mp4", durationMs: 5_000 },
  );

  const checkMergedEn = await history.collectEligibleVoiceCloneSamples("conv_a", "en");
  assert.equal(checkMergedEn.eligible, true);
  assert.equal(checkMergedEn.mode, "merged");
  assert.equal(checkMergedEn.totalDurationMs, 11_000);
  assert.equal(checkMergedEn.samples.length, 2);

  //Verify audio.readBytes works for each sample
  const sample1Bytes = await audio.readBytes({
    kind: "message",
    id: checkMergedEn.samples[0].messageId,
    role: "source",
  });
  assert.deepEqual(sample1Bytes?.bytes, new Uint8Array([10, 20, 30, 40]));

  // 3. Single >= 10s sample for 'es' in conv_a (10800ms) -> eligible via 'single' mode
  await history.saveReadyLiveMessage({
    id: "live_cap789_item1",
    requestId: "live_req_cap789_item1",
    conversationId: "conv_a",
    speaker: "them",
    originMode: "conversation",
    sourceLanguage: "es",
    targetLanguage: "en",
    originalText: "Hola mi querido nieto, que bueno escucharte hablar conmigo hoy.",
    translatedText: "Hello my dear grandson, so good to hear you hablar with me today.",
  });
  await audio.save(
    { kind: "message", id: "live_cap789_item1", role: "source" },
    { bytes: new Uint8Array([1, 3, 5, 7, 9, 11]) },
    { format: "m4a", mimeType: "audio/mp4", durationMs: 10_800 },
  );

  const checkSingleEs = await history.collectEligibleVoiceCloneSamples("conv_a", "es");
  assert.equal(checkSingleEs.eligible, true);
  assert.equal(checkSingleEs.mode, "single");
  assert.equal(checkSingleEs.totalDurationMs, 10_800);
  assert.equal(checkSingleEs.samples.length, 1);
  assert.equal(checkSingleEs.samples[0].messageId, "live_cap789_item1");

  // 4. Saving clone per language per chat & cache eviction (Review Focus #2, #3, #5)
  await assert.rejects(
    history.setConversationVoiceClone("conv_a", {
      languageCode: "en",
      voiceId: "bad_short",
      totalDurationMs: 9_500,
      mode: "single",
    }),
    /10 seconds/i,
  );

  const savedEn = await history.setConversationVoiceClone("conv_a", {
    languageCode: "en",
    voiceId: "voxtral_ref_mobile_en_a",
    totalDurationMs: 11_000,
    mode: "merged",
    referenceAudioBase64: "MOBILE_REF_B64",
  });
  assert.equal(savedEn.voiceId, "voxtral_ref_mobile_en_a");
  assert.equal(savedEn.referenceAudioBase64, "MOBILE_REF_B64");

  // Cached default-voice translated TTS for 'en' message in conv_a is evicted, while raw source voice recording stays intact!
  assert.equal(
    await audio.resolve({ kind: "message", id: "live_cap123_item1", role: "translated" }),
    null,
  );
  assert.equal(
    (await audio.resolve({ kind: "message", id: "live_cap123_item1", role: "source" }))?.availability,
    "available",
  );

  // Per-language & per-chat isolation (including referenceAudioBase64 round-trip)
  const storedMobileEn = await history.getConversationVoiceClone("conv_a", "en");
  assert.equal(storedMobileEn?.voiceId, "voxtral_ref_mobile_en_a");
  assert.equal(storedMobileEn?.referenceAudioBase64, "MOBILE_REF_B64");
  assert.equal(await history.getConversationVoiceClone("conv_a", "es"), null);
  assert.equal(await history.getConversationVoiceClone("conv_b", "en"), null);

  // Also verify live deduplication when itemId contains extra underscores/hyphens (e.g. item_abc_1, item_def_2)
  await history.saveReadyLiveMessage({
    id: "live_m1abc_9xyz_item_abc_1",
    requestId: "live_req_m1abc_9xyz_item_abc_1",
    conversationId: "conv_b",
    speaker: "me",
    originMode: "conversation",
    sourceLanguage: "en",
    targetLanguage: "es",
    originalText: "First sentence.",
    translatedText: "Primera frase.",
  });
  await audio.save(
    { kind: "message", id: "live_m1abc_9xyz_item_abc_1", role: "source" },
    { bytes: new Uint8Array([9, 8, 7, 6]) },
    { format: "m4a", mimeType: "audio/mp4", durationMs: 6_500 },
  );
  await history.saveReadyLiveMessage({
    id: "live_m1abc_9xyz_item_def_2",
    requestId: "live_req_m1abc_9xyz_item_def_2",
    conversationId: "conv_b",
    speaker: "me",
    originMode: "conversation",
    sourceLanguage: "en",
    targetLanguage: "es",
    originalText: "Second sentence.",
    translatedText: "Segunda frase.",
  });
  await audio.save(
    { kind: "message", id: "live_m1abc_9xyz_item_def_2", role: "source" },
    { bytes: new Uint8Array([9, 8, 7, 6]) },
    { format: "m4a", mimeType: "audio/mp4", durationMs: 6_500 },
  );
  const checkConvBDedup = await history.collectEligibleVoiceCloneSamples("conv_b", "en");
  assert.equal(checkConvBDedup.eligible, false);
  assert.equal(checkConvBDedup.totalDurationMs, 6_500);

  // 5. Transport & Speech API contract for `/speech/clone` and `/speech/output` with `clonedVoiceId`
  const httpCalls = [];
  const mockWavResponse = createMockWavBytes(2400);
  const transport = createProcessingTransport(
    (path) => `https://api.stringphone.test${path}`,
    async (url, options) => {
      httpCalls.push({ url, options });
      if (url.endsWith("/speech/clone")) {
        return Response.json({
          ok: true,
          cloned: true,
          language: "en",
          clonedVoiceId: "voxtral_ref_mobile_en_a",
          referenceAudioBase64: "MOBILE_REF_B64",
          mode: "merged",
          totalDurationMs: 11_000,
          usedSampleCount: 2,
        });
      }
      return new Response(mockWavResponse, {
        status: 200,
        headers: { "Content-Type": "audio/wav" },
      });
    },
  );
  const speechApi = createSpeechApi(transport);

  const cloneResp = await speechApi.requestVoiceClone({
    language: "en",
    samples: [
      {
        base64: "AQIDBA==",
        mimeType: "audio/mp4",
        filename: "s1.m4a",
        durationMs: 6_000,
      },
      {
        base64: "BQYHCA==",
        mimeType: "audio/mp4",
        filename: "s2.m4a",
        durationMs: 5_000,
      },
    ],
  });
  assert.equal(cloneResp.cloned, true);
  assert.equal(cloneResp.clonedVoiceId, "voxtral_ref_mobile_en_a");
  assert.equal(cloneResp.referenceAudioBase64, "MOBILE_REF_B64");
  assert.equal(httpCalls[0].url, "https://api.stringphone.test/speech/clone");
  const cloneBody = JSON.parse(httpCalls[0].options.body);
  assert.equal(cloneBody.language, "en");
  assert.equal(cloneBody.samples.length, 2);
  assert.equal(cloneBody.conversationId, undefined, "Mobile must never send local conversationId");

  // Output speech WITH clonedVoiceId & clonedVoiceReferenceAudio forwards both
  await speechApi.requestOutputSpeech({
    text: "Hola abuela",
    language: "es",
    speechVoice: "marin",
    clonedVoiceId: "voxtral_ref_mobile_en_a",
    clonedVoiceReferenceAudio: "MOBILE_REF_B64",
  });
  assert.equal(httpCalls[1].url, "https://api.stringphone.test/speech/output");
  assert.deepEqual(JSON.parse(httpCalls[1].options.body), {
    text: "Hola abuela",
    language: "es",
    speechVoice: "marin",
    clonedVoiceId: "voxtral_ref_mobile_en_a",
    clonedVoiceReferenceAudio: "MOBILE_REF_B64",
  });

  // Output speech WITHOUT clonedVoiceId omits clonedVoiceId & clonedVoiceReferenceAudio
  await speechApi.requestOutputSpeech({
    text: "Hola abuela",
    language: "es",
    speechVoice: "onyx",
  });
  assert.deepEqual(JSON.parse(httpCalls[2].options.body), {
    text: "Hola abuela",
    language: "es",
    speechVoice: "onyx",
  });

  // 6. Speech voice mode preference & clearing cloned voices in a conversation
  assert.equal((await history.getChatPreferences()).ttsVoiceMode, undefined);
  await history.setTtsVoiceModePreference("ai_tts");
  assert.equal((await history.getChatPreferences()).ttsVoiceMode, "ai_tts");
  await history.setTtsVoiceModePreference("voice_clone");
  assert.equal((await history.getChatPreferences()).ttsVoiceMode, "voice_clone");

  // Re-cache a generated translated TTS clip on live_cap123_item1 before clearing
  await audio.save(
    { kind: "message", id: "live_cap123_item1", role: "translated" },
    { bytes: createMockWavBytes(1200) },
    { format: "wav", mimeType: "audio/wav", durationMs: 500 },
  );
  assert.ok(await audio.resolve({ kind: "message", id: "live_cap123_item1", role: "translated" }));

  const clearedMobile = await history.clearConversationVoiceClones("conv_a");
  assert.equal(clearedMobile.clearedCount, 1);
  assert.ok(clearedMobile.resetAt > 0);
  assert.equal(await history.getConversationVoiceClone("conv_a", "en"), null);
  assert.deepEqual(await history.getConversationVoiceClones("conv_a"), {});
  // Evicts generated translated TTS while keeping raw source recording intact
  assert.equal(
    await audio.resolve({ kind: "message", id: "live_cap123_item1", role: "translated" }),
    null,
  );
  assert.equal(
    (await audio.resolve({ kind: "message", id: "live_cap123_item1", role: "source" }))?.availability,
    "available",
  );

  // Pre-reset recordings in conv_a must NOT trigger re-cloning after clearing
  const postClearOld = await history.collectEligibleVoiceCloneSamples("conv_a", "en");
  assert.equal(postClearOld.eligible, false);
  assert.equal(postClearOld.totalDurationMs, 0);
  assert.equal(postClearOld.samples.length, 0);

  // New 10.5s recording saved AFTER clearing becomes eligible on its own
  await history.saveReadyLiveMessage({
    id: "live_cap999_item1",
    requestId: "live_req_cap999_item1",
    conversationId: "conv_a",
    speaker: "me",
    originMode: "conversation",
    sourceLanguage: "en",
    targetLanguage: "es",
    originalText: "Recording fresh ten second sample after clearing",
    translatedText: "Grabando nueva muestra de diez segundos",
  });
  await audio.save(
    { kind: "message", id: "live_cap999_item1", role: "source" },
    { bytes: new Uint8Array([11, 22, 33, 44]) },
    { format: "m4a", mimeType: "audio/mp4", durationMs: 10_500 },
  );
  const postClearFresh = await history.collectEligibleVoiceCloneSamples("conv_a", "en");
  assert.equal(postClearFresh.eligible, true);
  assert.equal(postClearFresh.samples.length, 1);
  assert.equal(postClearFresh.samples[0].messageId, "live_cap999_item1");

  // Re-save a clone so deletion check exercises removing both clones and reset cutoff
  await history.setConversationVoiceClone("conv_a", {
    languageCode: "en",
    voiceId: "voxtral_ref_mobile_en_a_v2",
    totalDurationMs: 10_500,
    mode: "single",
    referenceAudioBase64: "MOBILE_REF_B64_V2",
  });

  // 7. Deleting conv_a removes its voice clones and reset cutoff from preferences
  const delReport = await deletion.delete({ kind: "conversation", id: "conv_a" });
  assert.equal(delReport.status, "deleted");
  assert.equal(await history.getConversationVoiceClone("conv_a", "en"), null);
  assert.equal(
    db.prepare("SELECT value_json FROM preferences WHERE key='chat.voiceClones.conv_a'").get(),
    undefined,
  );
  assert.equal(
    db.prepare("SELECT value_json FROM preferences WHERE key='chat.voiceCloneResetAt.conv_a'").get(),
    undefined,
  );
} finally {
  db.close();
  rmSync(directory, { recursive: true, force: true });
}

console.log("PASS Task 4: Android APK per-chat, per-language 10s single/merged voice cloning, voice mode toggle/clear, deduplication, cache eviction, and transport checks");
