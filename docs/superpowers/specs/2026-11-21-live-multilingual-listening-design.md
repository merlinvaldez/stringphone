# Live Multilingual Conversation Listening (Voxtral Transcribe 3 via Vercel AI Gateway + Direct OpenAI Translation) Design

**Date:** 2026-11-21
**Targets:** Backend (`src/`, `api/`), Web App (`client/`), and Android APK (`mobile/`)

## Intent & Why

StringPhone's existing live capture workflow ([docs/live-transcription-mode-feature-spec.md](../../live-transcription-mode-feature-spec.md)) is designed for short, turn-taking voice inputs: it opens an OpenAI WebRTC session (`gpt-live-transcribe`) locked to a single 2-language pair, cuts off at 30 seconds (`MAX_RECORDING_TIME = 30`), never auto-plays translated speech, and cannot cleanly separate multiple speakers or arbitrary third languages.

Users also want to **listen to a live multilingual conversation as it is happening**—in person, across a room, or with 2+ speakers switching across languages without tapping turn buttons—so they can **read the conversation in real time and play/hear translations sequentially as it happens** using StringPhone's existing UI elements.

**Confirmed Provider & Infrastructure Split:**
1. **Speech-to-Text & Diarization — Voxtral Transcribe 3 via Vercel AI Gateway:** Use Vercel AI SDK (`ai` `transcribe`) + `@ai-sdk/gateway` (`createGateway().transcriptionModel(...)`) targeting `mistral/voxtral-mini-transcribe-3` (configurable via `MISTRAL_TRANSCRIBE_MODEL` to e.g. `mistral/voxtral-small-transcribe-3`), with `diarize: true`, `timestampGranularities: ['segment']`, and `language` omitted for open multilingual auto-detection across 50+ languages.
2. **Language Confirmation, Translation & Pronunciation — Existing Direct OpenAI Endpoint (Not Gateway):** Route translation and cross-script pronunciation exclusively through StringPhone's existing direct OpenAI helpers (`createOpenAiResponse` in `src/lib/openai.ts` and `generatePronunciationGuidance` in `src/services/generatePronunciationGuidance.ts` using `OPENAI_API_KEY`), keeping text translation off the Vercel AI Gateway.
3. **Speech Synthesis (Live Playback) — Existing `POST /speech/output`:** Reuse `runOutputTextToSpeech` (`src/lib/runOutputTextToSpeech.ts`) -> `generateSpeech` (`src/services/generateSpeech.ts`), which already synthesizes with `mistral/voxtral-mini-tts-3` via Vercel AI Gateway when a chat-scoped 10-second voice clone is unlocked (`src/services/mistralVoiceCloning.ts`) and falls back to `generateOpenAiSpeech` (`marin` / `onyx`).

**Why VAD-Chunked HTTP with `mistral/voxtral-mini-transcribe-3` / `small` instead of WebSocket `voxtral-mini-transcribe-realtime-3`:**
- Vercel AI Gateway does not route Mistral's WebSocket realtime transcription endpoint (`gateway.experimental_transcription.getToken()` supports OpenAI/ElevenLabs/Google/xAI/Microsoft, not Mistral).
- Vercel serverless functions (`vercel.json` `api/**/*.ts`) cannot host persistent WebSocket relay servers.
- Chunked `mistral/voxtral-mini-transcribe-3` / `mistral/voxtral-small-transcribe-3` runs 100% through `@ai-sdk/gateway` on existing Vercel Node functions and gives stronger multi-speaker diarization (`diarize: true`) and 50+ language auto-detection with ~1.1–1.6s chunk STT latency.

## Goals, Non-Goals & Anti-Goals

### Goals
1. **Unhide Existing `Live` (`Radio`) Tab Across Web & Mobile:**
   - Remove `"live"` from `HIDDEN_MODE_IDS` in `client/src/StringPhoneApp.jsx` so the existing `Radio` tab appears in `ModeSwitcher`.
   - Add the `{ route: '/live', labelKey: 'modeLive', icon: 'radio' }` tab in `mobile/src/components/AppShell.tsx` alongside Chat, Single, Conversation, and Phrasebook.
   - Reuse existing UI building blocks: single `myLang` selector (`LanguageSelector` / `LanguagePicker`), `ChatThread` + `MessageBubble` (Web) / `FlatList` + `MessageCard` (Mobile), `HistorySheet` / `ChatHistorySidebar`, and `FloatingAuthControls` / voice settings popover, paired with a single toggled Listen button (without a second language picker, language-switch button, text composer, or waveform animation) and a compact auto-play mute toggle.
