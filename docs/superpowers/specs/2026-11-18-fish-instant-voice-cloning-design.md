# Chat-Scoped 10-Second Instant Voice Cloning (Fish Audio via Vercel AI Gateway) Design

**Date:** 2026-11-18
**Branch:** `feat/fish-instant-voice-cloning` (based on `feat/expo-mobile-sqlite`)
**Targets:** Backend (`src/`, `api/`), Web App (`client/`), and Android APK (`mobile/`)

## Intent & Why

StringPhone's core mission is *"Talk to your grandma... Even if you don't speak her language."* When two people converse across languages in a StringPhone chat (`Chat`, `Single`, or two-way `Conversation` mode), hearing the translated speech in the speaker's own voice rather than a generic preset voice makes the conversation feel personal and immediate.

However, instant voice cloning from ultra-short audio fragments (< 10 seconds) degrades voice quality and stability, and reusing a voice clone outside the chat where it was spoken violates user expectations when different people share a device or start a new conversation.

The goal is to add **chat-scoped, per-language instant voice cloning using Fish Audio (`fish-audio/s2.1-pro`) routed through Vercel AI Gateway** for both the **Web App (`client/`)** and the **Android APK (`mobile/`)** with the following exact behavior:
1. **10-Second Threshold (`10_000 ms`):** Instant voice cloning for a spoken language in a chat only happens once there is at least 10 seconds of recorded source audio for that spoken language in that chat:
   - Either a **single recorded audio sample** from that speaker/language is `>= 10 seconds` (`>= 10_000 ms`) long, **or**
   - **Multiple recorded audio samples** from that speaker/language in that chat can be **merged** to make `10+ seconds` (`>= 10_000 ms`).
