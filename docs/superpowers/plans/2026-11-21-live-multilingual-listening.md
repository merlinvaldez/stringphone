# Live Multilingual Conversation Listening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement continuous **Live Multilingual Conversation Listening** across Backend (`src/`, `api/`), Web App (`client/`), and Android APK (`mobile/`), using **Voxtral Transcribe 3 via Vercel AI Gateway** (`mistral/voxtral-mini-transcribe-3` / `mistral/voxtral-small-transcribe-3`) for multilingual speech-to-text & speaker diarization, **existing direct OpenAI** (`createOpenAiResponse` & `generatePronunciationGuidance`) for language confirmation and translation into the listener's `myLang`, and **existing `/speech/output`** with a sequential FIFO live playback queue and existing UI components.

**Architecture:** Capture microphone audio continuously via client-side VAD (no 30s limit; ~750ms pause cut and ~6,000ms max rolling cut, plus optional ~2,500ms preview snapshots). Send each audio chunk to `POST /chat/messages/live-listen`, which transcribes & diarizes with Voxtral Transcribe 3 through `@ai-sdk/gateway` (omitting `language` for open 50+ language auto-detection), confirms language and translates foreign segments into `myLang` through direct OpenAI (`src/lib/openai.ts`, never Gateway), skips translation/TTS for `myLang` segments, marks `singleSpeakerAudioEligible` for 10s voice-clone safety, and streams/returns structured segments into the unhidden `Live` (`Radio`) tab reusing `ChatHeader`, `ChatThread`/`MessageBubble` (Web), `MessageCard` (Mobile), `LiveTranslationDock`, and `ChatComposer`. Translated segments prefetch via `/speech/output` and play sequentially through an echo-gated FIFO playback queue.

**Tech Stack:** TypeScript 6, Node 25 (`node:assert/strict`, `node:sqlite`, `tsx`), Vercel AI SDK (`ai`, `@ai-sdk/gateway`), Direct OpenAI Responses API (`src/lib/openai.ts`), Express 5 / Vercel Functions, React 19 / Vite 7 / IndexedDB (`client/`), Expo / React Native / SQLite (`mobile/`).

**Spec:** [2026-11-21-live-multilingual-listening-design.md](../specs/2026-11-21-live-multilingual-listening-design.md)

## Global Constraints

- **Explicit provider split:** Speech-to-text & diarization MUST use **Voxtral Transcribe 3 via Vercel AI Gateway** (`gateway.transcriptionModel(MISTRAL_VOXTRAL_DEFAULT_TRANSCRIBE_MODEL)` with `diarize: true`, `timestampGranularities: ['segment']`, and NO `language` param). Language confirmation, translation, and pronunciation MUST use **existing direct OpenAI endpoints** (`createOpenAiResponse` / `generatePronunciationGuidance`), NOT `@ai-sdk/gateway`.
- **No echo on listener's own language:** Speech confirmed as `myLang` (`sourceLanguage.code === listenerLanguage.code`) emits `sender: 'self'`, `translatedText: ''`, `needsPlayback: false`, and never triggers translation or FIFO TTS playback.
- **Voice-clone contamination guard:** Multi-speaker diarized chunks (`distinctSpeakerCount > 1`) MUST emit `singleSpeakerAudioEligible: false` so mixed voices never enter a speaker's 10-second per-language voice clone.
- **SQLite schema & `MessageCard` parity (`HISTORY_SCHEMA_VERSION = 4`):** Do NOT add a v5 migration to `mobile/src/storage/migrations.ts`; store mobile live-listen turns with `origin_mode: 'chat'` and allow empty/null `translated_text` only when `source_language === target_language` without rendering `"Translation failed."`.
- **Mobile processing & privacy boundaries (`verify-mobile-adapters.mjs`, `verify-mobile-processing-audit.mjs`, `verify-mobile-api-contract.mjs`):** Never send local SQLite `conversationId` or `userId` from `mobile/` to `/chat/messages/live-listen`; log only single double-quoted string literals (`"..."`) in all processing/API files; keep `mobile/src/` free of `client/`, `src/{lib,services,db}/`, and browser globals (`window.`, `localStorage`, `MediaRecorder`).
- **Complete UI string catalog (`check-mobile-ui-catalog.mjs`):** Add all new `ENGLISH_UI_STRINGS` keys across every bundled locale in `shared/bundledUiStrings.ts`.
- **Audio feedback safety & existing mode preservation:** Do NOT break or weaken existing OpenAI WebRTC live capture in `Chat`/`Single`/`Conversation` or single-turn `AudioPlaybackCoordinator.isRecording()` mutual exclusion. Gate VAD energy monitoring while FIFO live TTS plays in speaker-safe mode.