2. **Open Multilingual Auto-Detection into `myLang`:**
   - Voxtral Transcribe 3 runs without a forced `language` parameter so speakers can switch across any of Voxtral's 50+ supported languages freely.
   - Foreign-language utterances (`detectedLanguage !== myLang`) translate into `myLang` via the existing direct OpenAI endpoint and render as partner (`sky`) bubbles with `needsPlayback: true`.
   - Listener-language utterances (`detectedLanguage === myLang`) render as self (`emerald`) bubbles as-is (`translatedText: ""`, `needsPlayback: false`) without wasteful translation or audio echo.
3. **Continuous VAD-Chunked Capture (No 30s Limit):**
   - Keep microphone capture running continuously until the user taps Stop (or navigates away / backgrounds the app).
   - Slice audio automatically on natural pauses (~750ms silence after >= 550ms speech) and force a rolling cut at `MAX_CHUNK_MS = 6000` during uninterrupted speech so live captions and audio never stall during long turns.
   - Optionally send rolling mid-utterance preview snapshots (~2,500ms) while a speaker talks continuously to update the `LiveTranslationDock` / preview card before the final cut lands.
4. **Sequential FIFO Live Audio Playback Queue + Echo-Safe Toggle:**
   - Prefetch translated audio in parallel via existing `POST /speech/output` as soon as a foreign-language segment finalizes.
   - Play translated clips strictly sequentially in FIFO order (never overlapping voices), reflecting active playback state on the corresponding bubble's existing `TextToSpeechButton` / `MessageCard` speaker button.
   - Provide a one-tap live auto-play toggle (`Volume2` / `VolumeX` / `volume-2` / `volume-x`) styled with existing circular audio icon button styles, and automatically gate/pause VAD energy monitoring during local playback in speaker-safe mode to prevent mic feedback loops.
5. **Full History Persistence, Voice Cloning Safety & Cross-Platform Parity:**
   - Share the active conversation with `Chat`, `Single`, and `Conversation` modes (`localStore.js` IndexedDB / Postgres on Web; SQLite `origin_mode: 'chat'` on Mobile).
   - Preserve `Save to Phrasebook`, RTL direction (`ar`, `fa`, `he`), cross-script pronunciation guidance (`requiresPhoneticGuide`), and retryable failed chunks.
   - Mark segments with `singleSpeakerAudioEligible: boolean` (`true` only when the chunk resolved to a single speaker) so multi-speaker diarized audio chunks never contaminate a speaker's 10-second voice clone.

### Non-Goals
- Replacing or modifying the existing OpenAI WebRTC single-turn live flow inside `Chat`, `Single`, or `Conversation` modes.
- Routing text translation or pronunciation generation through Vercel AI Gateway (`createOpenAiResponse` and `generatePronunciationGuidance` remain direct OpenAI calls).
- Standing up a separate stateful WebSocket relay server outside Vercel serverless functions.
- Bumping SQLite `HISTORY_SCHEMA_VERSION = 4` in `mobile/src/storage/migrations.ts` or altering Postgres table schemas (`public.conversations`, `public.messages`).
- Exposing Live mode when a `?join=` shared room session is active on Web (`sharedChatLocked` keeps shared rooms pinned to Chat).

### Anti-Goals
- Translating or auto-playing speech that is already spoken in `myLang`.
- Displaying `"Translation failed."` on same-language (`source_language === target_language`) ready messages in mobile `MessageCard.tsx`.
- Feeding the app's own TTS audio playback back into the microphone for re-transcription (feedback loop).
- Polluting per-language 10-second voice clones with audio chunks containing multiple diarized speakers.
- Violating mobile processing/privacy boundaries (sending local SQLite `conversationId` to server routes, logging non-literal diagnostic strings in audited files, importing web/server code in `mobile/src/`, or leaving any locale in `shared/bundledUiStrings.ts` missing new UI keys).

## Constraints

