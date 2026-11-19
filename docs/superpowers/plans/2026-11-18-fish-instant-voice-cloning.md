# Chat-Scoped 10-Second Instant Voice Cloning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement chat-scoped, per-language 10-second instant voice cloning using Fish Audio (`fish-audio/s2.1-pro`) via Vercel AI Gateway across the backend (`src/`, `api/`), Web App (`client/`), and Android APK (`mobile/`), defaulting to original OpenAI TTS until 10+ seconds of single or merged audio exists for that spoken language in that chat.

**Architecture:** Normalize and measure recorded audio samples (`webm`, `m4a`/`mp4`, `wav`, `mp3`, `ogg`) into canonical `44100 Hz 16-bit mono PCM WAV` buffers on the backend (`src/services/prepareVoiceReference.ts`), qualifying a spoken language in a chat only when a single recording is `>= 10_000 ms` or multiple recordings in that chat merge to `>= 10_000 ms`. Create a Fish Audio instant voice clone (`POST https://api.fish.audio/model`), persist the resulting `clonedVoiceId` per `(conversationId, languageCode)` in that chat only (`client/src/localStore.js` for Web and `mobile/src/storage/history.ts` for APK), and synthesize speech via `generateSpeech` (`ai`) + Vercel AI Gateway (`@ai-sdk/gateway` model `fish-audio/s2.1-pro`) with automatic fallback to `generateOpenAiSpeech`.

**Tech Stack:** TypeScript 6, Node 25 (`node:assert/strict`, `node:sqlite`, `tsx`), Vercel AI SDK (`ai`, `@ai-sdk/gateway`, `@ai-sdk/fish-audio`), `ffmpeg-static`, React 19 / Vite 7 / IndexedDB (`client/`), Expo / React Native / SQLite (`mobile/`).

**Spec:** [2026-11-18-fish-instant-voice-cloning-design.md](../specs/2026-11-18-fish-instant-voice-cloning-design.md)

## Global Constraints

- Instant voice cloning for a spoken language (`sourceLanguage`) in a chat (`conversationId`) must only occur when a single audio sample is `>= 10_000 ms` (`10 seconds`) or multiple audio samples for that language in that chat merge to `>= 10_000 ms`. Below `10_000 ms`, TTS must default to original OpenAI TTS (`marin` / `onyx`).
- Each spoken language in a chat gets its own independent clone stored on that chat only (`conversationId` + `languageCode`); never use Speaker A's (`en`) clone for Speaker B's (`es`) messages, and never leak a chat's clones into another chat or Phrasebook.
- Keep `HISTORY_SCHEMA_VERSION = 4` in `mobile/src/storage/migrations.ts` (store per-chat clones in `preferences` under `chat.voiceClones.<conversationId>` and delete on conversation deletion).
- Preserve all mobile boundary and audit invariants (`scripts/verify-mobile-adapters.mjs`, `scripts/verify-mobile-processing-audit.mjs`, `scripts/verify-mobile-api-contract.mjs`): fixed double-quoted literal strings in `console.error`/`warn`/`log` inside audited processing files, no web/server imports in `mobile/src/`, and no `conversationId` sent by mobile `/speech/output`.
- `/speech/output` must always return a standard RIFF/WAVE PCM buffer (`audio/wav`) compatible with `parseWav` and `concatenateWavBuffers` in `mobile/src/adapters/speech.ts`.

## Review Focus