## Review Focus

1. **Open multilingual 3-language detection & no same-language echo:** A mixed audio chunk with Spanish, Japanese, and English when `listenerLanguage = "en"` produces 2 translated `partner` sky segments (`es -> en`, `ja -> en`, `needsPlayback: true`) and 1 `self` emerald segment (`en -> en`, `translatedText: ""`, `needsPlayback: false`), and never renders `"Translation failed."` on Web or Mobile (tested in Tasks 1, 3, 4).
2. **Multi-speaker diarization & voice-clone protection:** A single audio chunk containing two diarized speakers splits into separate chronological segments with `singleSpeakerAudioEligible: false` so neither Web `localStore` nor Mobile `audioSession` attaches that multi-speaker blob to a 10s voice clone, whereas single-speaker chunks set `singleSpeakerAudioEligible: true` (tested in Tasks 1, 3, 4).
3. **Strict provider split verification:** Voxtral Transcribe 3 goes exclusively through `@ai-sdk/gateway` (`mistral/voxtral-mini-transcribe-3` / `small`) with `diarize: true`, `timestampGranularities: ['segment']`, and omitted `language`, while translation and pronunciation go exclusively through `createOpenAiResponse` / `generatePronunciationGuidance` (tested in Task 1).
4. **Sequential FIFO live playback queue & echo-safe VAD gating:** Parallel `/speech/output` prefetch resolves out of order while playback strictly executes in FIFO order without overlapping audio; `isListenerLanguage` segments are skipped; toggling Mute or tapping a manual bubble play button yields/pauses immediately; VAD suppresses new triggers while local live audio is playing in speaker-safe mode (tested in Tasks 3 & 4).
5. **Security, schema & cross-platform audit compliance:** Mobile never sends `conversationId` to `/chat/messages/live-listen`, persists locally as `origin_mode: 'chat'` under `HISTORY_SCHEMA_VERSION = 4`, keeps failed chunks retryable locally, and passes `verify-mobile-adapters.mjs`, `verify-mobile-processing-audit.mjs`, `verify-mobile-api-contract.mjs`, `check-mobile-ui-catalog.mjs`, and `verify-web-shell-parity.mjs` (tested in Tasks 2, 4, 5).

---

### Task 1: Backend Voxtral Transcribe 3 Service & Direct OpenAI Live-Listen Orchestration

**Files:**
- Create: `src/services/transcribeVoxtral.ts`
- Create: `src/lib/runLiveListenChunk.ts`
- Create: `scripts/verify-voxtral-live-listen.mjs`

**Interfaces:**
- Consumes:
  - `transcribe` from `"ai"` and `createGateway` from `"@ai-sdk/gateway"`
  - `createOpenAiResponse` from `"../lib/openai.js"`
  - `generatePronunciationGuidance` from `"../services/generatePronunciationGuidance.js"`
  - `getSupportedTtsLanguage`, `requiresPhoneticGuide` from `"../lib/languages.js"`
  - `createMessage`, `getConversation` from `"../db/queries/conversations.js"`
  - `refreshConversationTitle` from `"../services/refreshConversationTitle.js"`
- Produces:
  - `src/services/transcribeVoxtral.ts`:
    - `MISTRAL_VOXTRAL_DEFAULT_TRANSCRIBE_MODEL = "mistral/voxtral-mini-transcribe-3"`
    - `VoxtralDiarizedSegment` (`speakerId`, `text`, `languageCode`, `startSecond`, `endSecond`)
    - `transcribeWithVoxtral(input: TranscribeVoxtralInput, deps?: TranscribeVoxtralDeps): Promise<TranscribeVoxtralResult>`
  - `src/lib/runLiveListenChunk.ts`:
    - `LiveListenSegmentResult` & `RunLiveListenChunkResult`
    - `runLiveListenChunk(input: RunLiveListenChunkInput, deps?: RunLiveListenChunkDeps): Promise<RunLiveListenChunkResult>`

