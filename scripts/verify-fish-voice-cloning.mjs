import assert from "node:assert/strict";
import { getSupportedTtsLanguage } from "../src/lib/languages.ts";
import {
  MIN_VOICE_CLONE_DURATION_MS,
  MAX_VOICE_CLONE_DURATION_MS,
  createCanonicalPcmWavBuffer,
  getWavDurationMs,
  concatenatePcmWavBuffers,
  prepareVoiceReference,
  selectAndMergeVoiceSamplesForCloning,
} from "../src/services/prepareVoiceReference.ts";
import {
  FISH_AUDIO_DEFAULT_GATEWAY_MODEL,
  createFishVoiceClone,
  generateFishClonedSpeech,
} from "../src/services/fishVoiceCloning.ts";
import { generateSpeech } from "../src/services/generateSpeech.ts";

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
  assert.equal(capturedFormData.get("visibility"), "private");
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
  assert.equal(gatewayCallArgs.text, "Hola desde el clon de voz");
  assert.equal(gatewayCallArgs.voice, "fish_voice_es_chat_abc");
  assert.equal(gatewayCallArgs.outputFormat, "wav");
  const providerOpts = gatewayCallArgs.providerOptions;
  assert.equal(providerOpts.fishAudio.referenceId, "fish_voice_es_chat_abc");
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

console.log("PASS Task 1: 10s audio qualification, WAV merging, Fish Audio clone creation, and Vercel AI Gateway speech synthesis");
