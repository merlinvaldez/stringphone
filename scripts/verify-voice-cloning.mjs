import assert from "node:assert/strict";
import { getSupportedTtsLanguage } from "../src/lib/languages.ts";
import {
  MIN_VOICE_CLONE_DURATION_MS,
  MAX_VOICE_CLONE_DURATION_MS,
  createCanonicalPcmWavBuffer,
  getWavDurationMs,
  parsePcmWav,
  concatenatePcmWavBuffers,
  normalizeWavToSampleRateAndMaxDuration,
  prepareVoiceReference,
  selectAndMergeVoiceSamplesForCloning,
} from "../src/services/prepareVoiceReference.ts";
import {
  MISTRAL_VOXTRAL_DEFAULT_GATEWAY_MODEL,
  VOXTRAL_REFERENCE_SAMPLE_RATE,
  VOXTRAL_REFERENCE_MAX_DURATION_MS,
  MAX_INLINE_REFERENCE_AUDIO_BASE64_LENGTH,
  createMistralVoiceClone,
  deleteVoiceReferenceFromCache,
  generateMistralClonedSpeech,
  hasAiGatewayCredentials,
} from "../src/services/mistralVoiceCloning.ts";
import { validatePronunciationLine } from "../src/services/generatePronunciationGuidance.ts";
import { generateSpeech } from "../src/services/generateSpeech.ts";
import {
  clearCachedServerChatVoiceClones,
  clearCachedServerChatVoiceClonesForConversation,
  getCachedServerChatVoiceClone,
  runChatVoiceCloning,
} from "../src/lib/runChatVoiceCloning.ts";
import { runOutputTextToSpeech } from "../src/lib/runOutputTextToSpeech.ts";
import speechCloneHandler from "../api/speech/clone.ts";
import speechOutputHandler from "../api/speech/output.ts";

function makeWavSample(durationMs, filename = "sample.wav", fillByte = 0x11) {
  const sampleRate = 44100;
  const channels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * channels * (bitsPerSample / 8);
  const blockAlign = channels * (bitsPerSample / 8);
  const rawBytes = Math.round((durationMs / 1000) * byteRate);
  const pcmByteLength = rawBytes - (rawBytes % blockAlign);
  const pcmData = Buffer.alloc(pcmByteLength, fillByte);
  const buffer = createCanonicalPcmWavBuffer(pcmData, sampleRate, channels, bitsPerSample);
  return {
    buffer,
    filename,
    mimeType: "audio/wav",
    durationMs: getWavDurationMs(buffer),
  };
}

const createdVoiceIds = [];