1. **SQLite `origin_mode` & `HISTORY_SCHEMA_VERSION = 4` (`mobile/src/storage/migrations.ts`):**
   - `conversations.origin_mode` and `messages.origin_mode` enforce `CHECK(origin_mode IN ('chat','single','conversation','room'))`.
   - Live-listen messages on mobile persist into the active conversation with `origin_mode: 'chat'` so no SQLite schema migration is needed and turns appear seamlessly across History and Chat.
2. **Same-Language Ready Messages (`mobile/src/storage/history.ts`, `mobile/src/chat/MessageCard.tsx`, Postgres `public.messages`):**
   - `mobile/src/storage/history.ts` `saveReadyLiveMessage` and `finishLiveDraft` currently require non-empty `translatedText`; they must explicitly allow empty `translatedText` (persisted as `null` in SQLite) when `sourceLanguage === targetLanguage`.
   - `mobile/src/chat/MessageCard.tsx` must omit the translation block (and hide `playTranslated` / `saveToPhrasebook`) on ready messages where `source_language === target_language` and `translated_text` is empty instead of falling back to `strings.translationFailed`.
   - Postgres `public.messages.translated_text` is `NOT NULL` (`supabase/migrations/20260717114154_create_conversations_tables.sql`) and `sender` checks `('self', 'partner')`, so server Postgres persistence stores `""` when `isListenerLanguage` is true.
3. **Fixed-Literal Diagnostic Logging (`scripts/verify-mobile-processing-audit.mjs`):**
   - All `console.error`, `console.warn`, and `console.log` calls in `src/services/transcribeVoxtral.ts`, `src/lib/runLiveListenChunk.ts`, `api/chat/messages/live-listen.ts`, and `src/server.ts` after `app.post("/chat/messages/text"` must pass a single double-quoted string literal (`"..."`).
4. **Mobile Upload, Allowlist & Source Boundaries (`scripts/verify-mobile-adapters.mjs`, `mobile/src/adapters/processingTransport.ts`):**
   - Mobile uploads to `/chat/messages/live-listen` must use Expo FileSystem's multipart uploader (`file.upload`), enforce the `3_000_000` byte upload cap, strip `conversationId` and `userId`, and never reference browser globals (`window.`, `localStorage`, `MediaRecorder`, `document.querySelector`) or import from `client/` or `src/{lib,services,db}/`.
5. **Mobile UI Catalog Completeness (`scripts/check-mobile-ui-catalog.mjs`, `shared/uiStrings.ts`, `shared/bundledUiStrings.ts`):**
   - Every key added to `ENGLISH_UI_STRINGS` in `shared/uiStrings.ts` must exist with valid non-empty strings (and matching `{var}` placeholders) in all 42 non-English locales in `shared/bundledUiStrings.ts`.
6. **Audio Session & Playback Coordination (`mobile/src/adapters/playbackCoordinator.ts`, `scripts/verify-mobile-mic-listening-state.mjs`):**
   - Existing single-turn `Chat`, `Single`, and `Conversation` recording must keep strict mutual exclusion with playback (`isRecording()` blocks `startPlayback()`).
   - Live-listen mode introduces an explicit live-listen session flag on `AudioPlaybackCoordinator` (`setLiveListenActive` / `startLivePlayback`) so sequential FIFO translated audio can play cleanly during an active listening session while pausing recorder VAD metering during local speaker output.

## Approaches Considered

- **Approach 1 (Selected): VAD-Chunked Voxtral Transcribe 3 via Vercel AI Gateway + Direct OpenAI Combined Language-Confirm & Translation + Existing `/speech/output` FIFO Queue**
  - Uses `@ai-sdk/gateway` (`mistral/voxtral-mini-transcribe-3`, optional `mistral/voxtral-small-transcribe-3`) for multilingual ASR + speaker diarization, existing direct OpenAI (`createOpenAiResponse` + `generatePronunciationGuidance`) for translation/pronunciation, and existing `/speech/output` for queued live playback.
  - Fits 100% inside Vercel serverless functions (`api/**/*.ts`) with zero extra infrastructure and reuses all existing StringPhone UI primitives.
  - Trade-off: Chunked HTTP latency (~1.1–1.6s for transcript, ~1.4–2.1s for translation, ~2.0–3.2s for first TTS audio, mitigated by rolling 2.5s preview snapshots into `LiveTranslationDock` and parallel TTS prefetch).