1. A chat with a 9.9-second single sample (or two 4.9-second samples totaling 9.8 seconds) for `'en'` must NOT call Fish Audio clone creation and must synthesize speech using the default OpenAI TTS voice (tested in Task 1, Task 3, Task 4).
2. A chat where `'en'` has 11 seconds of audio (cloned) and `'es'` has 4 seconds of audio (not yet 10 seconds) must synthesize `'en'`-speaker messages (both original `'en'` and translated `'es'` playback) with the `'en'` Fish Audio clone, while synthesizing `'es'`-speaker messages with the default OpenAI TTS voice (tested in Task 3 & Task 4).
3. Two 5.5-second audio clips for `'es'` in Chat A must merge to 11.0 seconds and unlock `'es'` voice cloning in Chat A, while starting or switching to Chat B must NOT inherit Chat A's `'es'` voice clone (tested in Task 3 & Task 4).
4. In the Android APK, a single 6-second live recording session that emits two OpenAI Realtime utterance items (`live_<captureId>_item1` and `live_<captureId>_item2`) sharing the same recorded audio must be deduplicated so it counts as 6 seconds, not 12 seconds (tested in Task 4).
5. When a second audio clip brings a language in a chat from 6 seconds to 11 seconds after the first message's TTS was already played/cached with the default voice, unlocking the clone must evict the cached default-voice TTS for that language in that chat so replaying plays the cloned voice (tested in Task 3 & Task 4).

---

### Task 1: Backend 10s Audio Normalization, Merging, Fish Audio Cloning & Vercel AI Gateway TTS

**Files:**
- Modify: `package.json`
- Create: `src/services/prepareVoiceReference.ts`
- Create: `src/services/fishVoiceCloning.ts`
- Modify: `src/services/generateSpeech.ts`
- Test: `scripts/verify-fish-voice-cloning.mjs`

**Interfaces:**
- Consumes: `SupportedTtsLanguage` from `src/lib/languages.ts`, `generateOpenAiSpeech` from `src/services/generateOpenAiSpeech.ts`
- Produces:
  - `src/services/prepareVoiceReference.ts`:
    - `MIN_VOICE_CLONE_DURATION_MS = 10_000`
    - `MAX_VOICE_CLONE_DURATION_MS = 60_000`
    - `getWavDurationMs(audioBuffer: Buffer): number`
    - `createCanonicalPcmWavBuffer(pcmData: Buffer, sampleRate?: number, channels?: number, bitsPerSample?: number): Buffer`
    - `concatenatePcmWavBuffers(wavBuffers: Buffer[]): Buffer`
    - `prepareVoiceReference(input: { audioBuffer: Buffer; originalFilename: string; mimeType?: string }): Promise<PreparedVoiceReference>`
    - `selectAndMergeVoiceSamplesForCloning(samples: PreparedVoiceReference[], minDurationMs?: number): VoiceCloneSampleSelection`
  - `src/services/fishVoiceCloning.ts`:
    - `FISH_AUDIO_DEFAULT_GATEWAY_MODEL = 'fish-audio/s2.1-pro'`
    - `createFishVoiceClone(input: CreateFishVoiceCloneInput, deps?: FishVoiceCloningDeps): Promise<{ voiceId: string; durationMs: number }>`
    - `generateFishClonedSpeech(input: GenerateFishClonedSpeechInput, deps?: FishVoiceCloningDeps): Promise<Buffer>`
  - `src/services/generateSpeech.ts`:
    - `generateSpeech(input: GenerateSpeechInput, deps?: GenerateSpeechDeps): Promise<Buffer>`

- [ ] **Step 1: Write the failing test (`scripts/verify-fish-voice-cloning.mjs`)**

