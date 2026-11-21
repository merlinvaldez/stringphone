import assert from "node:assert/strict";
import {
  MAX_LIVE_LISTEN_AUDIO_BYTES,
  runLiveListenChunk,
} from "../src/lib/runLiveListenChunk.ts";
import {
  MISTRAL_VOXTRAL_DEFAULT_TRANSCRIBE_MODEL,
  transcribeWithVoxtral,
} from "../src/services/transcribeVoxtral.ts";
import liveListenHandler from "../api/chat/messages/live-listen.ts";

// 1. transcribeWithVoxtral: AI Gateway model selection, diarize, segment timestamps, omitted language, segment merge
{
  await assert.rejects(
    transcribeWithVoxtral(
      { audioBuffer: Buffer.from("audio"), filename: "chunk.webm" },
      { gatewayApiKey: null, oidcToken: null },
    ),
    /Vercel AI Gateway is not configured/i,
  );

  let capturedCall = null;
  let capturedModelSlug = "";
  const voxtralResult = await transcribeWithVoxtral(
    {
      audioBuffer: Buffer.from("wav-bytes"),
      filename: "chunk.webm",
      contextBias: ["Grandma", "Grandma", "StringPhone", "   "],
    },
    {
      gatewayApiKey: "test-gw-key",
      createGatewayImpl: () => ({
        transcriptionModel(slug) {
          capturedModelSlug = slug;
          return { provider: "gateway", modelId: slug };
        },
      }),
      transcribeImpl: async (options) => {
        capturedCall = options;
        return {
          text: "¿Cómo estás? Bien. 元気ですか？",
          language: "es",
          durationInSeconds: 5.4,
          segments: [
            { text: "¿Cómo estás?", startSecond: 0.0, endSecond: 1.1 },
            { text: "Muy bien.", startSecond: 1.3, endSecond: 2.0 },
            { text: "...", startSecond: 2.1, endSecond: 2.2 },
            { text: "元気ですか？", startSecond: 2.5, endSecond: 4.1 },
          ],
          providerMetadata: {
            mistral: {
              segments: [
                { speaker_id: "speaker_0", language: "es", text: "¿Cómo estás?", start: 0.0, end: 1.1 },
                { speaker_id: "speaker_0", language: "es", text: "Muy bien.", start: 1.3, end: 2.0 },
                { speaker_id: "speaker_0", language: "es", text: "...", start: 2.1, end: 2.2 },
                { speaker_id: "speaker_1", language: "ja", text: "元気ですか？", start: 2.5, end: 4.1 },
              ],
            },
          },
        };
      },
    },
  );

  assert.equal(capturedModelSlug, MISTRAL_VOXTRAL_DEFAULT_TRANSCRIBE_MODEL);
  assert.equal(voxtralResult.model, "mistral/voxtral-mini-transcribe-3");
  assert.ok(capturedCall);
  assert.equal(capturedCall.providerOptions.mistral.diarize, true);
  assert.deepEqual(capturedCall.providerOptions.mistral.timestampGranularities, ["segment"]);
  assert.equal(capturedCall.providerOptions.mistral.returnLanguage, true);
  assert.deepEqual(capturedCall.providerOptions.mistral.contextBias, ["Grandma", "StringPhone"]);
  assert.equal(
    "language" in capturedCall.providerOptions.mistral,
    false,
    "language must be omitted so Voxtral auto-detects across 50+ languages",
  );
  assert.equal(voxtralResult.distinctSpeakerCount, 2);
  assert.equal(voxtralResult.segments.length, 2, "Adjacent same-speaker < 0.8s gap must merge and non-speech must drop");
  assert.equal(voxtralResult.segments[0].speakerId, "speaker_0");
  assert.equal(voxtralResult.segments[0].text, "¿Cómo estás? Muy bien.");
  assert.equal(voxtralResult.segments[0].languageCode, "es");
  assert.equal(voxtralResult.segments[1].speakerId, "speaker_1");
  assert.equal(voxtralResult.segments[1].languageCode, "ja");

  // Env override via MISTRAL_TRANSCRIBE_MODEL
  const prevModel = process.env.MISTRAL_TRANSCRIBE_MODEL;
  try {
    process.env.MISTRAL_TRANSCRIBE_MODEL = "mistral/voxtral-small-transcribe-3";
    let overrideSlug = "";
    const overrideRes = await transcribeWithVoxtral(
      { audioBuffer: Buffer.from("abc"), filename: "small.webm" },
      {
        gatewayApiKey: "test-gw-key",
        createGatewayImpl: () => ({
          transcriptionModel(slug) {
            overrideSlug = slug;
            return { provider: "gateway", modelId: slug };
          },
        }),
        transcribeImpl: async () => ({ text: "Hello", durationInSeconds: 1.0 }),
      },
    );
    assert.equal(overrideSlug, "mistral/voxtral-small-transcribe-3");
    assert.equal(overrideRes.model, "mistral/voxtral-small-transcribe-3");
    assert.equal(overrideRes.distinctSpeakerCount, 1);
  } finally {
    if (prevModel === undefined) delete process.env.MISTRAL_TRANSCRIBE_MODEL;
    else process.env.MISTRAL_TRANSCRIBE_MODEL = prevModel;
  }
}

