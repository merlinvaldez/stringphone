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
  FISH_AUDIO_DEFAULT_GATEWAY_MODEL,
  FISH_AUDIO_DEFAULT_SPEED,
  INLINE_VOICE_CLONE_MAX_DURATION_MS,
  INLINE_VOICE_CLONE_SAMPLE_RATE,
  createFishVoiceClone,
  generateFishClonedSpeech,
  normalizeRomanizedPronunciationForFishTts,
} from "../src/services/fishVoiceCloning.ts";
import { validatePronunciationLine } from "../src/services/generatePronunciationGuidance.ts";
import { generateSpeech } from "../src/services/generateSpeech.ts";
import {
  clearCachedServerChatVoiceClones,
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

// 2. 10-second rule: single vs merged vs insufficient (Review Focus #1)
{
  // Single 9.9s sample -> insufficient (< 10s)
  const shortSingle = makeWavSample(9_900, "short.wav");
  const resShortSingle = selectAndMergeVoiceSamplesForCloning([shortSingle]);
  assert.equal(resShortSingle.eligible, false);
  assert.equal(resShortSingle.mode, "insufficient");
  assert.equal(resShortSingle.totalDurationMs, 9_900);
  assert.equal(resShortSingle.mergedReference, null);

  // Two 4.9s samples -> 9.8s total -> insufficient (< 10s)
  const s1 = makeWavSample(4_900, "s1.wav");
  const s2 = makeWavSample(4_900, "s2.wav");
  const resTwoShort = selectAndMergeVoiceSamplesForCloning([s1, s2]);
  assert.equal(resTwoShort.eligible, false);
  assert.equal(resTwoShort.mode, "insufficient");
  assert.equal(resTwoShort.totalDurationMs, 9_800);
  assert.equal(resTwoShort.mergedReference, null);

  // Single 10.2s sample -> eligible via 'single' mode
  const singleLong = makeWavSample(10_200, "single-10s.wav");
  const resSingleLong = selectAndMergeVoiceSamplesForCloning([s1, singleLong]);
  assert.equal(resSingleLong.eligible, true);
  assert.equal(resSingleLong.mode, "single");
  assert.equal(resSingleLong.totalDurationMs, 10_200);
  assert.equal(resSingleLong.usedSampleCount, 1);
  assert.ok(resSingleLong.mergedReference);
  assert.equal(getWavDurationMs(resSingleLong.mergedReference.buffer), 10_200);

  // Three samples (3.5s + 4.0s + 3.2s = 10.7s) -> eligible via 'merged' mode
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

  // Concatenate helper directly
  const concatBuf = concatenatePcmWavBuffers([m1.buffer, m2.buffer]);
  assert.equal(getWavDurationMs(concatBuf), 7_500);
}

// 3. Fish Audio Instant Voice Clone Creation (`POST https://api.fish.audio/model`)
{
  const tooShort = makeWavSample(9_500, "too-short.wav");
  await assert.rejects(
    createFishVoiceClone(
      {
        mergedReference: tooShort,
        languageCode: "en",
        languageName: "English",
        conversationScopeId: "chat_123",
      },
      { apiKey: "test-fish-key" },
    ),
    /at least 10 seconds/i,
  );

  let capturedUrl = "";
  let capturedHeaders = {};
  let capturedFormData = null;

  const validSample = makeWavSample(11_000, "valid-11s.wav");
  const cloneResult = await createFishVoiceClone(
    {
      mergedReference: validSample,
      languageCode: "es",
      languageName: "Spanish",
      conversationScopeId: "chat_abc",
      transcripts: ["Hola abuela", "Como estas hoy"],
    },
    {
      apiKey: "test-fish-api-key",
      fetchImpl: async (url, init) => {
        capturedUrl = String(url);
        capturedHeaders = init?.headers ?? {};
        capturedFormData = init?.body;
        return new Response(
          JSON.stringify({
            _id: "fish_voice_es_chat_abc",
            state: "trained",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },
    },
  );

  assert.equal(capturedUrl, "https://api.fish.audio/model");
  assert.equal(capturedHeaders.Authorization, "Bearer test-fish-api-key");
  assert.ok(capturedFormData instanceof FormData);
  assert.equal(capturedFormData.get("type"), "tts");
  assert.equal(capturedFormData.get("train_mode"), "fast");
  assert.equal(capturedFormData.get("visibility"), "unlist");
  assert.ok(capturedFormData.get("voices") instanceof Blob);
  assert.equal(cloneResult.voiceId, "fish_voice_es_chat_abc");
  assert.equal(cloneResult.durationMs, 11_000);
}

// 4. Fish Audio Speech Generation via Vercel AI Gateway & Default Fallback
{
  assert.equal(FISH_AUDIO_DEFAULT_GATEWAY_MODEL, "fish-audio/s2.1-pro");
  const spanish = getSupportedTtsLanguage("es");
  const mockWavOut = makeWavSample(1_500, "out.wav");
  let gatewayCallArgs = null;

  const synthesized = await generateFishClonedSpeech(
    {
      text: "Hola desde el clon de voz",
      targetLanguage: spanish,
      clonedVoiceId: "fish_voice_es_chat_abc",
    },
    {
      apiKey: "test-fish-key",
      gatewayApiKey: "test-gateway-key",
      generateSpeechImpl: async (args) => {
        gatewayCallArgs = args;
        return {
          audio: {
            uint8Array: new Uint8Array(mockWavOut.buffer),
          },
        };
      },
    },
  );

  assert.ok(gatewayCallArgs);
  assert.equal(FISH_AUDIO_DEFAULT_SPEED, 0.85);
  assert.equal(gatewayCallArgs.text, "Hola desde el clon de voz");
  assert.equal(gatewayCallArgs.voice, "fish_voice_es_chat_abc");
  assert.equal(gatewayCallArgs.speed, 0.85);
  assert.equal(gatewayCallArgs.outputFormat, "wav");
  const providerOpts = gatewayCallArgs.providerOptions;
  assert.equal(providerOpts.fishAudio.referenceId, "fish_voice_es_chat_abc");
  assert.equal(providerOpts.fishAudio.latency, "balanced");
  assert.equal(providerOpts.fishAudio.normalize, true);
  assert.equal(providerOpts.fishAudio.temperature, 0.4);
  assert.equal(providerOpts.fishAudio.topP, 0.1);
  assert.equal(providerOpts.fishAudio.repetitionPenalty, 1.2);
  assert.equal(getWavDurationMs(synthesized), 1_500);

  // generateSpeech routing:
  // A) No clonedVoiceId -> defaults to original OpenAI TTS
  let openAiCalls = 0;
  let fishCalls = 0;
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
      generateFishClonedSpeechImpl: async () => {
        fishCalls++;
        return mockWavOut.buffer;
      },
    },
  );
  assert.equal(openAiCalls, 1);
  assert.equal(fishCalls, 0);
  assert.equal(defaultOut.length, mockWavOut.buffer.length);

  // B) With clonedVoiceId -> uses Fish Audio via Vercel AI Gateway
  const clonedOut = await generateSpeech(
    {
      text: "Hola mundo",
      targetLanguage: spanish,
      speechVoice: "onyx",
      clonedVoiceId: "fish_voice_es_chat_abc",
    },
    {
      generateOpenAiSpeechImpl: async () => {
        openAiCalls++;
        return mockWavOut.buffer;
      },
      generateFishClonedSpeechImpl: async (input) => {
        fishCalls++;
        assert.equal(input.clonedVoiceId, "fish_voice_es_chat_abc");
        return mockWavOut.buffer;
      },
    },
  );
  assert.equal(openAiCalls, 1);
  assert.equal(fishCalls, 1);
  assert.equal(clonedOut.length, mockWavOut.buffer.length);

  // C) If Fish Audio / Gateway fails at runtime -> falls back to original OpenAI TTS
  const fallbackOut = await generateSpeech(
    {
      text: "Hola con fallback",
      targetLanguage: spanish,
      speechVoice: "marin",
      clonedVoiceId: "fish_voice_es_chat_abc",
    },
    {
      generateOpenAiSpeechImpl: async () => {
        openAiCalls++;
        return mockWavOut.buffer;
      },
      generateFishClonedSpeechImpl: async () => {
        fishCalls++;
        throw new Error("Simulated Fish Gateway outage");
      },
    },
  );
  assert.equal(openAiCalls, 2);
  assert.equal(fishCalls, 2);
  assert.equal(fallbackOut.length, mockWavOut.buffer.length);
}

// 5. Task 2: runChatVoiceCloning, api/speech/clone.ts, and runOutputTextToSpeech
{
  clearCachedServerChatVoiceClones();

  // Validation errors
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

  // Under 10s -> cloned: false, reason: 'insufficient_duration'
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
      createFishVoiceCloneImpl: async () => {
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

  // Merging multiple samples to >= 10s -> cloned: true, mode: 'merged'
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
      createFishVoiceCloneImpl: async (input) => {
        cloneApiCalls++;
        assert.equal(input.languageCode, "en");
        assert.equal(input.mergedReference.durationMs, 10_500);
        return { voiceId: "fish_en_chat_1", durationMs: 10_500 };
      },
    },
  );
  assert.equal(merged10s.ok, true);
  assert.equal(merged10s.cloned, true);
  assert.equal(merged10s.mode, "merged");
  assert.equal(merged10s.totalDurationMs, 10_500);
  assert.equal(merged10s.usedSampleCount, 2);
  assert.equal(merged10s.clonedVoiceId, "fish_en_chat_1");
  assert.equal(cloneApiCalls, 1);
  assert.equal(getCachedServerChatVoiceClone("chat_1", "en")?.voiceId, "fish_en_chat_1");
  assert.equal(getCachedServerChatVoiceClone("chat_1", "es"), null);
  assert.equal(getCachedServerChatVoiceClone("chat_2", "en"), null);

  // Subsequent call for same (chat_1, en) returns cached clone without re-cloning
  const cachedCloneRes = await runChatVoiceCloning(
    {
      conversationId: "chat_1",
      language: "en",
      samples: [{ buffer: makeWavSample(11_000).buffer, filename: "single.wav" }],
    },
    {
      createFishVoiceCloneImpl: async () => {
        cloneApiCalls++;
        return { voiceId: "new_id", durationMs: 11_000 };
      },
    },
  );
  assert.equal(cachedCloneRes.ok, true);
  assert.equal(cachedCloneRes.cloned, true);
  assert.equal(cachedCloneRes.clonedVoiceId, "fish_en_chat_1");
  assert.equal(cloneApiCalls, 1);

  // runOutputTextToSpeech validation & forwarding
  const badCloneId = await runOutputTextToSpeech({
    text: "Hola",
    language: "es",
    clonedVoiceId: "invalid voice id with spaces!",
  });
  assert.equal(badCloneId.ok, false);
  assert.equal(badCloneId.status, 400);
  assert.equal(badCloneId.body.error, "clonedVoiceId is not supported");

  let receivedSpeechInput = null;
  const mockOutWav = makeWavSample(1_000).buffer;
  const ttsWithClone = await runOutputTextToSpeech(
    {
      text: "Hola abuela",
      language: "es",
      speechVoice: "marin",
      clonedVoiceId: "fish_en_chat_1",
    },
    {
      generateSpeechImpl: async (input) => {
        receivedSpeechInput = input;
        return mockOutWav;
      },
    },
  );
  assert.equal(ttsWithClone.ok, true);
  assert.equal(receivedSpeechInput.clonedVoiceId, "fish_en_chat_1");

  // Vercel handler api/speech/clone.ts checks (OPTIONS, GET 405, POST JSON)
  const optionsResp = await speechCloneHandler.fetch(
    new Request("https://audit.invalid/api/speech/clone", { method: "OPTIONS" }),
  );
  assert.equal(optionsResp.status, 204);

  const getResp = await speechCloneHandler.fetch(
    new Request("https://audit.invalid/api/speech/clone", { method: "GET" }),
  );
  assert.equal(getResp.status, 405);

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

  // 7. Pure-TS multi-rate / stereo PCM WAV normalization in prepareVoiceReference (no ffmpeg required for any PCM WAV)
  const stereo24kPcm = Buffer.alloc(24000 * 2 * 2 * 6); // 6000ms stereo 24kHz 16-bit
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
  assert.equal(prepared24k.durationMs, 6_000);

  // 8. Inline reference compaction to 24kHz / max 15s for fast MessagePack zero-shot synthesis
  assert.equal(INLINE_VOICE_CLONE_SAMPLE_RATE, 24_000);
  assert.equal(INLINE_VOICE_CLONE_MAX_DURATION_MS, 15_000);
  const long44kWav = makeWavSample(25_000, "long-25s.wav");
  const compactedInlineWav = normalizeWavToSampleRateAndMaxDuration(
    long44kWav.buffer,
    INLINE_VOICE_CLONE_SAMPLE_RATE,
    INLINE_VOICE_CLONE_MAX_DURATION_MS,
  );
  const parsedCompacted = parsePcmWav(compactedInlineWav);
  assert.equal(parsedCompacted.sampleRate, 24_000);
  assert.equal(parsedCompacted.channels, 1);
  assert.equal(parsedCompacted.durationMs, 15_000);
  assert.ok(compactedInlineWav.length < long44kWav.buffer.length / 2);

  // 9. Normalized romanized Persian for Fish Audio TTS & pronunciation guide punctuation preservation
  assert.equal(
    normalizeRomanizedPronunciationForFishTts("aa-YAA be KO-mak ni-YAAZ daa-REED؟"),
    "aayaa be komak niyaaz daareed?",
  );
  assert.equal(
    normalizeRomanizedPronunciationForFishTts("sa-LAM، ma-MAAN bo-ZORG!"),
    "salam, mamaan bozorg!",
  );
  assert.equal(
    normalizeRomanizedPronunciationForFishTts("سلام مامان بزرگ"),
    "",
  );

  const persian = getSupportedTtsLanguage("fa");
  let fishPersianText = "";
  const mockFaOut = makeWavSample(1_200, "fa-out.wav");
  await generateFishClonedSpeech(
    {
      text: "آیا به کمک نیاز دارید؟",
      pronunciationText: "aa-YAA be KO-mak ni-YAAZ daa-REED؟",
      targetLanguage: persian,
      clonedVoiceId: "fish_voice_en_chat_fa",
    },
    {
      apiKey: "test-fish-key",
      gatewayApiKey: "test-gateway-key",
      generateSpeechImpl: async (args) => {
        fishPersianText = args.text;
        return { audio: { uint8Array: new Uint8Array(mockFaOut.buffer) } };
      },
    },
  );
  assert.equal(fishPersianText, "aayaa be komak niyaaz daareed?");

  // Fallback to OpenAI TTS must still receive the original Persian script, not romanization
  let openAiFallbackText = "";
  await generateSpeech(
    {
      text: "آیا به کمک نیاز دارید؟",
      pronunciationText: "aa-YAA be KO-mak ni-YAAZ daa-REED؟",
      targetLanguage: persian,
      clonedVoiceId: "fish_voice_en_chat_fa",
      speechVoice: "marin",
    },
    {
      generateFishClonedSpeechImpl: async () => {
        throw new Error("Simulated Fish outage");
      },
      generateOpenAiSpeechImpl: async (opts) => {
        openAiFallbackText = opts.text;
        return mockFaOut.buffer;
      },
    },
  );
  assert.equal(openAiFallbackText, "آیا به کمک نیاز دارید؟");

  // Pronunciation guide validator must NOT discard Latin guides that contain Persian punctuation (؟, ،, ؛)
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

console.log("PASS Task 1 & Task 2: 10s audio qualification, WAV merging, Fish Audio clone creation, Vercel AI Gateway speech synthesis, and /speech/clone + /speech/output endpoints");