- [ ] **Step 1: Write the failing test (`scripts/verify-voxtral-live-listen.mjs`)**

Test assertions covering Review Focus #1, #2, #3:
1. `transcribeWithVoxtral`:
   - Calls `transcribeImpl` with `gateway.transcriptionModel("mistral/voxtral-mini-transcribe-3")` (or `MISTRAL_TRANSCRIBE_MODEL` override), `providerOptions.mistral = { diarize: true, timestampGranularities: ["segment"], ...(contextBias ? { contextBias } : {}) }`, and asserts `providerOptions.mistral.language` is `undefined` (open multilingual auto-detect).
   - Normalizes diarized segments from both `result.segments` and `result.providerMetadata.mistral.segments`, merges adjacent identical speakers with `< 0.8s` gap and matching language, filters empty text, and reports accurate `distinctSpeakerCount`.
2. `runLiveListenChunk`:
   - Rejects unsupported `listenerLanguage` (`400`), missing `sourceAudioFile` (`400`), oversized `sourceAudioFile > 3_000_000` (`400`), and empty/no-speech Voxtral output (`422`).
   - **Review Focus #1 & #3 (Open 3-language chunk):** Given `listenerLanguage = "en"` and Voxtral returning 3 segments (`es`: `"¿Cómo estás?"`, `ja`: `"元気ですか？"`, `en`: `"I am doing great."`), asserts:
     - Translation calls `createOpenAiResponse` (NOT AI Gateway text generation) for `"es"` and `"ja"`, and fast-path skips OpenAI for `"en"`.
     - Returned `segments` preserves order: `es` (`sender: "partner"`, `translatedText`, `needsPlayback: true`), `ja` (`sender: "partner"`, `translatedText`, `originalPronunciation`, `needsPlayback: true`), and `en` (`sender: "self"`, `translatedText: ""`, `needsPlayback: false`).
   - **Review Focus #2 (Multi-speaker vs single-speaker voice clone eligibility):**
     - Multi-speaker diarized chunk (`speaker_1`, `speaker_2`) sets `singleSpeakerAudioEligible: false` on every segment.
     - Single-speaker finalized chunk (`!isPreview && distinctSpeakerCount === 1`) sets `singleSpeakerAudioEligible: true`.
     - Preview chunk (`isPreview: true`) skips pronunciation generation, skips Postgres persistence, and sets `singleSpeakerAudioEligible: false`.
   - **Postgres persistence guard:** Passing `conversationId` without `userId` returns `401`; with authenticated `userId` and `!isPreview`, saves segments via `createMessage` (`translatedText: ""` for listener language, never `null`) and refreshes conversation title; omitting `conversationId` never calls DB functions.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx scripts/verify-voxtral-live-listen.mjs`
Expected: FAIL because `src/services/transcribeVoxtral.ts` and `src/lib/runLiveListenChunk.ts` do not exist yet.

- [ ] **Step 3: Implement `src/services/transcribeVoxtral.ts` and `src/lib/runLiveListenChunk.ts`**

- Implement `transcribeWithVoxtral` with AI Gateway credential resolution (`AI_GATEWAY_API_KEY` / `VERCEL_OIDC_TOKEN`), `diarize: true`, `timestampGranularities: ["segment"]`, optional bounded `contextBias` (max 25 strings), and defensive segment parsing + adjacent same-speaker merging.
- Implement `runLiveListenChunk` orchestrating validation -> `transcribeWithVoxtral` -> direct OpenAI combined language-confirm/translate (`createOpenAiResponse` with `jsonObject: true`) -> conditional `generatePronunciationGuidance` -> optional authenticated Postgres persistence.
- Keep all `console.error` / `console.warn` calls strictly as single double-quoted literal strings (`"..."`).

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx scripts/verify-voxtral-live-listen.mjs`
Expected: PASS on all assertions.

- [ ] **Step 5: Commit**

```bash
git add src/services/transcribeVoxtral.ts src/lib/runLiveListenChunk.ts scripts/verify-voxtral-live-listen.mjs
git commit -m "feat(speech): add Voxtral Transcribe 3 AI Gateway service and direct OpenAI live-listen orchestration"
```

