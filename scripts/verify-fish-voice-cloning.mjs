import assert from "node:assert/strict";
import { getSupportedTtsLanguage } from "../src/lib/languages.ts";
import {
  MIN_VOICE_CLONE_DURATION_MS,
  MAX_VOICE_CLONE_DURATION_MS,
  createCanonicalPcmWavBuffer,
  getWavDurationMs,
  parsePcmWav,
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
  assert.equal(gatewayCallArgs.text, "Hola desde el clon de voz");
  assert.equal(gatewayCallArgs.voice, "fish_voice_es_chat_abc");
  assert.equal(gatewayCallArgs.outputFormat, "wav");
  const providerOpts = gatewayCallArgs.providerOptions;
  assert.equal(providerOpts.fishAudio.referenceId, "fish_voice_es_chat_abc");
  assert.equal(providerOpts.fishAudio.latency, "normal");
  assert.equal(providerOpts.fishAudio.normalize, true);
  assert.equal(providerOpts.fishAudio.temperature, 0.4);
  assert.equal(providerOpts.fishAudio.topP, 0.3);
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
}

console.log("PASS Task 1 & Task 2: 10s audio qualification, WAV merging, Fish Audio clone creation, Vercel AI Gateway speech synthesis, and /speech/clone + /speech/output endpoints");