- **Approach 2 (Rejected): Direct Mistral `voxtral-mini-transcribe-realtime-3` WebSockets**
  - Not available through Vercel AI Gateway; requires direct `MISTRAL_API_KEY`, a stateful WebSocket proxy outside Vercel serverless functions, and loses Voxtral batch diarization fidelity.
- **Approach 3 (Rejected): Gateway Streaming STT with Non-Voxtral Models (`openai/gpt-live-transcribe`, `elevenlabs/scribe-v2-realtime`)**
  - Does not use Voxtral Transcribe 3 as requested.

## Detailed Design

### 1. Backend Voxtral Transcribe 3 Service (`src/services/transcribeVoxtral.ts`)

- **Model & Gateway Configuration:**
  - `export const MISTRAL_VOXTRAL_DEFAULT_TRANSCRIBE_MODEL = "mistral/voxtral-mini-transcribe-3";` (overridable via `process.env.MISTRAL_TRANSCRIBE_MODEL?.trim()`, e.g. `"mistral/voxtral-small-transcribe-3"`).
  - Resolve Vercel AI Gateway credentials (`AI_GATEWAY_API_KEY` or `VERCEL_OIDC_TOKEN`) via the same resolution pattern as `src/services/mistralVoiceCloning.ts`. If credentials are absent (and no test `deps.transcribeImpl` is injected), throw `"Vercel AI Gateway is not configured."`.
- **Gateway Call (`transcribeWithVoxtral(input, deps?)`):**
  - Input: `{ audioBuffer: Buffer; filename: string; mimeType?: string; contextBias?: string[] }`.
  - Calls `transcribe` from `"ai"` with `model: gateway.transcriptionModel(modelSlug)`, `audio: input.audioBuffer`, and:
    ```ts
    providerOptions: {
      mistral: {
        diarize: true,
        timestampGranularities: ["segment"],
        ...(sanitizedBias.length > 0 ? { contextBias: sanitizedBias } : {}),
      },
    }
    ```
  - **Explicitly omits `language`** in `providerOptions.mistral` so Voxtral auto-detects across 50+ languages in multilingual conversations.
- **Defensive Segment Normalization & Speaker Merging:**
  - Inspects `result.segments` and `result.providerMetadata?.mistral` (handling varying shapes cleanly for both production responses and mocked unit tests).
  - Normalizes each segment into `{ speakerId: string; text: string; languageCode: string; startSecond: number; endSecond: number }`.
  - Filters empty/whitespace-only or non-speech hallucination artifacts; merges immediately adjacent segments with identical `speakerId` and gap `< 0.8s` unless their detected languages differ.
  - Computes `distinctSpeakerCount` from unique `speakerId`s across normalized segments (defaulting to `1` if segments exist without speaker labels).

### 2. Backend Live-Listen Orchestration (`src/lib/runLiveListenChunk.ts`, `api/chat/messages/live-listen.ts`, `src/server.ts`)

- **Endpoint:** `POST /chat/messages/live-listen` (Express in `src/server.ts` + Vercel handler in `api/chat/messages/live-listen.ts`).
  - Accepts `multipart/form-data`:
    - `listenerLanguage` (required; validated via `getSupportedTtsLanguage`)
    - `sourceAudio` (required file; max `3_000_000` bytes)
    - `theirLanguage` (optional hint for ambiguous language-pair edge cases)
    - `chunkId` (optional client correlation id)
    - `isPreview` (`"true" | "false"`, default `"false"`)
    - `contextBias` (optional JSON array or comma-separated domain/proper-noun bias strings, max 25 items)
    - `conversationId` (optional authenticated Postgres conversation id; never sent by mobile or guest web)