try {
  // 1. Canonical WAV & duration calculation
  {
    assert.equal(MIN_VOICE_CLONE_DURATION_MS, 10_000);
    assert.equal(MAX_VOICE_CLONE_DURATION_MS, 60_000);
    const sample10s = makeWavSample(10_000, "ten-sec.wav");
    assert.equal(sample10s.durationMs, 10_000);

    const prepared = await prepareVoiceReference({
      audioBuffer: sample10s.buffer,
      originalFilename: "ten-sec.wav",
      mimeType: "audio/wav",
    });
    assert.equal(prepared.durationMs, 10_000);
    assert.equal(prepared.mimeType, "audio/wav");
  }

  // 2. 10-second rule: single vs merged vs insufficient
  {
    const shortSingle = makeWavSample(9_900, "short.wav");
    const resShortSingle = selectAndMergeVoiceSamplesForCloning([shortSingle]);
    assert.equal(resShortSingle.eligible, false);
    assert.equal(resShortSingle.mode, "insufficient");
    assert.equal(resShortSingle.totalDurationMs, 9_900);
    assert.equal(resShortSingle.mergedReference, null);

    const s1 = makeWavSample(4_900, "s1.wav");
    const s2 = makeWavSample(4_900, "s2.wav");
    const resTwoShort = selectAndMergeVoiceSamplesForCloning([s1, s2]);
    assert.equal(resTwoShort.eligible, false);
    assert.equal(resTwoShort.mode, "insufficient");
    assert.equal(resTwoShort.totalDurationMs, 9_800);
    assert.equal(resTwoShort.mergedReference, null);

    const singleLong = makeWavSample(10_200, "single-10s.wav");
    const resSingleLong = selectAndMergeVoiceSamplesForCloning([s1, singleLong]);
    assert.equal(resSingleLong.eligible, true);
    assert.equal(resSingleLong.mode, "single");
    assert.equal(resSingleLong.totalDurationMs, 10_200);
    assert.equal(resSingleLong.usedSampleCount, 1);
    assert.ok(resSingleLong.mergedReference);
    assert.equal(getWavDurationMs(resSingleLong.mergedReference.buffer), 10_200);

    const m1 = makeWavSample(3_500, "m1.wav", 0x10);
    const m2 = makeWavSample(4_000, "m2.wav", 0x20);
    const m3 = makeWavSample(3_200, "m3.wav", 0x30);
    const resMerged = selectAndMergeVoiceSamplesForCloning([m1, m2, m3]);
    assert.equal(resMerged.eligible, true);
    assert.equal(resMerged.mode, "merged");
    assert.equal(resMerged.totalDurationMs, 10_700);
    assert.equal(resMerged.usedSampleCount, 3);
    assert.ok(resMerged.mergedReference);
    assert.equal(getWavDurationMs(resMerged.mergedReference.buffer), 10_700);

    const concatBuf = concatenatePcmWavBuffers([m1.buffer, m2.buffer]);
    assert.equal(getWavDurationMs(concatBuf), 7_500);
  }

  // 3. Mistral Voxtral 3 Instant Voice Clone Preparation (16 kHz / <= 8s WAV)
  let cloneResult = null;
  {
    assert.equal(MISTRAL_VOXTRAL_DEFAULT_GATEWAY_MODEL, "mistral/voxtral-mini-tts-3");
    assert.equal(VOXTRAL_REFERENCE_SAMPLE_RATE, 16_000);
    assert.equal(VOXTRAL_REFERENCE_MAX_DURATION_MS, 8_000);

    assert.equal(
      hasAiGatewayCredentials({ gatewayApiKey: null, oidcToken: null }),
      false,
    );
    assert.equal(
      hasAiGatewayCredentials({ gatewayApiKey: "test-gw-key", oidcToken: null }),
      true,
    );
    assert.equal(
      hasAiGatewayCredentials({ gatewayApiKey: null, oidcToken: "test-oidc-token" }),
      true,
    );

    const tooShort = makeWavSample(9_500, "too-short.wav");
    await assert.rejects(
      createMistralVoiceClone(
        {
          mergedReference: tooShort,
          languageCode: "en",
          languageName: "English",
          conversationScopeId: "chat_123",
        },
        { gatewayApiKey: "test-gateway-key", oidcToken: null },
      ),
      /at least 10 seconds/i,
    );

    const validSample = makeWavSample(11_000, "valid-11s.wav");
    await assert.rejects(
      createMistralVoiceClone(
        {
          mergedReference: validSample,
          languageCode: "es",
          languageName: "Spanish",
          conversationScopeId: "chat_abc",
        },
        { gatewayApiKey: null, oidcToken: null },
      ),
      /Vercel AI Gateway is not configured/i,
    );

    cloneResult = await createMistralVoiceClone(
      {
        mergedReference: validSample,
        languageCode: "es",
        languageName: "Spanish",
        conversationScopeId: "chat_abc",
        transcripts: ["Hola abuela", "Como estas hoy"],
      },
      { gatewayApiKey: "test-gateway-key" },
    );

    assert.match(cloneResult.voiceId, /^voxtral_ref_/);
    createdVoiceIds.push(cloneResult.voiceId);
    assert.equal(cloneResult.durationMs, 11_000);
    assert.ok(cloneResult.referenceAudioBase64.length > 0);
    const decodedRef = parsePcmWav(Buffer.from(cloneResult.referenceAudioBase64, "base64"));
    assert.ok(decodedRef);
    assert.equal(decodedRef.sampleRate, 16_000);
    assert.equal(decodedRef.channels, 1);
    assert.equal(decodedRef.bitsPerSample, 16);
    assert.equal(decodedRef.durationMs, 8_000);
  }

  // 4. Mistral Speech Generation via Vercel AI Gateway (Cached + Stateless + Native Persian Script + OpenAI Fallback)
  {
    const spanish = getSupportedTtsLanguage("es");
    const persian = getSupportedTtsLanguage("fa");
    const mockWavOut = makeWavSample(1_500, "out.wav");
    let gatewayCallArgs = null;

    // A) Cached clonedVoiceId lookup
    const synthesized = await generateMistralClonedSpeech(
      {
        text: "Hola desde el clon de voz",
        targetLanguage: spanish,
        clonedVoiceId: cloneResult.voiceId,
      },
      {
        gatewayApiKey: "test-gateway-key",
        generateSpeechImpl: async (args) => {
          gatewayCallArgs = args;
          return { audio: { uint8Array: new Uint8Array(mockWavOut.buffer) } };
        },
      },
    );

    assert.ok(gatewayCallArgs);
    assert.equal(gatewayCallArgs.text, "Hola desde el clon de voz");
    assert.equal(gatewayCallArgs.outputFormat, "wav");
    assert.equal("speed" in gatewayCallArgs, false);
    assert.equal("language" in gatewayCallArgs, false);
    assert.equal("voice" in gatewayCallArgs, false);
    assert.equal(
      gatewayCallArgs.providerOptions.mistral.refAudio,
      cloneResult.referenceAudioBase64,
    );
    assert.equal(getWavDurationMs(synthesized), 1_500);

    // B) Stateless inline referenceAudioBase64 works even with unknown server voiceId and sends native Persian script
    let persianGatewayArgs = null;
    await generateMistralClonedSpeech(
      {
        text: "آیا به کمک نیاز دارید؟",
        targetLanguage: persian,
        clonedVoiceId: "nonexistent_stateless_voice_id",
        referenceAudioBase64: cloneResult.referenceAudioBase64,
      },
      {
        gatewayApiKey: "test-gateway-key",
        generateSpeechImpl: async (args) => {
          persianGatewayArgs = args;
          return { audio: { uint8Array: new Uint8Array(mockWavOut.buffer) } };
        },
      },
    );
    assert.equal(persianGatewayArgs.text, "آیا به کمک نیاز دارید؟");
    assert.equal(
      persianGatewayArgs.providerOptions.mistral.refAudio,
      cloneResult.referenceAudioBase64,
    );

    // C) Reject malformed referenceAudioBase64
    await assert.rejects(
      generateMistralClonedSpeech(
        {
          text: "سلام",
          targetLanguage: persian,
          referenceAudioBase64: "bm90LWEtd2F2", // "not-a-wav"
        },
        {
          gatewayApiKey: "test-gateway-key",
          generateSpeechImpl: async () => ({
            audio: { uint8Array: new Uint8Array(mockWavOut.buffer) },
          }),
        },
      ),
      /Invalid cloned voice reference audio/i,
    );

    // D) generateSpeech routing:
    // 1) No clone -> defaults to original OpenAI TTS
    let openAiCalls = 0;
    let clonedCalls = 0;
    const defaultOut = await generateSpeech(
      {
        text: "Hello world",
        targetLanguage: spanish,
        speechVoice: "onyx",
      },
      {
        generateOpenAiSpeechImpl: async () => {
          openAiCalls++;
          return mockWavOut.buffer;
        },
        generateClonedSpeechImpl: async () => {
          clonedCalls++;
          return mockWavOut.buffer;
        },
      },
    );
    assert.equal(openAiCalls, 1);
    assert.equal(clonedCalls, 0);
    assert.equal(defaultOut.length, mockWavOut.buffer.length);

    // 2) With stateless clonedVoiceReferenceAudio -> invokes cloned speech without needing clonedVoiceId
    const statelessOut = await generateSpeech(
      {
        text: "Hola mundo",
        targetLanguage: spanish,
        speechVoice: "onyx",
        clonedVoiceId: cloneResult.voiceId,
        clonedVoiceReferenceAudio: cloneResult.referenceAudioBase64,
      },
      {
        generateOpenAiSpeechImpl: async () => {
          openAiCalls++;
          return mockWavOut.buffer;
        },
        generateClonedSpeechImpl: async (input) => {
          clonedCalls++;
          assert.equal(input.clonedVoiceId, cloneResult.voiceId);
          assert.equal(input.referenceAudioBase64, cloneResult.referenceAudioBase64);
          return mockWavOut.buffer;
        },
      },
    );
    assert.equal(openAiCalls, 1);
    assert.equal(clonedCalls, 1);
    assert.equal(statelessOut.length, mockWavOut.buffer.length);

    // 3) If Mistral / Gateway fails -> falls back to original OpenAI TTS with original native script
    let openAiFallbackText = "";
    const fallbackOut = await generateSpeech(
      {
        text: "آیا به کمک نیاز دارید؟",
        targetLanguage: persian,
        speechVoice: "marin",
        clonedVoiceId: cloneResult.voiceId,
        clonedVoiceReferenceAudio: cloneResult.referenceAudioBase64,
      },
      {
        generateOpenAiSpeechImpl: async (opts) => {
          openAiCalls++;
          openAiFallbackText = opts.text;
          return mockWavOut.buffer;
        },
        generateClonedSpeechImpl: async () => {
          clonedCalls++;
          throw new Error("Simulated Mistral Gateway outage");
        },
      },
    );
    assert.equal(openAiCalls, 2);
    assert.equal(clonedCalls, 2);
    assert.equal(openAiFallbackText, "آیا به کمک نیاز دارید؟");
    assert.equal(fallbackOut.length, mockWavOut.buffer.length);
  }

  // 5. runChatVoiceCloning, api/speech/clone.ts, and runOutputTextToSpeech
  {
    clearCachedServerChatVoiceClones();

    const badLang = await runChatVoiceCloning({
      language: "invalid-lang",
      samples: [{ buffer: makeWavSample(10_000).buffer, filename: "a.wav" }],
    });
    assert.equal(badLang.ok, false);
    assert.equal(badLang.status, 400);

    const emptySamples = await runChatVoiceCloning({
      language: "en",
      samples: [],
    });
    assert.equal(emptySamples.ok, false);
    assert.equal(emptySamples.status, 400);

    let cloneApiCalls = 0;
    const under10s = await runChatVoiceCloning(
      {
        conversationId: "chat_1",
        language: "en",
        samples: [
          { buffer: makeWavSample(4_200).buffer, filename: "part1.wav" },
          { buffer: makeWavSample(5_100).buffer, filename: "part2.wav" },
        ],
      },
      {
        createVoiceCloneImpl: async () => {
          cloneApiCalls++;
          return { voiceId: "should_not_be_called", durationMs: 9_300 };
        },
      },
    );
    assert.equal(under10s.ok, true);
    assert.equal(under10s.cloned, false);
    assert.equal(under10s.reason, "insufficient_duration");
    assert.equal(under10s.totalDurationMs, 9_300);
    assert.equal(under10s.clonedVoiceId, null);
    assert.equal(cloneApiCalls, 0);
    assert.equal(getCachedServerChatVoiceClone("chat_1", "en"), null);

    // Missing AI Gateway credentials returns provider_unavailable cleanly
    const prevGw = process.env.AI_GATEWAY_API_KEY;
    const prevOidc = process.env.VERCEL_OIDC_TOKEN;
    try {
      process.env.AI_GATEWAY_API_KEY = "";
      process.env.VERCEL_OIDC_TOKEN = "";
      const noCredsRes = await runChatVoiceCloning({
        conversationId: "chat_no_creds",
        language: "en",
        samples: [{ buffer: makeWavSample(10_500).buffer, filename: "ten.wav" }],
      });
      assert.equal(noCredsRes.ok, true);
      assert.equal(noCredsRes.cloned, false);
      assert.equal(noCredsRes.reason, "provider_unavailable");
    } finally {
      if (prevGw !== undefined) process.env.AI_GATEWAY_API_KEY = prevGw;
      else delete process.env.AI_GATEWAY_API_KEY;
      if (prevOidc !== undefined) process.env.VERCEL_OIDC_TOKEN = prevOidc;
      else delete process.env.VERCEL_OIDC_TOKEN;
    }

    // Merging multiple samples to >= 10s -> cloned: true, mode: 'merged' with referenceAudioBase64
    const merged10s = await runChatVoiceCloning(
      {
        conversationId: "chat_1",
        language: "en",
        samples: [
          { buffer: makeWavSample(5_200).buffer, filename: "part1.wav", transcript: "Hello" },
          { buffer: makeWavSample(5_300).buffer, filename: "part2.wav", transcript: "World" },
        ],
      },
      {
        createVoiceCloneImpl: async (input) => {
          cloneApiCalls++;
          assert.equal(input.languageCode, "en");
          assert.equal(input.mergedReference.durationMs, 10_500);
          return {
            voiceId: "voxtral_ref_en_chat_1",
            durationMs: 10_500,
            referenceAudioBase64: "MOCK_REF_B64",
          };
        },
      },
    );
    assert.equal(merged10s.ok, true);
    assert.equal(merged10s.cloned, true);
    assert.equal(merged10s.mode, "merged");
    assert.equal(merged10s.totalDurationMs, 10_500);
    assert.equal(merged10s.usedSampleCount, 2);
    assert.equal(merged10s.clonedVoiceId, "voxtral_ref_en_chat_1");
    assert.equal(merged10s.referenceAudioBase64, "MOCK_REF_B64");
    assert.equal(cloneApiCalls, 1);
    assert.equal(getCachedServerChatVoiceClone("chat_1", "en")?.voiceId, "voxtral_ref_en_chat_1");
    assert.equal(getCachedServerChatVoiceClone("chat_1", "es"), null);
    assert.equal(getCachedServerChatVoiceClone("chat_2", "en"), null);

    // Subsequent call for same (chat_1, en) returns cached clone + referenceAudioBase64 without re-cloning
    const cachedCloneRes = await runChatVoiceCloning(
      {
        conversationId: "chat_1",
        language: "en",
        samples: [{ buffer: makeWavSample(11_000).buffer, filename: "single.wav" }],
      },
      {
        createVoiceCloneImpl: async () => {
          cloneApiCalls++;
          return { voiceId: "new_id", durationMs: 11_000 };
        },
      },
    );
    assert.equal(cachedCloneRes.ok, true);
    assert.equal(cachedCloneRes.cloned, true);
    assert.equal(cachedCloneRes.clonedVoiceId, "voxtral_ref_en_chat_1");
    assert.equal(cachedCloneRes.referenceAudioBase64, "MOCK_REF_B64");
    assert.equal(cloneApiCalls, 1);

    // Calling runChatVoiceCloning with forceRefresh=true replaces the stale cached clone
    const refreshedCloneRes = await runChatVoiceCloning(
      {
        conversationId: "chat_1",
        language: "en",
        forceRefresh: true,
        samples: [{ buffer: makeWavSample(11_000).buffer, filename: "single.wav" }],
      },
      {
        createVoiceCloneImpl: async () => {
          cloneApiCalls++;
          return {
            voiceId: "voxtral_ref_en_chat_1_v2",
            durationMs: 11_000,
            referenceAudioBase64: "MOCK_REF_B64_V2",
          };
        },
      },
    );
    assert.equal(refreshedCloneRes.ok, true);
    assert.equal(refreshedCloneRes.cloned, true);
    assert.equal(refreshedCloneRes.clonedVoiceId, "voxtral_ref_en_chat_1_v2");
    assert.equal(refreshedCloneRes.referenceAudioBase64, "MOCK_REF_B64_V2");
    assert.equal(cloneApiCalls, 2);

    // Clearing server cache for chat_1 removes only chat_1 clones
    await runChatVoiceCloning(
      {
        conversationId: "chat_2",
        language: "es",
        samples: [{ buffer: makeWavSample(11_000).buffer, filename: "single-es.wav" }],
      },
      {
        createVoiceCloneImpl: async () => ({
          voiceId: "voxtral_ref_es_chat_2",
          durationMs: 11_000,
          referenceAudioBase64: "MOCK_REF_ES_2",
        }),
      },
    );
    const clearedServerCount = clearCachedServerChatVoiceClonesForConversation("chat_1");
    assert.equal(clearedServerCount, 1);
    assert.equal(getCachedServerChatVoiceClone("chat_1", "en"), null);
    assert.equal(getCachedServerChatVoiceClone("chat_2", "es")?.voiceId, "voxtral_ref_es_chat_2");

    // runOutputTextToSpeech validation & forwarding
    const badCloneId = await runOutputTextToSpeech({
      text: "Hola",
      language: "es",
      clonedVoiceId: "invalid voice id with spaces!",
    });
    assert.equal(badCloneId.ok, false);
    assert.equal(badCloneId.status, 400);
    assert.equal(badCloneId.body.error, "clonedVoiceId is not supported");

    const badRefAudioType = await runOutputTextToSpeech({
      text: "Hola",
      language: "es",
      clonedVoiceReferenceAudio: 12345,
    });
    assert.equal(badRefAudioType.ok, false);
    assert.equal(badRefAudioType.status, 400);
    assert.equal(badRefAudioType.body.error, "clonedVoiceReferenceAudio is not supported");

    const badRefAudioLength = await runOutputTextToSpeech({
      text: "Hola",
      language: "es",
      clonedVoiceReferenceAudio: "A".repeat(MAX_INLINE_REFERENCE_AUDIO_BASE64_LENGTH + 1),
    });
    assert.equal(badRefAudioLength.ok, false);
    assert.equal(badRefAudioLength.status, 400);
    assert.equal(badRefAudioLength.body.error, "clonedVoiceReferenceAudio is not supported");

    let receivedSpeechInput = null;
    const mockOutWav = makeWavSample(1_000).buffer;
    const ttsWithClone = await runOutputTextToSpeech(
      {
        text: "Hola abuela",
        language: "es",
        speechVoice: "marin",
        clonedVoiceId: "voxtral_ref_en_chat_1",
        clonedVoiceReferenceAudio: "MOCK_REF_B64",
      },
      {
        generateSpeechImpl: async (input) => {
          receivedSpeechInput = input;
          return mockOutWav;
        },
      },
    );
    assert.equal(ttsWithClone.ok, true);
    assert.equal(receivedSpeechInput.clonedVoiceId, "voxtral_ref_en_chat_1");
    assert.equal(receivedSpeechInput.clonedVoiceReferenceAudio, "MOCK_REF_B64");

    // Vercel handler api/speech/clone.ts & api/speech/output.ts checks
    const optionsResp = await speechCloneHandler.fetch(
      new Request("https://audit.invalid/api/speech/clone", { method: "OPTIONS" }),
    );
    assert.equal(optionsResp.status, 204);
    assert.match(optionsResp.headers.get("Access-Control-Allow-Methods") ?? "", /DELETE/);

    const getResp = await speechCloneHandler.fetch(
      new Request("https://audit.invalid/api/speech/clone", { method: "GET" }),
    );
    assert.equal(getResp.status, 405);

    const badDeleteResp = await speechCloneHandler.fetch(
      new Request("https://audit.invalid/api/speech/clone", { method: "DELETE" }),
    );
    assert.equal(badDeleteResp.status, 400);

    const deleteChat2Resp = await speechCloneHandler.fetch(
      new Request("https://audit.invalid/api/speech/clone", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: "chat_2" }),
      }),
    );
    assert.equal(deleteChat2Resp.status, 200);
    const deleteChat2Json = await deleteChat2Resp.json();
    assert.equal(deleteChat2Json.ok, true);
    assert.equal(deleteChat2Json.clearedCount, 1);
    assert.equal(getCachedServerChatVoiceClone("chat_2", "es"), null);

    const postUnder10Resp = await speechCloneHandler.fetch(
      new Request("https://audit.invalid/api/speech/clone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          language: "fr",
          samples: [
            {
              base64: makeWavSample(3_000).buffer.toString("base64"),
              mimeType: "audio/wav",
              filename: "short.wav",
            },
          ],
        }),
      }),
    );
    assert.equal(postUnder10Resp.status, 200);
    const postUnder10Json = await postUnder10Resp.json();
    assert.equal(postUnder10Json.ok, true);
    assert.equal(postUnder10Json.cloned, false);
    assert.equal(postUnder10Json.reason, "insufficient_duration");

    const badOutputResp = await speechOutputHandler.fetch(
      new Request("https://audit.invalid/api/speech/output", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: "Hola",
          language: "es",
          clonedVoiceId: "bad id!",
        }),
      }),
    );
    assert.equal(badOutputResp.status, 400);

    const badOutputRefResp = await speechOutputHandler.fetch(
      new Request("https://audit.invalid/api/speech/output", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: "Hola",
          language: "es",
          clonedVoiceReferenceAudio: { invalid: true },
        }),
      }),
    );
    assert.equal(badOutputRefResp.status, 400);

    // 6. Pure-TS multi-rate / stereo PCM WAV normalization & compaction to 16kHz / 8s
    const stereo24kPcm = Buffer.alloc(24000 * 2 * 2 * 10); // 10s stereo 24kHz 16-bit
    const stereo24kWav = createCanonicalPcmWavBuffer(stereo24kPcm, 24000, 2, 16);
    const prepared24k = await prepareVoiceReference({
      audioBuffer: stereo24kWav,
      originalFilename: "browser-segment.wav",
      mimeType: "audio/wav",
    });
    const parsedPrepared24k = parsePcmWav(prepared24k.buffer);
    assert.equal(parsedPrepared24k.sampleRate, 44100);
    assert.equal(parsedPrepared24k.channels, 1);
    assert.equal(parsedPrepared24k.bitsPerSample, 16);
    assert.equal(prepared24k.durationMs, 10_000);

    const compactedInlineWav = normalizeWavToSampleRateAndMaxDuration(
      prepared24k.buffer,
      VOXTRAL_REFERENCE_SAMPLE_RATE,
      VOXTRAL_REFERENCE_MAX_DURATION_MS,
    );
    const parsedCompacted = parsePcmWav(compactedInlineWav);
    assert.equal(parsedCompacted.sampleRate, 16_000);
    assert.equal(parsedCompacted.channels, 1);
    assert.equal(parsedCompacted.durationMs, 8_000);

    // 7. Pronunciation guide validator retains Persian punctuation cleanly for UI display
    assert.equal(
      validatePronunciationLine("haa-LET che-TO-reh؟", {
        text: "حالت چطوره؟",
        textLanguage: "Persian",
        textLanguageCode: "fa",
        readerLanguage: "English",
        readerLanguageCode: "en",
        disallowedCopyText: "How are you?",
      }),
      "haa-LET che-TO-reh?",
    );
    assert.equal(
      validatePronunciationLine("sa-LAM، ma-MAAN bo-ZORG!", {
        text: "سلام، مامان بزرگ!",
        textLanguage: "Persian",
        textLanguageCode: "fa",
        readerLanguage: "English",
        readerLanguageCode: "en",
        disallowedCopyText: "Hello, Grandma!",
      }),
      "sa-LAM, ma-MAAN bo-ZORG!",
    );
  }
} finally {
  for (const voiceId of createdVoiceIds) {
    deleteVoiceReferenceFromCache(voiceId);
  }
}

console.log(
  "PASS Backend Voice Cloning: 10s rule, WAV merging/compaction, Mistral Voxtral 3 over Vercel AI Gateway, stateless referenceAudioBase64, and /speech/clone + /speech/output endpoints",
);