---

### Task 2: Backend Live-Listen Endpoints (`POST /chat/messages/live-listen`) & Security Audits

**Files:**
- Create: `api/chat/messages/live-listen.ts`
- Modify: `src/server.ts`
- Modify: `scripts/verify-mobile-api-contract.mjs`
- Modify: `scripts/verify-mobile-processing-audit.mjs`
- Modify: `scripts/verify-voxtral-live-listen.mjs`

**Interfaces:**
- Consumes: `runLiveListenChunk` from `src/lib/runLiveListenChunk.js`, `getOptionalAuthenticatedAppRequest` / `getOptionalAuthenticatedVercelAppRequest`
- Produces:
  - Express route `POST /chat/messages/live-listen` (`upload.single("sourceAudio")`) in `src/server.ts`
  - Vercel serverless function `api/chat/messages/live-listen.ts` (`export const config = { runtime: "nodejs" }`)

- [ ] **Step 1: Extend audit & validation test scripts (`verify-mobile-api-contract.mjs`, `verify-mobile-processing-audit.mjs`, `verify-voxtral-live-listen.mjs`)**

Add failing assertions for:
1. `scripts/verify-mobile-api-contract.mjs`: probe `/chat/messages/live-listen` for unsupported `listenerLanguage` (`400`) and missing `sourceAudio` (`400`).
2. `scripts/verify-mobile-processing-audit.mjs`: load and test `runLiveListenChunk` (verifying guest/mobile without `conversationId` never touches Postgres, `conversationId` without auth returns `401`, and errors never leak sensitive transcript data), and include `src/services/transcribeVoxtral.ts`, `src/lib/runLiveListenChunk.ts`, and `api/chat/messages/live-listen.ts` in the fixed-literal diagnostic logging check.
3. `scripts/verify-voxtral-live-listen.mjs`: test `api/chat/messages/live-listen.ts` `OPTIONS` (`204`), `GET` (`405`), and multipart `POST` forwarding `listenerLanguage`, `theirLanguage`, `chunkId`, `isPreview`, `contextBias`, and `sourceAudio`.

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
node --import tsx scripts/verify-mobile-api-contract.mjs
node --import tsx scripts/verify-mobile-processing-audit.mjs
node --import tsx scripts/verify-voxtral-live-listen.mjs
```
Expected: FAIL because `api/chat/messages/live-listen.ts` does not exist yet.

- [ ] **Step 3: Create `api/chat/messages/live-listen.ts` and register `POST /chat/messages/live-listen` in `src/server.ts`**

- Parse `multipart/form-data` (`sourceAudio`, `listenerLanguage`, `theirLanguage`, `chunkId`, `isPreview`, `contextBias`, `conversationId`).
- Resolve optional authenticated user via `getOptionalAuthenticatedVercelAppRequest` / `getOptionalAuthenticatedAppRequest`.
- Keep all `console.error` calls as fixed double-quoted literal strings (`"..."`).

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
node --import tsx scripts/verify-voxtral-live-listen.mjs
node --import tsx scripts/verify-mobile-api-contract.mjs
node --import tsx scripts/verify-mobile-processing-audit.mjs
```
Expected: PASS across all 3 scripts.

- [ ] **Step 5: Commit**

```bash
git add api/chat/messages/live-listen.ts src/server.ts scripts/verify-mobile-api-contract.mjs scripts/verify-mobile-processing-audit.mjs scripts/verify-voxtral-live-listen.mjs
git commit -m "feat(api): add POST /chat/messages/live-listen route and security audit probes"
```

---

### Task 3: Shared UI Strings & Web App Live Mode (`client/`)

**Files:**
- Modify: `shared/uiStrings.ts`
- Modify: `shared/bundledUiStrings.ts`
- Modify: `client/src/chatApi.js`
- Create: `client/src/components/live/useVoxtralLiveListen.js`
- Create: `client/src/components/live/useLiveAudioQueue.js`
- Create: `client/src/components/live/LiveListenScreen.jsx`
- Modify: `client/src/components/live/LiveTranslationDock.jsx`
- Modify: `client/src/components/chat/MessageBubble.jsx`
- Modify: `client/src/StringPhoneApp.jsx`
- Create: `scripts/verify-web-live-listen.mjs`