- **Step-by-Step Pipeline in `runLiveListenChunk`:**
  1. **Validate inputs & ownership:** Validate `listenerLanguage`; if `conversationId` is supplied, require authenticated `userId` (`401`) and verify `getConversation(conversationId, userId)` (`404`).
  2. **Transcribe & diarize via Voxtral 3 (Vercel AI Gateway):** Call `transcribeWithVoxtral`. If no speech segments remain (`!segments.length`), return `422` `{ error: "No speech was detected" }` cleanly (ignored silently by live UI).
  3. **Confirm language & translate via Existing Direct OpenAI Endpoint (`src/lib/openai.ts`):**
     - **Fast path:** If a segment has a confident Voxtral `languageCode` matching `listenerLanguage.code` (and `distinctSpeakerCount === 1`), skip OpenAI translation and emit `isListenerLanguage: true`, `translatedText: ""`, `needsPlayback: false`.
     - **Translation path:** Otherwise call `createOpenAiResponse` (using `OPENAI_LIVE_TRANSLATION_MODEL?.trim() || "gpt-4o-mini"`, `jsonObject: true`, `store: false`) with a single structured JSON prompt returning:
       ```json
       {
         "detectedLanguageCode": "ja",
         "detectedLanguageName": "Japanese",
         "isListenerLanguage": false,
         "translatedText": "..."
       }
       ```
       - Handles any of Voxtral's 50+ languages even if a spoken language is outside StringPhone's 43-language `SUPPORTED_TTS_LANGUAGE_OPTIONS`.
       - If OpenAI confirms `isListenerLanguage: true` (for instance, Voxtral mis-tagged a brief English phrase), clamp `translatedText` to `""` and `needsPlayback` to `false`.
  4. **Cross-script pronunciation (`!isPreview` only):** When `!isPreview && !isListenerLanguage`, call `generatePronunciationGuidance` (`src/services/generatePronunciationGuidance.ts`) if `requiresPhoneticGuide(detectedLanguageCode, listenerLanguage.code) || requiresPhoneticGuide(listenerLanguage.code, detectedLanguageCode)`.
  5. **Voice-clone eligibility:** Set `singleSpeakerAudioEligible: !isPreview && distinctSpeakerCount === 1` so only single-speaker finalized chunks can contribute to a speaker's 10s voice clone.
  6. **Optional authenticated Postgres persistence (`!isPreview` + `conversationId` + `userId`):** Save each finalized segment via `createMessage` (`sender: isListenerLanguage ? "self" : "partner"`, `translatedText: isListenerLanguage ? "" : translatedText`, `audioUrl` only for single-speaker chunks or first segment to avoid duplicating raw audio blobs across speakers) and call `refreshConversationTitle`.
- **Response Shape:**
  ```ts
  {
    ok: true,
    chunkId: string,
    isPreview: boolean,
    listenerLanguage: { code: string; label: string },
    segments: Array<{
      segmentId: string;
      speakerId: string;
      sender: "self" | "partner";
      detectedLanguage: { code: string; label: string; isSupportedTts: boolean };
      sourceLanguage: { code: string; label: string };
      targetLanguage: { code: string; label: string };
      transcript: string;
      translatedText: string;
      originalPronunciation: string;
      translatedPronunciation: string;
      startSecond: number;
      endSecond: number;
      needsPlayback: boolean;
      singleSpeakerAudioEligible: boolean;
      savedMessage: { id: string } | null;
    }>
  }
  ```

### 3. Web App Live Mode (`client/`)

- **Navigation & Mode Switcher (`client/src/StringPhoneApp.jsx`):**
  - Remove `"live"` from `HIDDEN_MODE_IDS` (`new Set()`) so `{ id: "live", label: "Live", Icon: Radio }` renders in `ModeSwitcher`. Keep `sharedChatLocked` blocking `"live"` when a `?join=` shared room is active.
- **API Client (`client/src/chatApi.js`):**
  - Add `processLiveListenChunk({ audioBlob, listenerLanguage, theirLanguage, chunkId, isPreview = false, contextBias = [], conversationId = null, authFetch, signal })` posting `FormData` to `${API_BASE_URL}/chat/messages/live-listen`.
- **Continuous VAD Capture Hook (`client/src/components/live/useVoxtralLiveListen.js`):**
  - Requests microphone with `{ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }`.
  - Uses `AudioContext` + `AnalyserNode` (`SPEECH_RMS_THRESHOLD = 0.018`, `MIN_SPEECH_MS = 550`, `SILENCE_FINALIZE_MS = 750`, `MAX_CHUNK_MS = 6000`).
  - **Echo-safe VAD gating:** When `isLocalAudioPlaying && !headphoneMode`, suppresses new speech-start detection so the device speaker does not trigger self-transcription.
  - **Zero-gap rollover:** When silence triggers or `speechDuration >= MAX_CHUNK_MS`, stops the current `MediaRecorder`, immediately starts the next `MediaRecorder` if still listening, attaches `audioBlob.durationMs`, and hands the blob to `onChunkReady`.
  - **Rolling preview (`PREVIEW_INTERVAL_MS = 2500`):** While a single turn stays continuously active past 2.5s without pausing, collects a temporary snapshot blob (`isPreview: true`) to update `LiveTranslationDock` without creating permanent messages.