Test assertions:
1. `createCanonicalPcmWavBuffer` and `getWavDurationMs`: a 10.0s `44100 Hz 16-bit mono` PCM buffer (`44100 * 2 * 10 = 882000` bytes) produces `durationMs === 10000`.
2. `selectAndMergeVoiceSamplesForCloning` (Review Focus #1):
   - Single `9900 ms` sample -> `{ eligible: false, mode: 'insufficient', totalDurationMs: 9900, mergedReference: null }`.
   - Two `4900 ms` samples -> `{ eligible: false, mode: 'insufficient', totalDurationMs: 9800, mergedReference: null }`.
   - Single `10200 ms` sample -> `{ eligible: true, mode: 'single', totalDurationMs: 10200, usedSampleCount: 1 }` with valid WAV header.
   - Three samples (`3500 ms` + `4000 ms` + `3200 ms` = `10700 ms`) -> `{ eligible: true, mode: 'merged', totalDurationMs: 10700, usedSampleCount: 3 }` and `getWavDurationMs(mergedReference.buffer) === 10700`.
3. `createFishVoiceClone`:
   - Rejects `mergedReference` with `durationMs < 10000`.
   - Calls `POST https://api.fish.audio/model` with `Authorization: Bearer <key>` and multipart form fields `type=tts`, `train_mode=fast`, `visibility=private`, and `voices` WAV file; returns `{ voiceId: 'fish_clone_abc', durationMs: 10700 }`.
4. `generateFishClonedSpeech` & `generateSpeech`:
   - Calls Vercel AI SDK `generateSpeech` with model `fish-audio/s2.1-pro` via AI Gateway, `voice: 'fish_clone_abc'`, `outputFormat: 'wav'`, and `providerOptions.fishAudio.referenceId = 'fish_clone_abc'`.
   - When `clonedVoiceId` is omitted or `null`, `generateSpeech` calls `generateOpenAiSpeech` (`default to original`).
   - When `clonedVoiceId` is present but `generateFishClonedSpeech` throws, `generateSpeech` falls back cleanly to `generateOpenAiSpeech`.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx scripts/verify-fish-voice-cloning.mjs`
Expected: FAIL because `src/services/prepareVoiceReference.ts` and `src/services/fishVoiceCloning.ts` do not exist yet.

- [ ] **Step 3: Install packages and implement `prepareVoiceReference.ts`, `fishVoiceCloning.ts`, and `generateSpeech.ts`**

- Install `ai`, `@ai-sdk/gateway`, `@ai-sdk/fish-audio`, and `ffmpeg-static` in root `package.json`.
- Implement `src/services/prepareVoiceReference.ts`, `src/services/fishVoiceCloning.ts`, and update `src/services/generateSpeech.ts`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx scripts/verify-fish-voice-cloning.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add package.json package-lock.json src/services/prepareVoiceReference.ts src/services/fishVoiceCloning.ts src/services/generateSpeech.ts scripts/verify-fish-voice-cloning.mjs
git commit -m "feat(speech): add 10s audio merging and Fish Audio cloning via Vercel AI Gateway"
```

---

### Task 2: Backend Endpoints (`POST /speech/clone`, `POST /speech/output` & Express/Vercel Routing)

**Files:**
- Create: `src/lib/runChatVoiceCloning.ts`
- Create: `api/speech/clone.ts`
- Modify: `src/lib/runOutputTextToSpeech.ts`
- Modify: `api/speech/output.ts`
- Modify: `src/server.ts`
- Modify: `scripts/verify-fish-voice-cloning.mjs`

**Interfaces:**
- Consumes: `prepareVoiceReference`, `selectAndMergeVoiceSamplesForCloning` from `src/services/prepareVoiceReference.ts`; `createFishVoiceClone` from `src/services/fishVoiceCloning.ts`; `generateSpeech` from `src/services/generateSpeech.ts`
- Produces:
  - `runChatVoiceCloning(input: RunChatVoiceCloningInput, deps?: RunChatVoiceCloningDeps): Promise<RunChatVoiceCloningResult>` in `src/lib/runChatVoiceCloning.ts`
  - `POST /speech/clone` & `POST /api/speech/clone` (`src/server.ts`, `api/speech/clone.ts`)
  - Updated `runOutputTextToSpeech` accepting `clonedVoiceId?: unknown`, `conversationId?: unknown`, `sourceLanguage?: unknown`

- [ ] **Step 1: Extend `scripts/verify-fish-voice-cloning.mjs` with endpoint tests**

Add assertions for `runChatVoiceCloning`, `api/speech/clone.ts`, and `runOutputTextToSpeech`:
1. `runChatVoiceCloning` returns `400` on unsupported `language` or empty `samples`, returns `{ ok: true, cloned: false, reason: 'insufficient_duration', clonedVoiceId: null }` when samples total `< 10_000 ms`, and returns `{ ok: true, cloned: true, clonedVoiceId, mode: 'merged', totalDurationMs }` when samples merge to `>= 10_000 ms`.
2. `runOutputTextToSpeech` rejects invalid `clonedVoiceId` format with `400` (`clonedVoiceId is not valid`), passes valid `clonedVoiceId` through to `generateSpeech`, and falls back to server-cached `(conversationId, sourceLanguage)` clone when `conversationId` is provided.
3. `api/speech/clone.ts` handles `OPTIONS` (`204`), non-`POST` (`405`), and JSON/multipart `POST` requests.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx scripts/verify-fish-voice-cloning.mjs`
Expected: FAIL because `src/lib/runChatVoiceCloning.ts` and `api/speech/clone.ts` do not exist yet.

- [ ] **Step 3: Implement `runChatVoiceCloning.ts`, `api/speech/clone.ts`, `runOutputTextToSpeech.ts`, `api/speech/output.ts`, and `src/server.ts`**

- Keep all `console.error` calls in `api/speech/output.ts`, `api/speech/clone.ts`, and `src/server.ts` as single fixed double-quoted string literals (`"..."`) to satisfy `scripts/verify-mobile-processing-audit.mjs`.

- [ ] **Step 4: Run tests to verify they pass**

Run:
```powershell
node --import tsx scripts/verify-fish-voice-cloning.mjs
node --import tsx scripts/verify-mobile-api-contract.mjs
node --import tsx scripts/verify-mobile-processing-audit.mjs
```
Expected: PASS on all 3 scripts.

- [ ] **Step 5: Commit**

```powershell
git add src/lib/runChatVoiceCloning.ts api/speech/clone.ts src/lib/runOutputTextToSpeech.ts api/speech/output.ts src/server.ts scripts/verify-fish-voice-cloning.mjs
git commit -m "feat(api): add POST /speech/clone and clonedVoiceId support on /speech/output"
```

---

### Task 3: Web App (`client/`) Per-Chat, Per-Language 10s Voice Cloning & TTS Integration

**Files:**
- Modify: `client/src/localStore.js`
- Modify: `client/src/chatApi.js`
- Modify: `client/src/components/live/useLiveConversationCapture.js`
- Modify: `client/src/StringPhoneApp.jsx`
- Create: `scripts/verify-web-voice-cloning.mjs`

**Interfaces:**
- Consumes: `POST /api/speech/clone` and `POST /api/speech/output`
- Produces:
  - `client/src/localStore.js`:
    - `MIN_VOICE_CLONE_DURATION_MS = 10_000`
    - `saveAudioAsset(blob, id?, metadata?: { durationMs?: number, captureGroupId?: string }) -> Promise<string>`
    - `getChatVoiceClone(conversationId, languageCode) -> Promise<ChatVoiceCloneRecord | null>`
    - `getChatVoiceClones(conversationId) -> Promise<Record<string, ChatVoiceCloneRecord>>`
    - `setChatVoiceClone(conversationId, languageCode, cloneInput) -> Promise<ChatVoiceCloneRecord>`
    - `collectEligibleCloneAudioSamples(conversationId, languageCode, minDurationMs = 10_000) -> Promise<EligibleCloneSamplesResult>`
  - `client/src/chatApi.js`:
    - `requestChatVoiceClone({ conversationId, language, samples, authFetch, signal })`
    - `fetchOutputSpeech({ text, language, speechVoice, clonedVoiceId, authFetch, signal })`

- [ ] **Step 1: Write the failing test (`scripts/verify-web-voice-cloning.mjs`)**

Test assertions covering Review Focus #1, #2, #3, #5:
1. Below 10s threshold (Review Focus #1): saving an `8500 ms` `'en'` voice message in `conv1` makes `collectEligibleCloneAudioSamples(conv1.id, 'en')` return `{ eligible: false, mode: 'insufficient', totalDurationMs: 8500 }`.
2. Single `>= 10s` sample: saving a `10500 ms` `'en'` voice message in `conv1` makes `collectEligibleCloneAudioSamples(conv1.id, 'en')` return `{ eligible: true, mode: 'single', totalDurationMs: 10500, samples: [sample] }`.
3. Merging multiple samples to `10+s` (Review Focus #3): in `conv1`, saving a `5400 ms` `'es'` voice message (`eligible: false`) followed by a `5100 ms` `'es'` voice message returns `{ eligible: true, mode: 'merged', totalDurationMs: 10500, samples: [s1, s2] }`.
4. Per-language & per-chat isolation (Review Focus #2 & #3): saving `setChatVoiceClone(conv1.id, 'en', { voiceId: 'fish_en_1', totalDurationMs: 10500, mode: 'single' })` sets `'en'` clone on `conv1` while `getChatVoiceClone(conv1.id, 'es')` is `null` and `getChatVoiceClone(conv2.id, 'en')` is `null`. Deleting `conv1` removes `conv1`'s voice clones.
5. Default-voice TTS cache eviction on clone unlock (Review Focus #5): caching `message:m1:translated:marin` for an `'en'` message `m1` in `conv1` and then calling `setChatVoiceClone(conv1.id, 'en', ...)` evicts `message:m1:translated:marin` while leaving `'es'` message caches and `conv2` caches untouched.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx scripts/verify-web-voice-cloning.mjs`
Expected: FAIL because `collectEligibleCloneAudioSamples`, `getChatVoiceClone`, and `setChatVoiceClone` do not exist in `client/src/localStore.js`.

- [ ] **Step 3: Implement Web App per-chat voice cloning in `localStore.js`, `chatApi.js`, `useLiveConversationCapture.js`, and `StringPhoneApp.jsx`**

- In `client/src/localStore.js`: implement `MIN_VOICE_CLONE_DURATION_MS = 10_000`, `durationMs` metadata on `audioAssets`, per-conversation `voiceClones` storage (supporting both IndexedDB conversations and signed-in conversation IDs), `getChatVoiceClone`, `getChatVoiceClones`, `setChatVoiceClone` (with `ttsCache` eviction for messages in `conversationId` matching `sourceLanguageCode`), and `collectEligibleCloneAudioSamples`.
- In `client/src/chatApi.js`: add `requestChatVoiceClone` (`POST /api/speech/clone` with `FormData` containing `language`, `conversationId`, and `samples` files) and add optional `clonedVoiceId` to `fetchOutputSpeech`.
- In `client/src/components/live/useLiveConversationCapture.js`: record `segmentRecorderStartedAtRef.current = performance.now()` on `recorder.start()` and set `audioBlob.durationMs` on stop.
- In `client/src/StringPhoneApp.jsx`: add `measureAudioBlobDurationMs`, save `durationMs` on voice turns (`sendVoiceMessage` and `submitLiveConversationTranscript`), implement `ensureChatLanguageVoiceClone(chatId, languageCode)` with in-flight deduplication, and wire `playGeneratedSpeech` to resolve the message's `sourceLanguageCode` in the active chat and pass `clonedVoiceId` to `fetchOutputSpeech`.

- [ ] **Step 4: Run tests to verify they pass**

Run:
```powershell
node --import tsx scripts/verify-web-voice-cloning.mjs
node --import tsx scripts/verify-web-local-store.mjs
node --import tsx scripts/verify-web-chat-parity.mjs
```
Expected: PASS on all 3 scripts.

- [ ] **Step 5: Commit**

```powershell
git add client/src/localStore.js client/src/chatApi.js client/src/components/live/useLiveConversationCapture.js client/src/StringPhoneApp.jsx scripts/verify-web-voice-cloning.mjs
git commit -m "feat(client): add per-chat 10s single/merged Fish Audio voice cloning on web"
```

---

### Task 4: Android APK (`mobile/`) Per-Chat, Per-Language 10s Voice Cloning & TTS Integration

**Files:**
- Modify: `mobile/src/storage/audio.ts`
- Modify: `mobile/src/adapters/files.ts`
- Modify: `mobile/src/storage/history.ts`
- Modify: `mobile/src/storage/deletion.ts`
- Modify: `mobile/src/adapters/processingTransport.ts`
- Modify: `mobile/src/adapters/speech.ts`
- Modify: `mobile/src/adapters/api.ts`
- Modify: `mobile/src/chat/native.ts`
- Create: `scripts/verify-mobile-voice-cloning.mjs`

**Interfaces:**
- Consumes: `POST /speech/clone` and `POST /speech/output`
- Produces:
  - `mobile/src/storage/audio.ts` & `mobile/src/adapters/files.ts`:
    - `AudioFiles.readBytes?(name: string): Promise<Uint8Array | null>`
    - `createAudioStorage(...).readBytes(owner: AudioOwner): Promise<{ bytes: Uint8Array; mimeType: string; fileName: string; durationMs: number | null } | null>`
  - `mobile/src/storage/history.ts`:
    - `getConversationVoiceClone(conversationId: string, languageCode: string): Promise<ConversationVoiceClone | null>`
    - `getConversationVoiceClones(conversationId: string): Promise<Record<string, ConversationVoiceClone>>`
    - `setConversationVoiceClone(conversationId: string, input: { languageCode: string; voiceId: string; totalDurationMs: number; mode: 'single' | 'merged' }): Promise<ConversationVoiceClone>`
    - `collectEligibleVoiceCloneSamples(conversationId: string, languageCode: string, minDurationMs?: number): Promise<EligibleVoiceCloneSamples>`
  - `mobile/src/adapters/processingTransport.ts` & `mobile/src/adapters/speech.ts`:
    - `PROCESSING_FIELDS['/speech/output'] = ['text', 'language', 'speechVoice', 'clonedVoiceId']`
    - `transport.postVoiceClone(input: { language: string; samples: VoiceCloneSamplePayload[] }, signal?: AbortSignal): Promise<Response>`
    - `createSpeechApi(transport).requestVoiceClone(request: VoiceCloneRequest): Promise<VoiceCloneResult>`
    - `createSpeechApi(transport).requestOutputSpeech(request: OutputSpeechRequest)` accepting `clonedVoiceId?: string`
  - `mobile/src/chat/native.ts`:
    - `ensureConversationVoiceClone(conversationId: string, languageCode: string): Promise<string | null>`

- [ ] **Step 1: Write the failing test (`scripts/verify-mobile-voice-cloning.mjs`)**

Test assertions covering Review Focus #1, #2, #3, #4, #5:
1. Below 10s threshold (Review Focus #1): a `7000 ms` `'en'` voice turn in `conv_a` yields `collectEligibleVoiceCloneSamples('conv_a', 'en')` with `{ eligible: false, mode: 'insufficient', totalDurationMs: 7000 }`, does not call `/speech/clone`, and calls `/speech/output` without `clonedVoiceId` (defaulting to original voice).
2. Multi-utterance live capture deduplication (Review Focus #4): two live messages `live_cap123_item1` and `live_cap123_item2` in `conv_a` from the same `6000 ms` capture session (`cap123`) are deduplicated to `6000 ms` (`eligible: false`), never double-counted as `12000 ms`.
3. Multi-sample merge to `10+s` (Review Focus #3): adding a second distinct `5000 ms` `'en'` recording (`live_cap456_item1`) in `conv_a` brings `'en'` to `6000 + 5000 = 11000 ms` (`eligible: true, mode: 'merged', samples.length === 2`), calls `POST /speech/clone` with both samples, saves `clonedVoiceId` on `conv_a` for `'en'`, and passes `clonedVoiceId` to `/speech/output`.
4. Single `>= 10s` sample: a single `10800 ms` `'es'` recording in `conv_a` returns `{ eligible: true, mode: 'single', totalDurationMs: 10800, samples.length === 1 }`.
5. Per-language & per-chat isolation + cache eviction + deletion cleanup (Review Focus #2, #3, #5):
   - In `conv_a` where `'en'` is cloned (`fish_en_clone`) and `'fr'` only has `4000 ms` (not cloned), `'en'`-speaker messages use `clonedVoiceId: 'fish_en_clone'` while `'fr'`-speaker messages omit `clonedVoiceId`.
   - `conv_b` has `getConversationVoiceClone('conv_b', 'en') === null`.
   - Unlocking `'en'` clone in `conv_a` clears any previously cached non-cloned `translated` TTS in `message_audio` for `'en'` messages in `conv_a` while preserving raw `source` voice recordings (`input_kind = 'voice'`).
   - Deleting `conv_a` via `createDeletionService` removes `chat.voiceClones.conv_a` from `preferences`.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx scripts/verify-mobile-voice-cloning.mjs`
Expected: FAIL because the mobile voice clone methods do not exist yet.

- [ ] **Step 3: Implement Android APK per-chat voice cloning across `mobile/src/`**

- Update `mobile/src/storage/audio.ts`, `mobile/src/adapters/files.ts`, `mobile/src/storage/history.ts`, `mobile/src/storage/deletion.ts`, `mobile/src/adapters/processingTransport.ts`, `mobile/src/adapters/speech.ts`, `mobile/src/adapters/api.ts`, and `mobile/src/chat/native.ts`.

- [ ] **Step 4: Run tests to verify they pass**

Run:
```powershell
node --import tsx scripts/verify-mobile-voice-cloning.mjs
node --import tsx scripts/verify-mobile-adapters.mjs
node --import tsx scripts/verify-mobile-history.mjs
node --import tsx scripts/verify-mobile-local-history.mjs
node --import tsx scripts/verify-mobile-chat-controller.mjs
node --import tsx scripts/verify-mobile-chat-history.mjs
node --import tsx scripts/verify-mobile-speech-output.mjs
node --import tsx scripts/verify-mobile-voice-api.mjs
```
Expected: PASS on all mobile verification scripts.

- [ ] **Step 5: Commit**

```powershell
git add mobile/src/storage/audio.ts mobile/src/adapters/files.ts mobile/src/storage/history.ts mobile/src/storage/deletion.ts mobile/src/adapters/processingTransport.ts mobile/src/adapters/speech.ts mobile/src/adapters/api.ts mobile/src/chat/native.ts scripts/verify-mobile-voice-cloning.mjs
git commit -m "feat(mobile): add per-chat 10s single/merged Fish Audio voice cloning on APK"
```

---

### Task 5: Whole-Branch Verification, Production Build & Code Review

**Files:**
- Verify: all `scripts/verify-*.mjs` tests, `npm.cmd run build`, `git diff --check`

- [ ] **Step 1: Run the entire repository verification suite and production client build**

Run:
```powershell
Get-ChildItem scripts/verify-*.mjs | ForEach-Object {
  if ($_.Name -in @('verify-tts-audio.mjs', 'verify-saved-message-playback.mjs')) { return }
  Write-Host "=== Running $($_.Name) ==="
  node --import tsx $_.FullName
  if ($LASTEXITCODE -ne 0) { throw "Failed $($_.Name)" }
}
npm.cmd run build
git diff --check
```
Expected: Every test script exits 0, `npm.cmd run build` succeeds, and `git diff --check` is clean.

- [ ] **Step 2: Run final whole-branch code review and resolve any Critical/Important findings with TDD**

Dispatch a fresh code reviewer subagent on the branch diff (`feat/expo-mobile-sqlite..HEAD`) against the spec and Review Focus items.