// 2. runLiveListenChunk validation, 3-language open multilingual handling, voice-clone guard & DB persistence
{
  const audioFile = { buffer: Buffer.from("webm-bytes"), filename: "chunk.webm", mimeType: "audio/webm" };

  const badLang = await runLiveListenChunk({ listenerLanguage: "xx", sourceAudioFile: audioFile });
  assert.equal(badLang.ok, false);
  assert.equal(badLang.status, 400);
  assert.equal(badLang.body.error, "listenerLanguage is not supported");

  const missingAudio = await runLiveListenChunk({ listenerLanguage: "en" });
  assert.equal(missingAudio.ok, false);
  assert.equal(missingAudio.status, 400);
  assert.equal(missingAudio.body.error, "sourceAudio file is required");

  const oversized = await runLiveListenChunk({
    listenerLanguage: "en",
    sourceAudioFile: {
      buffer: Buffer.alloc(MAX_LIVE_LISTEN_AUDIO_BYTES + 1, 1),
      filename: "huge.webm",
    },
  });
  assert.equal(oversized.ok, false);
  assert.equal(oversized.status, 400);
  assert.match(String(oversized.body.error), /3 MB/);

  const noSpeech = await runLiveListenChunk(
    { listenerLanguage: "en", sourceAudioFile: audioFile },
    {
      transcribeWithVoxtralImpl: async () => ({
        text: "",
        detectedLanguage: "",
        segments: [],
        distinctSpeakerCount: 0,
        durationInSeconds: 0.4,
        model: MISTRAL_VOXTRAL_DEFAULT_TRANSCRIBE_MODEL,
      }),
    },
  );
  assert.equal(noSpeech.ok, false);
  assert.equal(noSpeech.status, 422);
  assert.equal(noSpeech.body.error, "No speech was detected");

  // Open 3-language chunk (es + ja + en) with listenerLanguage="en" and multi-speaker diarization
  const openAiCalls = [];
  const dbCalls = [];
  const multiResult = await runLiveListenChunk(
    {
      listenerLanguage: "en",
      theirLanguage: "es",
      chunkId: "chunk-1",
      sourceAudioFile: audioFile,
    },
    {
      transcribeWithVoxtralImpl: async () => ({
        text: "¿Cómo estás? 元気ですか？ I am doing great.",
        detectedLanguage: "es",
        distinctSpeakerCount: 2,
        durationInSeconds: 5.5,
        model: MISTRAL_VOXTRAL_DEFAULT_TRANSCRIBE_MODEL,
        segments: [
          { speakerId: "speaker_0", text: "¿Cómo estás?", languageCode: "es", startSecond: 0, endSecond: 1.5 },
          { speakerId: "speaker_1", text: "元気ですか？", languageCode: "ja", startSecond: 1.6, endSecond: 3.2 },
          { speakerId: "speaker_0", text: "I am doing great.", languageCode: "en", startSecond: 3.4, endSecond: 5.1 },
        ],
      }),
      createOpenAiResponseImpl: async (args) => {
        openAiCalls.push(args);
        if (args.input.includes("¿Cómo estás?")) {
          return JSON.stringify({
            detectedLanguageCode: "es",
            detectedLanguageName: "Spanish",
            isListenerLanguage: false,
            translatedText: "How are you?",
          });
        }
        if (args.input.includes("元気ですか？")) {
          return JSON.stringify({
            detectedLanguageCode: "ja",
            detectedLanguageName: "Japanese",
            isListenerLanguage: false,
            translatedText: "How are you feeling?",
          });
        }
        return JSON.stringify({
          detectedLanguageCode: "en",
          detectedLanguageName: "English",
          isListenerLanguage: true,
          translatedText: "Should be cleared",
        });
      },
      generatePronunciationGuidanceImpl: async ({ sourceLanguageCode }) => {
        assert.equal(sourceLanguageCode, "ja");
        return { originalPronunciation: "genki desu ka?", translatedPronunciation: "" };
      },
      getConversationImpl: async () => {
        dbCalls.push("getConversation");
        return null;
      },
      createMessageImpl: async () => {
        dbCalls.push("createMessage");
        return { id: "unexpected" };
      },
    },
  );

  assert.equal(multiResult.ok, true);
  assert.equal(multiResult.segments.length, 3);
  assert.equal(openAiCalls.length, 3, "All segments in multi-speaker chunk confirm via direct OpenAI");
  assert.deepEqual(dbCalls, [], "Omitting conversationId must never call DB");

  const [segEs, segJa, segEn] = multiResult.segments;
  assert.equal(segEs.sender, "partner");
  assert.equal(segEs.translatedText, "How are you?");
  assert.equal(segEs.needsPlayback, true);
  assert.equal(segEs.singleSpeakerAudioEligible, false);

  assert.equal(segJa.sender, "partner");
  assert.equal(segJa.translatedText, "How are you feeling?");
  assert.equal(segJa.originalPronunciation, "genki desu ka?");
  assert.equal(segJa.needsPlayback, true);
  assert.equal(segJa.singleSpeakerAudioEligible, false);

  assert.equal(segEn.sender, "self");
  assert.equal(segEn.translatedText, "", "Same-language segment must clamp translatedText to empty");
  assert.equal(segEn.needsPlayback, false);
  assert.equal(segEn.singleSpeakerAudioEligible, false);

  // Single-speaker listener-language fast path skips OpenAI translation and unlocks voice cloning
  let fastPathOpenAiCalls = 0;
  const savedRows = [];
  let titleRefreshCount = 0;
  const singleListenerResult = await runLiveListenChunk(
    {
      listenerLanguage: "en",
      conversationId: "conv-123",
      userId: 42,
      sourceAudioFile: audioFile,
    },
    {
      transcribeWithVoxtralImpl: async () => ({
        text: "Hello everyone",
        detectedLanguage: "en",
        distinctSpeakerCount: 1,
        durationInSeconds: 2.1,
        model: MISTRAL_VOXTRAL_DEFAULT_TRANSCRIBE_MODEL,
        segments: [
          { speakerId: "speaker_0", text: "Hello everyone", languageCode: "en", startSecond: 0, endSecond: 2.1 },
        ],
      }),
      createOpenAiResponseImpl: async () => {
        fastPathOpenAiCalls += 1;
        return "{}";
      },
      getConversationImpl: async (id, uid) => ({ id, user_id: uid }),
      createMessageImpl: async (row) => {
        savedRows.push(row);
        return { id: `msg-${savedRows.length}` };
      },
      refreshConversationTitleImpl: async () => {
        titleRefreshCount += 1;
        return null;
      },
    },
  );
  assert.equal(fastPathOpenAiCalls, 0, "Single-speaker myLang segment must fast-path skip OpenAI");
  assert.equal(singleListenerResult.ok, true);
  assert.equal(singleListenerResult.segments[0].sender, "self");
  assert.equal(singleListenerResult.segments[0].singleSpeakerAudioEligible, true);
  assert.equal(singleListenerResult.segments[0].savedMessage?.id, "msg-1");
  assert.equal(savedRows[0].translatedText, "", "Postgres NOT NULL requires empty string for same-language row");
  assert.equal(titleRefreshCount, 1);

  // Preview chunks skip pronunciation & Postgres and set singleSpeakerAudioEligible: false
  let previewPronCalls = 0;
  let previewDbCalls = 0;
  const previewResult = await runLiveListenChunk(
    {
      listenerLanguage: "en",
      isPreview: "true",
      conversationId: "conv-123",
      userId: 42,
      sourceAudioFile: audioFile,
    },
    {
      transcribeWithVoxtralImpl: async () => ({
        text: "こんにちは",
        detectedLanguage: "ja",
        distinctSpeakerCount: 1,
        durationInSeconds: 1.2,
        model: MISTRAL_VOXTRAL_DEFAULT_TRANSCRIBE_MODEL,
        segments: [
          { speakerId: "speaker_0", text: "こんにちは", languageCode: "ja", startSecond: 0, endSecond: 1.2 },
        ],
      }),
      createOpenAiResponseImpl: async () =>
        JSON.stringify({
          detectedLanguageCode: "ja",
          detectedLanguageName: "Japanese",
          isListenerLanguage: false,
          translatedText: "Hello",
        }),
      generatePronunciationGuidanceImpl: async () => {
        previewPronCalls += 1;
        return { originalPronunciation: "konnichiwa", translatedPronunciation: "" };
      },
      getConversationImpl: async () => ({ id: "conv-123", user_id: 42 }),
      createMessageImpl: async () => {
        previewDbCalls += 1;
        return { id: "msg-preview" };
      },
    },
  );
  assert.equal(previewResult.ok, true);
  assert.equal(previewResult.isPreview, true);
  assert.equal(previewResult.segments[0].singleSpeakerAudioEligible, false);
  assert.equal(previewPronCalls, 0);
  assert.equal(previewDbCalls, 0);

  // Unauthorized conversationId returns 401
  const unauthRes = await runLiveListenChunk({
    listenerLanguage: "en",
    conversationId: "conv-123",
    userId: null,
    sourceAudioFile: audioFile,
  });
  assert.equal(unauthRes.ok, false);
  assert.equal(unauthRes.status, 401);

  // OpenAI input always includes literal "JSON" for Responses API json_object requirement
  assert.ok(
    openAiCalls.every((call) => /\bjson\b/i.test(call.input)),
    "Every jsonObject OpenAI call must include the word JSON in input",
  );

  // Voxtral optional providerOptions rejection falls back to minimal request cleanly
  let fallbackAttempts = 0;
  const fallbackRes = await transcribeWithVoxtral(
    { audioBuffer: Buffer.from("wav-bytes"), filename: "chunk.wav", mimeType: "audio/wav" },
    {
      gatewayApiKey: "test-gw-key",
      transcribeImpl: async (options) => {
        fallbackAttempts += 1;
        if (options.providerOptions?.mistral) {
          throw new Error("Unsupported provider option");
        }
        return { text: "Hola amigo", language: "es", durationInSeconds: 1.5 };
      },
    },
  );
  assert.equal(fallbackAttempts, 3);
  assert.equal(fallbackRes.text, "Hola amigo");
  assert.equal(fallbackRes.detectedLanguage, "es");

  // Stage-specific non-sensitive errors for missing credentials or upstream failures
  const missingGwRes = await runLiveListenChunk(
    { listenerLanguage: "en", sourceAudioFile: audioFile },
    {
      transcribeWithVoxtralImpl: async () => {
        throw new Error("Vercel AI Gateway is not configured.");
      },
    },
  );
  assert.equal(missingGwRes.ok, false);
  assert.equal(missingGwRes.status, 503);
  assert.equal(missingGwRes.body.stage, "transcription");

  const openAiFailRes = await runLiveListenChunk(
    { listenerLanguage: "en", sourceAudioFile: audioFile },
    {
      transcribeWithVoxtralImpl: async () => ({
        text: "Hola",
        detectedLanguage: "es",
        distinctSpeakerCount: 1,
        durationInSeconds: 1.0,
        model: MISTRAL_VOXTRAL_DEFAULT_TRANSCRIBE_MODEL,
        segments: [
          { speakerId: "speaker_0", text: "Hola", languageCode: "es", startSecond: 0, endSecond: 1.0 },
        ],
      }),
      createOpenAiResponseImpl: async () => {
        throw new Error("Sensitive upstream error");
      },
    },
  );
  assert.equal(openAiFailRes.ok, false);
  assert.equal(openAiFailRes.status, 502);
  assert.equal(openAiFailRes.body.stage, "translation");
}

// 3. Vercel handler OPTIONS / GET / POST validation checks
{
  const optRes = await liveListenHandler.fetch(
    new Request("https://audit.invalid/chat/messages/live-listen", { method: "OPTIONS" }),
  );
  assert.equal(optRes.status, 204);

  const getRes = await liveListenHandler.fetch(
    new Request("https://audit.invalid/chat/messages/live-listen", { method: "GET" }),
  );
  assert.equal(getRes.status, 405);

  const form = new FormData();
  form.append("listenerLanguage", "en");
  const missingFileRes = await liveListenHandler.fetch(
    new Request("https://audit.invalid/chat/messages/live-listen", {
      method: "POST",
      body: form,
    }),
  );
  assert.equal(missingFileRes.status, 400);
  assert.equal((await missingFileRes.json()).error, "sourceAudio file is required");
}

console.log(
  "PASS Voxtral Transcribe 3 via AI Gateway, direct OpenAI multilingual live-listen orchestration, and /chat/messages/live-listen route",
);