- **Sequential FIFO Audio Playback Queue (`client/src/components/live/useLiveAudioQueue.js`):**
  - Persists `autoPlayEnabled` preference (`localStorage`, default `true` in Live mode).
  - Maintains a FIFO queue of `{ messageId, text, languageCode, sourceLanguageCode }`.
  - Immediately invokes `prefetchMessageTranslatedSpeech` in parallel when segments arrive (`needsPlayback === true && autoPlayEnabled`).
  - Plays queued items strictly sequentially via `playGeneratedSpeech`, exposes `activePlayingMessageId` and `isLocalAudioPlaying`, and pauses/yields cleanly if the user taps Mute, Stop, or manually plays another bubble.
- **Live Screen UI (`client/src/components/live/LiveListenScreen.jsx`, `client/src/components/chat/MessageBubble.jsx`):**
  - **`LiveListenScreen.jsx`** composes existing UI components:
    1. Minimal top header with History `Menu` button and a single centered `LanguageSelector` for `myLang` (no `theirLang` / lang 2 button and no language-invert button).
    2. `ChatThread` rendering `MessageBubble`s from the shared active conversation (`baseLanguageCode={myLang.code}` so `myLang` utterances tint emerald on the right and foreign utterances tint sky on the left; `MessageBubble` skips the empty translation block when `message.sourceLanguageCode === message.targetLanguageCode && !message.translatedText`).
    3. Clean bottom dock without text input, wave animation, speaker button, or recording banner — containing ONLY the centered toggled Listen button (`Ear`, toggled off vs active Listen state via `aria-pressed`).
  - **Browser Audio Normalization & Error Hardening:** `processLiveListenChunk` converts browser `MediaRecorder` blobs into mono PCM WAV (`convertAudioBlobToWavIfPossible`) before upload; `src/services/transcribeVoxtral.ts` lazily normalizes native `.m4a`/`.mp4` uploads and retries minimal `transcribe` payloads if optional `providerOptions` are rejected; `src/lib/runLiveListenChunk.ts` includes literal `"JSON"` in OpenAI `json_object` `input` and emits stage-specific (`transcription` / `translation`) fixed-literal diagnostics.
  - **Voice Cloning & Local Persistence:** Finalized single-speaker segments (`singleSpeakerAudioEligible && segment.sourceLanguage.code`) save `audioBlob` (`durationMs`) via `localStore.saveAudioAsset` and trigger `ensureChatLanguageVoiceClone(activeChatId, segment.sourceLanguage.code)` when `isSupportedTts` is true. Failed chunks retain their `audioBlob` in a retryable error `MessageBubble` (`onRetry`).

### 4. Android APK Live Mode (`mobile/`)

- **App Shell Tab (`mobile/src/components/AppShell.tsx`):**
  - Add `{ route: '/live', labelKey: 'modeLive', icon: 'radio' }` right after Chat in `MODES` (`width: 34, height: 36` responsive `modeButton` sizing so all 5 tabs fit cleanly on 360dp viewports without overflow).
- **Transport & Live Adapter (`mobile/src/adapters/processingTransport.ts`, `mobile/src/adapters/live.ts`):**
  - Add `postLiveListenChunk(input: { uri, mimeType, filename, listenerLanguage, theirLanguage?, chunkId?, isPreview?, contextBias?, onResponse? }, signal?)` using `openUploadFile(input.uri).upload(endpointUrl('/chat/messages/live-listen'), ...)` with the `3_000_000` byte guard and zero `conversationId`/`userId` leakage.
  - Add `processLiveListenChunk` in `mobile/src/adapters/live.ts` validating and returning typed segments.
- **SQLite & MessageCard Compatibility (`mobile/src/storage/history.ts`, `mobile/src/chat/MessageCard.tsx`):**
  - Keep `HISTORY_SCHEMA_VERSION = 4` unchanged (`mobile/src/storage/migrations.ts`); persist live-listen messages with `origin_mode: 'chat'`.
  - Allow empty `translatedText` in `saveReadyLiveMessage` and `finishLiveDraft` **only** when `input.sourceLanguage === input.targetLanguage` (storing `translated_text = null`).
  - Update `MessageCard.tsx` so when `message.status === 'ready' && message.source_language === message.target_language && !message.translated_text`, the `translationBlock` is omitted instead of rendering `strings.translationFailed`.