**Interfaces:**
- Consumes: `POST /api/chat/messages/live-listen`, `prefetchMessageTranslatedSpeech`, `playGeneratedSpeech`, `pauseActiveAudio`, `localStore`, `ensureChatLanguageVoiceClone`
- Produces:
  - `shared/uiStrings.ts` & `shared/bundledUiStrings.ts`: `modeLive`, `liveAutoPlayOn`, `liveAutoPlayOff`, `liveListening`, `livePaused`
  - `client/src/chatApi.js`: `processLiveListenChunk(...)`
  - `client/src/components/live/useVoxtralLiveListen.js`: continuous VAD capture hook + exported pure VAD/rollover harness (`createVadChunkController`) for Node testing
  - `client/src/components/live/useLiveAudioQueue.js`: sequential FIFO playback queue + exported pure queue harness (`createLivePlaybackQueue`) for Node testing
  - `client/src/components/live/LiveListenScreen.jsx`: reuses `ChatHeader`, `ChatThread`, `LiveTranslationDock`, `ChatComposer`, and circular `Volume2`/`VolumeX` auto-play toggle
  - `client/src/StringPhoneApp.jsx`: removes `"live"` from `HIDDEN_MODE_IDS` and renders `LiveListenScreen` when `appMode === "live"`

- [ ] **Step 1: Write the failing tests (`scripts/verify-web-live-listen.mjs`)**

Test assertions covering Review Focus #1, #2, #4:
1. Pure VAD state machine (`createVadChunkController`):
   - Emits pause-cut chunk after `>= 550ms` speech + `750ms` silence.
   - Forces rolling chunk cut at `MAX_CHUNK_MS` (`6000ms`) during continuous uninterrupted speech and emits a preview snapshot at `2500ms`.
   - Suppresses speech-start triggers while `isLocalAudioPlaying && !headphoneMode` (echo-safe VAD gating).
2. Pure FIFO audio queue (`createLivePlaybackQueue`):
   - Enqueueing items A, B, C starts prefetch in parallel for all 3 and plays strictly A -> B -> C even when B resolves faster than A.
   - Enqueueing an item while muted (`autoPlayEnabled: false`) still allows prefetch/manual click without auto-playing.
   - Calling `pauseAll()` / `yieldToManualPlayback()` stops current playback and halts auto-advance cleanly.
3. Source & message contract checks:
   - `StringPhoneApp.jsx` exposes `"live"` in `VISIBLE_MODE_OPTIONS` (`HIDDEN_MODE_IDS` does not hide `"live"`).
   - `MessageBubble.jsx` skips rendering the translation section when `sourceLanguageCode === targetLanguageCode && !translatedText`.
   - Multi-speaker chunks (`singleSpeakerAudioEligible === false`) do not trigger `ensureChatLanguageVoiceClone`.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx scripts/verify-web-live-listen.mjs`
Expected: FAIL because `useVoxtralLiveListen.js`, `useLiveAudioQueue.js`, and `LiveListenScreen.jsx` do not exist yet.

- [ ] **Step 3: Implement shared UI strings and Web App Live mode**

- Add `modeLive`, `liveAutoPlayOn`, `liveAutoPlayOff`, `liveListening`, `livePaused` to `shared/uiStrings.ts` and all 42 non-English locales in `shared/bundledUiStrings.ts`.
- Add `processLiveListenChunk` to `client/src/chatApi.js`.
- Implement `client/src/components/live/useVoxtralLiveListen.js` (with `createVadChunkController` pure core, hardware `echoCancellation: true`, zero-gap `MediaRecorder` rollover, rolling `2500ms` preview, and cleanup on unmount/mode switch).
- Implement `client/src/components/live/useLiveAudioQueue.js` (with `createLivePlaybackQueue` pure core, `localStorage` persisted `autoPlayEnabled`, parallel `prefetchMessageTranslatedSpeech`, sequential `playGeneratedSpeech`, and manual-playback preemption).
- Update `LiveTranslationDock.jsx` (support multi-language speaker/language header badges cleanly) and `MessageBubble.jsx` (skip empty translation block when `sourceLanguageCode === targetLanguageCode && !translatedText`, highlight active live-playing TTS state).
- Implement `LiveListenScreen.jsx` composing `ChatHeader`, `ChatThread`, `LiveTranslationDock`, `ChatComposer`, and the `Volume2`/`VolumeX` live auto-play toggle button, and wire `appMode === "live"` in `StringPhoneApp.jsx` (including shared `localStore` / Postgres message persistence, retry, and `singleSpeakerAudioEligible`-gated voice cloning).

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
node --import tsx scripts/verify-web-live-listen.mjs
node --import tsx scripts/verify-web-shell-parity.mjs
node --import tsx scripts/verify-web-chat-parity.mjs
node --import tsx scripts/check-mobile-ui-catalog.mjs
```
Expected: PASS on all 4 scripts.