2. **Default to Original Below 10 Seconds:** Until either 10-second requirement is met for that spoken language in that chat (or if Fish Audio / AI Gateway is not configured or fails at runtime), TTS speech synthesis defaults to the original OpenAI TTS voice (`gpt-4o-mini-tts` with the user's selected `marin` / `onyx` voice).
3. **One Clone Per Spoken Language, Saved to That Chat Only:** Each language spoken (`sourceLanguage`) in a chat gets its own voice clone created from the audio samples spoken in that language in that chat. The resulting `clonedVoiceId` is persisted strictly on that chat (`conversationId` + `languageCode`) and is never shared with other chats or Phrasebook cards outside that chat.

## Goals, Non-Goals & Anti-Goals

### Goals
1. **10-Second Audio Qualification & Multi-Sample Merging:**
   - Measure and normalize candidate voice recordings (`audio/webm`, `audio/mp4` / `m4a`, `audio/wav`, `audio/mpeg`, `audio/ogg`) into canonical `44100 Hz, 16-bit mono PCM WAV` buffers (`src/services/prepareVoiceReference.ts`).
   - If a single sample for `(conversationId, languageCode)` is `>= 10_000 ms`, use that sample (`mode: 'single'`).
   - Otherwise, merge multiple distinct samples for `(conversationId, languageCode)` in that chat by concatenating their `44100 Hz 16-bit mono PCM` data chunks (`mode: 'merged'`).
   - Only create a clone when the single or merged WAV duration is `>= 10_000 ms` (capped at `60_000 ms` max reference length).
2. **Fish Audio Clone Creation + Vercel AI Gateway Speech Synthesis:**
   - Create instant voice clones via `POST https://api.fish.audio/model` (`type=tts`, `train_mode=fast`, `visibility=private`) returning `clonedVoiceId` (`reference_id`).
   - Synthesize cloned speech via the Vercel AI SDK `generateSpeech` (`ai`) routed through **Vercel AI Gateway** (`@ai-sdk/gateway`, model `fish-audio/s2.1-pro`, `outputFormat: 'wav'`, `voice: clonedVoiceId`, `providerOptions.fishAudio.referenceId: clonedVoiceId`, plus request-scoped `providerOptions.gateway.byok` when `FISH_AUDIO_API_KEY` is present).
   - Provide automatic fallback to direct `@ai-sdk/fish-audio` if AI Gateway credentials (`AI_GATEWAY_API_KEY` / `VERCEL_OIDC_TOKEN`) are absent in local dev while `FISH_AUDIO_API_KEY` is present, and automatic fallback to `generateOpenAiSpeech` (`marin` / `onyx`) if neither is configured or if cloning/synthesis fails.
3. **Per-Chat, Per-Language Persistence & Playback on Web App (`client/`):**
   - Store `durationMs` on saved source audio assets in `client/src/localStore.js` and measure recorded blob duration in `useLiveConversationCapture.js` / `StringPhoneApp.jsx`.
   - Store `voiceClones: { [languageCode]: { voiceId, languageCode, totalDurationMs, mode, createdAt } }` per conversation in `localStore.js` (and in-memory/localStore keyed by `conversationId` for signed-in sessions).
   - When a voice turn completes or TTS playback is requested for a message in a chat, check/ensure the clone for `(conversationId, message.sourceLanguageCode)`. If available, pass `clonedVoiceId` to `/api/speech/output` and isolate TTS cache keys by `clonedVoiceId`.
4. **Per-Chat, Per-Language Persistence & Playback on Android APK (`mobile/`):**
   - Store per-chat voice clones in SQLite (`preferences` key `chat.voiceClones.<conversationId>`) in `mobile/src/storage/history.ts`, and remove them atomically when the conversation is deleted in `mobile/src/storage/deletion.ts`.
   - Query distinct available source audio samples for `(conversationId, languageCode)` from `messages` + `message_audio` + `audio_assets`, deduplicating multi-utterance live turns from the same recording capture so a single short recording is never double-counted.
   - Add `readBytes(name)` to `AudioFiles` (`mobile/src/adapters/files.ts`, `mobile/src/storage/audio.ts`) and `requestVoiceClone` (`POST /speech/clone`) + `clonedVoiceId` support in `requestOutputSpeech` (`POST /speech/output`) (`mobile/src/adapters/processingTransport.ts`, `mobile/src/adapters/speech.ts`).
   - Wire `ensureConversationVoiceClone(conversationId, message.source_language)` in `mobile/src/chat/native.ts` (`ensureTranslatedSpeech`, `ensureSourceSpeech`, and after voice turn attachment).

### Non-Goals
- Cloning voices for global user profiles across different chats (clones are strictly scoped to the chat where the audio was spoken).
- Cloning voices inside Phrasebook flashcard review (Phrasebook entries remain independent of chat voice clones and use the selected default TTS voice).
- Altering existing SQLite migration versions `1..4` in `mobile/src/storage/migrations.ts` or Postgres table schemas.

### Anti-Goals
- Creating a voice clone when a speaker's total recorded audio for that language in that chat is `< 10_000 ms`.
- Using Speaker A's (`en`) voice clone to speak Speaker B's (`es`) messages before Speaker B has recorded 10+ seconds of `es` audio in that chat.
- Double-counting a single live recording file across multiple realtime utterances from the same capture session.
- Leaking local SQLite `conversationId` values into mobile `/chat/messages/text` or `/speech/output` payloads when `clonedVoiceId` is omitted, or logging non-literal diagnostic arguments in processing routes (`scripts/verify-mobile-processing-audit.mjs`).

## Constraints

- **Fixed-literal diagnostic logging (`scripts/verify-mobile-processing-audit.mjs`):** All `console.error`, `console.warn`, and `console.log` calls in processing routes and `src/server.ts` after `app.post("/chat/messages/text"` must pass a single double-quoted string literal (`"..."`).
- **Mobile adapter allowlist (`scripts/verify-mobile-adapters.mjs`):** `PROCESSING_FIELDS['/speech/output']` must continue stripping `conversationId` and only serialize `clonedVoiceId` when defined (`['text', 'language', 'speechVoice', 'clonedVoiceId']`).
- **Mobile source boundaries (`scripts/verify-mobile-adapters.mjs`):** Files under `mobile/src/` must never import from `client/` or `src/{lib,services,db}/` or reference browser globals (`window.`, `localStorage`, `MediaRecorder`, `RTCPeerConnection`).
- **WAV format compatibility (`mobile/src/adapters/speech.ts`):** `/speech/output` must always return a standard RIFF/WAVE PCM buffer (`Content-Type: audio/wav`) parseable by `parseWav` and `concatenateWavBuffers`.

## Approaches Considered

- **Approach 1 (Selected): Client-Scoped Chat Sample Tracking + Backend WAV Normalization/Merging (`POST /speech/clone`) + Vercel AI Gateway Synthesis (`POST /speech/output` with `clonedVoiceId`)**
  - Both `client/` (IndexedDB `localStore`) and `mobile/` (SQLite `history` + `audio_assets`) already persist every recorded source audio turn with its chat `conversationId`, spoken `sourceLanguage`, and `durationMs`.
  - When a chat's recorded audio for a spoken `sourceLanguage` reaches `>= 10_000 ms` (either one single `>= 10s` recording or multiple recordings totaling `>= 10s`), the client sends the qualifying sample(s) to `POST /speech/clone`.
  - The backend decodes/normalizes the sample(s) to `44100 Hz 16-bit mono PCM WAV`, merges them if multiple, verifies the true WAV duration is `>= 10_000 ms`, creates the Fish Audio instant voice clone (`POST https://api.fish.audio/model`), and returns `clonedVoiceId`.
  - The client saves `clonedVoiceId` on that chat for that language (`conversationId` + `languageCode`) and passes `clonedVoiceId` to `POST /speech/output`, which synthesizes WAV audio using `fish-audio/s2.1-pro` via Vercel AI Gateway (`generateSpeech` + `@ai-sdk/gateway`).
  - Trade-off: Adds one focused endpoint (`POST /speech/clone`) while keeping `/speech/output` stateless and preserving mobile's zero-cloud-history architecture.
- **Approach 2 (Rejected): Server-Only Audio Accumulation Keyed by `conversationId`**
  - Fails for the Android APK and guest Web App during live WebRTC turns because `mobile/` records source audio locally and only sends transcript text to `/chat/messages/live-transcript`, and guest/mobile conversation IDs are not stored in Postgres.
- **Approach 3 (Rejected): Inline Zero-Shot Reference Audio in Every `/speech/output` Call**
  - Not supported by Vercel AI Gateway / `@ai-sdk/fish-audio` (`references` requires raw MessagePack directly to Fish Audio, bypassing Vercel AI Gateway).

## Detailed Design

### 1. Backend Audio Normalization, 10s Verification & Merging (`src/services/prepareVoiceReference.ts`)
- `MIN_VOICE_CLONE_DURATION_MS = 10_000` (10 seconds) and `MAX_VOICE_CLONE_DURATION_MS = 60_000` (60 seconds).
- `prepareVoiceReference({ audioBuffer, originalFilename, mimeType })`:
  - If `audioBuffer` is already a valid uncompressed PCM WAV (`RIFF....WAVE`, `audioFormat === 1`), parses its PCM header/data directly (or normalizes via `ffmpeg-static` when sample rate/channels differ) and computes exact `durationMs = Math.round((pcmByteLength / byteRate) * 1000)`.
  - For compressed containers (`webm`, `m4a`, `mp4`, `mp3`, `ogg`, `aac`, `caf`), invokes `ffmpeg-static` (`-vn -ac 1 -ar 44100 -c:a pcm_s16le`) without aggressive silence stripping so natural speech pauses inside a 10-second clip are preserved.
- `selectAndMergeVoiceSamplesForCloning(samples: PreparedVoiceReference[], minDurationMs = MIN_VOICE_CLONE_DURATION_MS)`:
  1. **Single 10s+ sample check:** Scans `samples` (from newest to oldest) for any single sample with `durationMs >= minDurationMs`. If found, trims to at most `MAX_VOICE_CLONE_DURATION_MS` and returns `{ eligible: true, mode: 'single', totalDurationMs, mergedReference, usedSampleCount: 1 }`.
  2. **Multi-sample merge check:** Otherwise accumulates samples in order, concatenating their `44100 Hz 16-bit mono PCM` data chunks into a single RIFF/WAVE buffer (capped at `MAX_VOICE_CLONE_DURATION_MS`). If combined `totalDurationMs >= minDurationMs`, returns `{ eligible: true, mode: 'merged', totalDurationMs, mergedReference, usedSampleCount }`.
  3. **Insufficient (< 10s):** Returns `{ eligible: false, mode: 'insufficient', totalDurationMs, mergedReference: null, usedSampleCount: samples.length }`.

### 2. Backend Fish Audio Clone Creation & Vercel AI Gateway TTS (`src/services/fishVoiceCloning.ts`, `src/services/generateSpeech.ts`)
- `createFishVoiceClone({ mergedReference, languageCode, languageName, conversationScopeId, transcripts })`:
  - Enforces `mergedReference.durationMs >= MIN_VOICE_CLONE_DURATION_MS`.
  - Calls `POST https://api.fish.audio/model` with `Authorization: Bearer <FISH_AUDIO_API_KEY>` and multipart form fields: `type="tts"`, `title`, `description`, `visibility="private"`, `train_mode="fast"`, `enhance_audio_quality="true"`, and `voices` (the single or merged `audio/wav` blob).
  - Extracts and returns `{ voiceId: body._id || body.id, durationMs: mergedReference.durationMs }`.
- `generateFishClonedSpeech({ text, targetLanguage, clonedVoiceId })`:
  - Uses `generateSpeech` from `"ai"` and `createGateway` from `"@ai-sdk/gateway"` with model `gateway.speechModel(process.env.FISH_AUDIO_TTS_MODEL?.trim() || "fish-audio/s2.1-pro")`, `voice: clonedVoiceId`, `outputFormat: "wav"`, and `providerOptions`:
    - `fishAudio: { referenceId: clonedVoiceId, normalizeLoudness: true, latency: "balanced" }`
    - `gateway: { byok: { "fish-audio": [{ apiKey: fishApiKey }] } }` (when `fishApiKey` is set).
  - If AI Gateway auth is not configured in local dev (`!AI_GATEWAY_API_KEY && !VERCEL_OIDC_TOKEN`) while `FISH_AUDIO_API_KEY` is set, falls back to `@ai-sdk/fish-audio` (`createFishAudio({ apiKey: fishApiKey }).speech("s2.1-pro")`).
  - Normalizes the resulting audio bytes into a standard 44-byte header PCM WAV `Buffer` if needed so `mobile/src/adapters/speech.ts` `parseWav` always succeeds.
- `generateSpeech({ text, targetLanguage, speechVoice, clonedVoiceId })`:
  - When `clonedVoiceId` is non-empty, calls `generateFishClonedSpeech`; if Fish Audio / AI Gateway is unconfigured or errors, logs a fixed literal warning and falls back to `generateOpenAiSpeech({ text, language: targetLanguage.name, voice: speechVoice })`.
  - When `clonedVoiceId` is absent/null, calls `generateOpenAiSpeech` directly.

### 3. Backend Endpoints (`POST /speech/clone`, `POST /speech/output`, `POST /chat/messages/voice`)
- `src/lib/runChatVoiceCloning.ts` (`POST /speech/clone` in `src/server.ts` and `api/speech/clone.ts`):
  - Accepts either JSON `{ language, conversationId?, samples: Array<{ base64, mimeType?, filename?, transcript? }> }` or `multipart/form-data` (`language`, `conversationId?`, `samples` file fields).
  - Validates `language` via `getSupportedTtsLanguage(language)` and requires at least 1 non-empty audio sample (max 8 samples, max 3 MB per sample).
  - Prepares each sample via `prepareVoiceReference` and evaluates `selectAndMergeVoiceSamplesForCloning(preparedSamples, 10_000)`.
  - If `< 10_000 ms`, returns HTTP `200` with `{ ok: true, cloned: false, reason: "insufficient_duration", language: supportedLanguage.code, totalDurationMs, minDurationMs: 10000, clonedVoiceId: null }`.
  - If `>= 10_000 ms`, creates the Fish Audio clone (or returns `cloned: false, reason: "provider_unavailable"` if Fish Audio credentials are not configured so callers degrade gracefully to original TTS without user-facing errors), caches `(conversationId, supportedLanguage.code) -> clonedVoiceId` in memory when `conversationId` is supplied, and returns `{ ok: true, cloned: true, language: supportedLanguage.code, clonedVoiceId, mode, totalDurationMs, usedSampleCount }`.
- `src/lib/runOutputTextToSpeech.ts` (`POST /speech/output`):
  - Accepts optional `clonedVoiceId?: unknown` (validated as a non-empty string up to 128 chars matching `/^[a-zA-Z0-9_-]+$/` when provided) and passes it to `generateSpeech`.

### 4. Web App Integration (`client/src/localStore.js`, `client/src/chatApi.js`, `client/src/components/live/useLiveConversationCapture.js`, `client/src/StringPhoneApp.jsx`)
- `client/src/localStore.js`:
  - `saveAudioAsset(blob, id, metadata = {})` stores `durationMs: Number.isFinite(metadata.durationMs) && metadata.durationMs > 0 ? Math.round(metadata.durationMs) : null` and `captureGroupId: metadata.captureGroupId || null`.
  - Conversation records store `voiceClones: { [languageCode]: { voiceId, languageCode, totalDurationMs, mode, createdAt } }` (plus a fallback `chatVoiceClones` map in `prefsStorage` / memory for signed-in Postgres `conversationId`s so signed-in chats also have chat-scoped voice clones).
  - `getChatVoiceClone(conversationId, languageCode)`, `getChatVoiceClones(conversationId)`, `setChatVoiceClone(conversationId, languageCode, cloneData)`:
    - `setChatVoiceClone` enforces `totalDurationMs >= 10_000`, saves the clone under `(conversationId, languageCode)` only, and invalidates cached non-cloned `ttsCache` entries for messages in `conversationId` whose `sourceLanguageCode === languageCode`.
  - `collectEligibleCloneAudioSamples(conversationId, languageCode, minDurationMs = 10_000)`:
    - Collects all messages in `conversationId` with `sourceLanguageCode === languageCode` and a valid `sourceAudioId` in `audioAssets`.
    - Deduplicates by `audioId` / `captureGroupId`.
    - Returns `{ eligible: true, mode: 'single', totalDurationMs, samples: [singleSample] }` if any single sample has `durationMs >= 10_000`; `{ eligible: true, mode: 'merged', totalDurationMs, samples }` if multiple samples sum to `>= 10_000`; or `{ eligible: false, mode: 'insufficient', totalDurationMs, samples: [] }` if `< 10_000`.
- `client/src/components/live/useLiveConversationCapture.js`:
  - Tracks `segmentRecorderStartedAtRef.current = performance.now()` when `MediaRecorder` starts and attaches `durationMs` to the resulting `audioBlob` in `stopSegmentAudioRecording()`.
- `client/src/chatApi.js` & `client/src/StringPhoneApp.jsx`:
  - Adds `requestChatVoiceClone({ conversationId, language, samples, authFetch, signal })` (`POST /api/speech/clone`) and passes optional `clonedVoiceId` in `fetchOutputSpeech` (`POST /api/speech/output`).
  - Adds `measureAudioBlobDurationMs(blob, fallbackDurationMs)` using WAV header / `AudioContext.decodeAudioData` with fallback to `blob.durationMs || fallbackDurationMs`.
  - Whenever a voice recording is saved in `sendVoiceMessage` or `submitLiveConversationTranscript`, saves `durationMs` on the audio asset and triggers `ensureChatLanguageVoiceClone(activeChatId, sourceLanguageCode)` (deduplicated per `${activeChatId}:${sourceLanguageCode}`).
  - In `playGeneratedSpeech`, when playing TTS for a message in the active chat (`ownerKind === "message"`), resolves the message's `sourceLanguageCode`, awaits `ensureChatLanguageVoiceClone(activeChatId, messageSourceLanguageCode)`, and passes `clonedVoiceId` (if unlocked for that spoken language in that chat) to `fetchOutputSpeech`.

### 5. Android APK Integration (`mobile/src/`)
- `mobile/src/storage/audio.ts` & `mobile/src/adapters/files.ts`:
  - Add optional `readBytes?(name: string): Promise<Uint8Array | null>` to `AudioFiles` and `readBytes(owner: AudioOwner)` to `createAudioStorage`.
- `mobile/src/storage/history.ts` & `mobile/src/storage/deletion.ts`:
  - Add `getConversationVoiceClone(conversationId, languageCode)`, `getConversationVoiceClones(conversationId)`, `setConversationVoiceClone(conversationId, { languageCode, voiceId, totalDurationMs, mode })`, and `collectEligibleVoiceCloneSamples(conversationId, languageCode, minDurationMs = 10_000)` to `createHistoryRepository`.
  - Store per-chat clones in `preferences` under key `chat.voiceClones.${conversationId}` (preserving SQLite `HISTORY_SCHEMA_VERSION = 4`), verifying the conversation exists in `conversations`.
  - When `setConversationVoiceClone` saves a clone for `(conversationId, languageCode)`, delete any cached generated TTS links in `message_audio` (`role = 'translated'`, and `role = 'source'` only where `input_kind = 'text'`) for messages in `conversationId` with `source_language = languageCode` so subsequent playback generates speech with the cloned voice.
  - In `collectEligibleVoiceCloneSamples`, deduplicate messages that share the same live recording capture session (`live_<captureId>_<itemId>`) or `audio_id` so one physical recording is never counted multiple times.
  - In `mobile/src/storage/deletion.ts`, delete `preferences` key `chat.voiceClones.${target.id}` inside the conversation delete transaction.
- `mobile/src/adapters/processingTransport.ts`, `mobile/src/adapters/speech.ts`, `mobile/src/adapters/api.ts`:
  - Update `PROCESSING_FIELDS` in `processingTransport.ts`:
    - `'/speech/output': ['text', 'language', 'speechVoice', 'clonedVoiceId']` (only serializing `clonedVoiceId` when defined).
  - Add `requestVoiceClone({ language, samples, signal })` in `mobile/src/adapters/speech.ts` posting JSON `{ language, samples: [{ base64, mimeType, filename, durationMs }] }` to `/speech/clone`, and accept optional `clonedVoiceId?: string` in `OutputSpeechRequest` (`requestOutputSpeech`).
- `mobile/src/chat/native.ts`:
  - Implement `ensureConversationVoiceClone(conversationId, languageCode)` (with an in-flight deduplication map keyed by `${conversationId}::${languageCode}`):
    1. Checks `historySession.getConversationVoiceClone(conversationId, languageCode)` -> returns `clone.voiceId` if already saved.
    2. Calls `historySession.collectEligibleVoiceCloneSamples(conversationId, languageCode, 10_000)` -> if `!eligible` (`< 10_000 ms`), returns `null`.
    3. Reads bytes for each qualifying sample via `audioSession.readBytes({ kind: 'message', id: sample.messageId, role: 'source' })`, encodes to base64, and calls `requestVoiceClone({ language: languageCode, samples })`.
    4. If `result.cloned && result.clonedVoiceId`, saves via `historySession.setConversationVoiceClone(conversationId, ...)` and returns `result.clonedVoiceId`; otherwise returns `null`.
  - In `ensureSourceSpeech(messageId, speechVoice)` and `ensureTranslatedSpeech(messageId, speechVoice)`, call `const clonedVoiceId = await ensureConversationVoiceClone(message.conversation_id, message.source_language)` and pass `clonedVoiceId` to `requestOutputSpeech`.
  - When a voice recording is saved/attached in `controller.ts` / `useLiveTurnFlow.ts`, trigger `ensureConversationVoiceClone` in the background so the clone is ready even before the user taps Play.