- **Native Playback & Audio Session Coordination (`mobile/src/adapters/playbackCoordinator.ts`, `mobile/src/chat/useAudioPlayback.ts`, `mobile/src/live/useNativeLiveAudioQueue.ts`):**
  - Extend `AudioPlaybackCoordinator` with `setLiveListenActive(active: boolean)` and `startLivePlayback(id, stopCallback)` (allowing queued live TTS playback while live listening is active, while keeping `startPlayback` strictly blocked during single-turn `isRecording()`).
  - Add `useNativeLiveAudioQueue` wrapping `ensureTranslatedSpeech`, `configureNativeAudioSession(false)` / `configureNativeAudioSession(true)`, and `useNativeAudioPlayer` to play translated speech sequentially in FIFO order, exposing `isPlaying` to pause recorder VAD metering while device audio is playing.
- **Native Continuous VAD Capture & Screen (`mobile/src/live/useNativeLiveListen.ts`, `mobile/src/live/LiveListenView.tsx`, `mobile/src/app/live.tsx`):**
  - `useNativeLiveListen.ts`: uses `useNativeAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, directory: 'document', isMeteringEnabled: true })` (`SPEECH_DBFS_THRESHOLD = -46`, `SILENCE_FINALIZE_MS = 750`, `MAX_CHUNK_MS = 6000`). When VAD triggers a segment (and while `!liveAudioQueue.isPlaying`), uploads directly via `nativeLiveApi.processLiveListenChunk` (omitting `theirLanguage` for open auto-detection into `myLanguage`), saves ready segment(s) into SQLite via `saveLiveMessage` (attaching source audio only when `singleSpeakerAudioEligible`), or preserves failed uploads as retryable SQLite voice drafts via `saveLiveAudioDraft`. Stops cleanly on `isFocused === false`, `AppState !== 'active'`, or user stop tap.
  - `LiveListenView.tsx` + `mobile/src/app/live.tsx`: shows History menu + single `myLanguage` `LanguagePicker` in the header (no `theirLanguage` or invert controls), `FlatList` of `MessageCard`s, and a simple bottom bar with ONLY the centered toggled Listen button (`headphones`, no `TextInput`, no speaker button, no wave/banner animation).

### 5. Shared UI Strings (`shared/uiStrings.ts`, `shared/bundledUiStrings.ts`)

Add the minimal set of Live-mode labels to `ENGLISH_UI_STRINGS` and every bundled language catalog in `shared/bundledUiStrings.ts`:
- `modeLive`: `"Live"`
- `liveAutoPlayOn`: `"Auto-play translations on"`
- `liveAutoPlayOff`: `"Auto-play translations muted"`
- `liveListening`: `"Listening live"`
- `livePaused`: `"Live paused"`

## Verification Strategy

- **Backend unit & handler tests (`scripts/verify-voxtral-live-listen.mjs`):** Mock `@ai-sdk/gateway` + `createOpenAiResponse` + `generatePronunciationGuidance` to verify Voxtral `diarize: true` + `timestampGranularities: ['segment']` + omitted `language`, multi-language / multi-speaker segment splitting, same-language fast path, `singleSpeakerAudioEligible`, and Postgres persistence behavior.
- **Security, contract & catalog audits:** Extend `scripts/verify-mobile-api-contract.mjs` and `scripts/verify-mobile-processing-audit.mjs` to cover `/chat/messages/live-listen`, `src/services/transcribeVoxtral.ts`, and `src/lib/runLiveListenChunk.ts`; run `scripts/verify-mobile-adapters.mjs` and `scripts/check-mobile-ui-catalog.mjs`.
- **Web & Mobile live-listen tests (`scripts/verify-web-live-listen.mjs`, `scripts/verify-mobile-live-listen.mjs`, `scripts/verify-web-shell-parity.mjs`):** Test VAD rollover/echo-gating state machine, FIFO queue ordering & cancellation, `ModeSwitcher` / `AppShell` Live tab visibility, SQLite same-language message persistence with `HISTORY_SCHEMA_VERSION = 4`, and `npm run build`.