- [ ] **Step 5: Commit**

```bash
git add shared/uiStrings.ts shared/bundledUiStrings.ts client/src/chatApi.js client/src/components/live/useVoxtralLiveListen.js client/src/components/live/useLiveAudioQueue.js client/src/components/live/LiveListenScreen.jsx client/src/components/live/LiveTranslationDock.jsx client/src/components/chat/MessageBubble.jsx client/src/StringPhoneApp.jsx scripts/verify-web-live-listen.mjs
git commit -m "feat(client): unhide Live tab with Voxtral multilingual listening and FIFO audio queue"
```

---

### Task 4: Android APK Live Mode (`mobile/`)

**Files:**
- Modify: `mobile/src/adapters/processingTransport.ts`
- Modify: `mobile/src/adapters/live.ts`
- Modify: `mobile/src/adapters/playbackCoordinator.ts`
- Modify: `mobile/src/storage/history.ts`
- Modify: `mobile/src/chat/MessageCard.tsx`
- Modify: `mobile/src/chat/useAudioPlayback.ts`
- Create: `mobile/src/live/useNativeLiveAudioQueue.ts`
- Create: `mobile/src/live/useNativeLiveListen.ts`
- Create: `mobile/src/live/LiveListenView.tsx`
- Create: `mobile/src/app/live.tsx`
- Modify: `mobile/src/components/AppShell.tsx`
- Create: `scripts/verify-mobile-live-listen.mjs`

**Interfaces:**
- Consumes: `POST /chat/messages/live-listen` (via `postLiveListenChunk`), `POST /speech/output` (via `ensureTranslatedSpeech`), `createTextChatController`, `AudioPlaybackCoordinator`
- Produces:
  - `mobile/src/adapters/processingTransport.ts`: `postLiveListenChunk(...)`
  - `mobile/src/adapters/live.ts`: `LiveListenSegment`, `LiveListenResult`, `nativeLiveApi.processLiveListenChunk(...)`
  - `mobile/src/adapters/playbackCoordinator.ts`: `setLiveListenActive(active: boolean)`, `isLiveListenActive()`, `startLivePlayback(id, stopCallback)`
  - `mobile/src/app/live.tsx` & `mobile/src/live/LiveListenView.tsx`: Expo Router `/live` screen registered in `AppShell.tsx` `MODES`

- [ ] **Step 1: Write the failing test (`scripts/verify-mobile-live-listen.mjs`)**

Test assertions covering Review Focus #1, #2, #4, #5:
1. SQLite same-language persistence (`HISTORY_SCHEMA_VERSION = 4` unchanged):
   - `saveReadyLiveMessage` / `finishLiveDraft` succeeds when `sourceLanguage === targetLanguage === 'en'` and `translatedText === ''` (storing `translated_text = null`), and still throws if `sourceLanguage !== targetLanguage` and `translatedText === ''`.
   - `MessageCard.tsx` omits `translationBlock` when `message.status === 'ready' && message.source_language === message.target_language && !message.translated_text`.
2. Mobile transport privacy & size guard:
   - `postLiveListenChunk` uses `openUploadFile(uri).upload(endpointUrl('/chat/messages/live-listen'), ...)` and rejects files `> 3_000_000` bytes and payloads with non-`file://` URIs.
   - `processLiveListenChunk` does not accept or serialize `conversationId` or `userId`.
3. `AudioPlaybackCoordinator` live-listen behavior:
   - Existing `startPlayback()` still returns `false` during normal `setRecording(true)`.
   - When `setLiveListenActive(true)` is set, `startLivePlayback(id, stop)` succeeds, pauses any prior player, and clears cleanly on `setLiveListenActive(false)`.
4. Source checks:
   - `AppShell.tsx` includes `{ route: '/live', labelKey: 'modeLive', icon: 'radio' }` in `MODES`.
   - `useNativeLiveListen.ts` only passes `singleSpeakerAudioEligible` segments for voice-clone attachment / eligibility and stores failed chunks as retryable SQLite drafts (`origin_mode: 'chat'`).

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx scripts/verify-mobile-live-listen.mjs`
Expected: FAIL because `postLiveListenChunk`, `startLivePlayback`, `live.tsx`, and same-language `history.ts` handling do not exist yet.

- [ ] **Step 3: Implement Android APK Live mode across `mobile/src/`**

- Update `mobile/src/adapters/processingTransport.ts` (`postLiveListenChunk`) and `mobile/src/adapters/live.ts` (`processLiveListenChunk`).
- Update `mobile/src/adapters/playbackCoordinator.ts` (`setLiveListenActive`, `isLiveListenActive`, `startLivePlayback`) and `mobile/src/chat/useAudioPlayback.ts` (yield live queue if user manually taps a bubble).
- Update `mobile/src/storage/history.ts` (keep `HISTORY_SCHEMA_VERSION = 4`; allow empty `translatedText` -> `null` when `sourceLanguage === targetLanguage`) and `mobile/src/chat/MessageCard.tsx` (omit `translationBlock` on ready same-language utterances).
- Create `mobile/src/live/useNativeLiveAudioQueue.ts`, `mobile/src/live/useNativeLiveListen.ts`, `mobile/src/live/LiveListenView.tsx`, and `mobile/src/app/live.tsx`.
- Update `mobile/src/components/AppShell.tsx` to include `{ route: '/live', labelKey: 'modeLive', icon: 'radio' }` with 5-tab spacing (`width: 34, height: 36`).

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
node --import tsx scripts/verify-mobile-live-listen.mjs
node --import tsx scripts/verify-mobile-adapters.mjs
node --import tsx scripts/verify-mobile-api-contract.mjs
node --import tsx scripts/verify-mobile-processing-audit.mjs
node --import tsx scripts/verify-mobile-mic-listening-state.mjs
node --import tsx scripts/verify-mobile-history.mjs
node --import tsx scripts/verify-mobile-local-history.mjs
node --import tsx scripts/verify-mobile-chat-controller.mjs
node --import tsx scripts/verify-mobile-voice-cloning.mjs
node --import tsx scripts/check-mobile-ui-catalog.mjs
```
Expected: PASS on all scripts.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/adapters/processingTransport.ts mobile/src/adapters/live.ts mobile/src/adapters/playbackCoordinator.ts mobile/src/storage/history.ts mobile/src/chat/MessageCard.tsx mobile/src/chat/useAudioPlayback.ts mobile/src/live/useNativeLiveAudioQueue.ts mobile/src/live/useNativeLiveListen.ts mobile/src/live/LiveListenView.tsx mobile/src/app/live.tsx mobile/src/components/AppShell.tsx scripts/verify-mobile-live-listen.mjs
git commit -m "feat(mobile): add /live multilingual Voxtral listening view and FIFO playback queue"
```

---

### Task 5: Whole-Branch Verification, Production Web Build & Final Review

**Files:**
- Verify: all `scripts/verify-*.mjs` tests, `scripts/check-mobile-ui-catalog.mjs`, `npm run build`, `git diff --check`

- [ ] **Step 1: Run the entire repository verification suite and client production build**

Run (excluding live-credential network scripts `verify-tts-audio.mjs` and `verify-saved-message-playback.mjs` unless env keys are loaded):
```bash
for f in scripts/verify-*.mjs; do
  case "$f" in
    *verify-tts-audio.mjs|*verify-saved-message-playback.mjs) continue ;;
  esac
  echo "=== Running $f ==="
  node --import tsx "$f" || exit 1
done
node --import tsx scripts/check-mobile-ui-catalog.mjs
npm run build
git diff --check
```
Expected: Every test script passes with exit code `0`, `npm run build` (`vite build`) succeeds, and `git diff --check` reports no issues.

- [ ] **Step 2: Run final whole-branch code review**

Verify against every Review Focus condition (#1–#5) and Global Constraint before user-approved deployment or Android APK build.
