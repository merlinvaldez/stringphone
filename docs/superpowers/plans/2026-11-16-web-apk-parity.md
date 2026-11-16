# Web App Parity with Android APK Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update the `client/` web application (and signed-in Phrasebook update endpoint) so the Vercel production site delivers full feature, layout, and zero-login UX parity with the Android APK (`mobile/src/`), then verify the production build before user-approved deployment.

**Architecture:** Extract a clean IndexedDB + `localStorage` persistence module (`client/src/localStore.js`) mirroring `mobile/src/storage/` so signed-out visitors store conversations, messages, Phrasebook entries, and binary audio `Blob`s locally without hitting `localStorage` limits or touching Postgres, while keeping existing signed-in Clerk/Postgres flows intact (`specs/expo-mobile-web-compatibility.md`). Update `client/src/` views (`StringPhoneApp.jsx`, `ChatHeader.jsx`, `MessageBubble.jsx`, `ChatHistorySidebar.jsx`, `CollectionScreen.jsx`, `useLiveConversationCapture.js`, `useLiveTurnFlow.js`) and add `PhraseEditorModal.jsx` and `PATCH /collections/entries` to match the APK's controls, navigation, and live mic warmup.

**Tech Stack:** React 19, Vite 7, Tailwind CSS 3, Lucide icons, Browser IndexedDB / `localStorage`, WebRTC + MediaRecorder, Node 25 (`node:assert/strict` + `tsx`), Express 5 / Vercel Functions.

**Spec:** [2026-11-16-web-apk-parity-design.md](../specs/2026-11-16-web-apk-parity-design.md)

## Global Constraints

- Zero login walls: Chat, Single, Conversation, History, Phrasebook, `Save to Phrasebook`, and `AI TTS voice` (`Female`/`Male`) must work immediately for signed-out guests.
- Keep `mobile/` completely unmodified as the source of truth; preserve `specs/expo-mobile-web-compatibility.md` (no Postgres schema drops or broken authenticated routes).
- Never send local IndexedDB conversation IDs as Postgres `conversationId` parameters to server processing routes.
- Never store binary audio recordings in `localStorage`; store audio `Blob`s in IndexedDB (`stringphone-local-v1`) and revoke temporary object URLs on unmount/replacement.
- Never autoplay translated TTS audio; stop active playback before starting recording and ensure only one audio player runs at a time.
- Support both `audio/mp4` (iOS Safari) and `audio/webm` (Chrome/Android) blobs cleanly; apply RTL `dir="rtl"` and right alignment for `arabic`/`hebrew` writing systems (`shared/languages.ts`).
- Do not commit, push, or deploy to Vercel production until implementation and checks pass and the user explicitly confirms deployment.

## Review Focus

1. Deleting a conversation that contributed a Phrasebook card with saved audio must delete the conversation, its messages, and unreferenced audio blobs while keeping the Phrasebook card and its referenced audio intact (tested in Task 1).
2. Switching `AI TTS voice` (`marin` ↔ `onyx`) after playing a message or phrase must generate and play speech using the new voice rather than returning a cached clip from the previous voice (tested in Task 1).
3. Starting recording while audio is playing (or double-clicking Mic/Send) must stop active playback immediately and reject overlapping starts/sends (tested in Task 4 & Task 5).
4. Creating or editing a guest Phrasebook card with an empty `meaningText` (or viewing typed `Chat` turns inside `Single`/`Conversation`) must render card lists, flashcard backs, and `TranscriptCard`s without empty-string TTS errors or missing-audio crashes (tested in Task 1, Task 5, Task 6).
5. Returning to a browser tab after >50s idle or changing the language pair before tapping Mic must invalidate stale prefetched OpenAI Realtime secrets so capture never uses an expired or wrong-language token (tested in Task 4).

---

### Task 1: Browser-Local Storage Module (`client/src/localStore.js`)

**Files:**
- Create: `client/src/localStore.js`
- Test: `scripts/verify-web-local-store.mjs`

**Interfaces:**
- Consumes: `getSupportedTtsLanguage` from `../../shared/languages.ts`
- Produces (`client/src/localStore.js`):
  - `createMemoryStorageDriver()` (for Node unit tests)
  - `createIndexedDbDriver(dbName = 'stringphone-local-v1')`
  - `createLocalStore({ driver, prefsStorage, newId, now })` returning:
    - `getPreferences() -> { activeConversationId: string | null, myLanguageCode: string, theirLanguageCode: string, ttsVoice: 'marin' | 'onyx' }`
    - `setLanguagePair(myCode, theirCode) -> Promise<{ myLanguageCode, theirLanguageCode }>`
    - `setTtsVoice(voice) -> Promise<'marin' | 'onyx'>`
    - `setActiveConversationId(id | null) -> Promise<void>`
    - `listConversations(query = '') -> Promise<LocalConversation[]>`
    - `getConversation(id) -> Promise<LocalConversation | null>`
    - `createConversation({ title?, originMode, myLanguageCode, theirLanguageCode }) -> Promise<LocalConversation>`
    - `updateConversationLanguages(id, myLanguageCode, theirLanguageCode) -> Promise<LocalConversation | null>`
    - `deleteConversation(id) -> Promise<{ deleted: boolean, orphanedAudioCount: number }>`
    - `listMessages(conversationId) -> Promise<LocalMessage[]>`
    - `saveMessage(messageRecord) -> Promise<LocalMessage>` (upserts by `id`, auto-titles `'New chat' | 'Single session' | 'Two-way conversation'` on first completed turn up to 80 chars)
    - `saveAudioAsset(blob, id?) -> Promise<string>` and `getAudioAsset(id) -> Promise<{ id, blob, mimeType, createdAt } | null>`
    - `getCachedTtsAudio(cacheKey) -> Promise<Blob | null>` and `putCachedTtsAudio(cacheKey, blob) -> Promise<void>` (cacheKey format `${ownerKind}:${ownerId}:${role}:${voice}`)
    - `listSavedSourceMessageIds() -> Promise<Set<string>>`
    - `listPhrasebookCollections(query = '') -> Promise<CollectionSummary[]>`
    - `getPhrasebookCollection(languageCode, query = '') -> Promise<CollectionDetail | null>`
    - `savePhrasebookFromMessage(messagePayload) -> Promise<{ created: boolean, collection, entry }>`
    - `createPhrasebookEntry(input, { allowOptionalMeaning = true }) -> Promise<{ created: true, collection, entry }>`
    - `updatePhrasebookEntry(id, input, { allowOptionalMeaning = true }) -> Promise<{ collection, entry }>`
    - `deletePhrasebookEntry(id) -> Promise<{ deleted: boolean }>`

- [ ] **Step 1: Write the failing test (`scripts/verify-web-local-store.mjs`)**

Test assertions to include:
1. Preference roundtrip: `setLanguagePair('en', 'es')`, `setTtsVoice('onyx')`, `setActiveConversationId(conv.id)` survive `getPreferences()`.
2. Conversation auto-titling & mode tags: creating `'New chat'` (`originMode: 'chat'`) and saving a ready message updates `title` to the trimmed first 80 chars; creating `'Single session'` (`originMode: 'single'`) retains `originMode` and updates title on first completed voice transcript.
3. Retry deduplication: saving a `'error'` message with `id: 'msg-1'` and then re-saving `'ready'` with the same `id: 'msg-1'` produces 1 message in `listMessages(conv.id)`, not 2.
4. Search & reference-safe deletion (Review Focus #1): save a ready voice message with `sourceAudioId` into Phrasebook (`savePhrasebookFromMessage`), verify `listConversations('Buenos')` matches message text, then `deleteConversation(conv.id)` — assert conversation and messages are gone, Phrasebook entry still exists with its text & `sourceAudioId` blob intact in `getAudioAsset(sourceAudioId)`, while unreferenced `audioAssets` from non-saved messages in that deleted conversation are removed.
5. Per-voice TTS cache isolation (Review Focus #2): `putCachedTtsAudio('message:m1:translated:marin', blobA)` and `putCachedTtsAudio('message:m1:translated:onyx', blobB)` do not overwrite each other; `getCachedTtsAudio('message:m1:translated:onyx')` returns `blobB`.
6. Optional `meaningText` + edit & collection re-homing (Review Focus #4): `createPhrasebookEntry({ targetLanguageCode: 'es', sourceLanguageCode: 'en', phraseText: 'Hola', meaningText: '' }, { allowOptionalMeaning: true })` succeeds, `updatePhrasebookEntry(id, { targetLanguageCode: 'fr', sourceLanguageCode: 'en', phraseText: 'Salut', meaningText: 'Hi' })` moves the card from `'es'` collection to `'fr'` collection and updates counts, and `deletePhrasebookEntry(id)` cleans up unreferenced audio.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx scripts/verify-web-local-store.mjs`
Expected: FAIL because `client/src/localStore.js` does not exist yet.

- [ ] **Step 3: Implement `client/src/localStore.js`**

- Define IndexedDB schema `stringphone-local-v1` (version 1) with stores `conversations` (`keyPath: 'id'`), `messages` (`keyPath: 'id'`, index `conversationId`), `phrasebook` (`keyPath: 'id'`, indexes `targetLanguageCode`, `sourceMessageId`), `audioAssets` (`keyPath: 'id'`), and `ttsCache` (`keyPath: 'cacheKey'`).
- Implement `createMemoryStorageDriver()` implementing the same async store primitives (`get`, `getAll`, `getByIndex`, `put`, `delete`, `clear`) so `createLocalStore` executes the exact same business logic in Node tests and browser IndexedDB.
- Implement reference-counting helper `cleanupUnreferencedAudio(driver, candidateAudioIds)`: scan `messages` (`sourceAudioId`, `translatedAudioId`) and `phrasebook` (`sourceAudioId`, `meaningAudioId`) and delete only IDs not referenced anywhere.
- Validate `phraseText` required (max 500 chars) and `meaningText` optional when `allowOptionalMeaning` is true; deduplicate `savePhrasebookFromMessage` by `sourceMessageId` or normalized `(targetLanguageCode, phraseText, meaningText)`.
- Sort Phrasebook collections alphabetically by English language sort name (`getSupportedTtsLanguage(code)?.name ?? code`) and search both `conversations` (title + any message `originalText`/`translatedText`/`transcript`) and `phrasebook` (phrase, meaning, pronunciations, notes, language name).

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx scripts/verify-web-local-store.mjs`
Expected: PASS (all assertions green).

- [ ] **Step 5: Commit**

```powershell
git add client/src/localStore.js scripts/verify-web-local-store.mjs
git commit -m "feat(client): add browser IndexedDB local store for zero-login APK parity"
```

---

### Task 2: Signed-in Postgres Phrasebook Edit Endpoint (`PATCH /collections/entries`)

**Files:**
- Modify: `src/db/queries/languageCollections.ts:478-633`
- Modify: `src/services/languageCollections.ts:77-180`
- Modify: `api/collections/entries.ts:22-78`
- Modify: `src/server.ts:630-690`
- Modify: `client/src/chatApi.js:417-448`
- Test: `scripts/verify-collection-update-validation.mjs`

**Interfaces:**
- Consumes: `getOrCreateLanguageCollection`, `normalizeEntry` in `src/db/queries/languageCollections.ts`
- Produces:
  - `updateLanguageCollectionEntry(params)` in `src/db/queries/languageCollections.ts`
  - `updateLanguageCollectionEntryForUser({ userId, body })` in `src/services/languageCollections.ts`
  - `PATCH /api/collections/entries` (`api/collections/entries.ts`) & `PATCH /collections/entries` (`src/server.ts`)
  - `updateCollectionEntry(authFetch, payload)` in `client/src/chatApi.js` returning `{ collection, entry }`

- [ ] **Step 1: Write the failing test (`scripts/verify-collection-update-validation.mjs`)**

Verify `parseCollectionUpdateInput` (exported pure helper from `src/services/languageCollections.ts`):
- Rejects missing `entryId` with `CollectionRequestError(..., 400)`.
- Rejects empty `phraseText` or empty `meaningText` with `400`.
- Rejects unsupported `targetLanguageCode` / `sourceLanguageCode` with `400`.
- Normalizes valid fields (`entryId`, `targetLanguageCode`, `sourceLanguageCode`, `phraseText`, `phrasePronunciation`, `meaningText`, `meaningPronunciation`, `noteText`).

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx scripts/verify-collection-update-validation.mjs`
Expected: FAIL with missing `parseCollectionUpdateInput` export.

- [ ] **Step 3: Implement update query, service, Express/Vercel `PATCH` handlers, and `chatApi.js` client**

- In `src/db/queries/languageCollections.ts`: add `updateLanguageCollectionEntry` checking ownership (`id = $1 AND user_id = $2 AND archived_at IS NULL`), resolving `getOrCreateLanguageCollection` if `targetLanguageCode` changed, updating `collection_id`, `phrase_text`, `phrase_pronunciation`, `meaning_text`, `meaning_pronunciation`, `note_text`, `source_language_code`, `target_language_code`, `updated_at = now()`, and touching collection `updated_at`. No schema changes.
- In `src/services/languageCollections.ts`: export `parseCollectionUpdateInput(body)` and `updateLanguageCollectionEntryForUser({ userId, body })`.
- In `api/collections/entries.ts` and `src/server.ts`: allow `PATCH` method alongside `POST` and `DELETE` (`src/auth/vercel.ts` already allows `PATCH` in `Access-Control-Allow-Methods`).
- In `client/src/chatApi.js`: add `updateCollectionEntry(authFetch, payload)` sending `PATCH ${API_BASE_URL}/collections/entries`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx scripts/verify-collection-update-validation.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/db/queries/languageCollections.ts src/services/languageCollections.ts api/collections/entries.ts src/server.ts client/src/chatApi.js scripts/verify-collection-update-validation.mjs
git commit -m "feat(api): add PATCH /collections/entries for signed-in phrasebook editing"
```

---

### Task 3: Top Bar Settings Gear, `Return home` Preservation & Shared Room `Leave` Control

**Files:**
- Modify: `client/src/StringPhoneApp.jsx:234-395,2167-2290,4854-4886`
- Modify: `client/src/components/chat/ChatHeader.jsx:1-123`
- Test: `scripts/verify-web-shell-parity.mjs`

**Interfaces:**
- Consumes: `handleTtsVoiceChange`, `leaveSharedRoom`, `SharedRoomControls` in `client/src/StringPhoneApp.jsx`
- Produces:
  - `FloatingAuthControls` rendering a circular `40px` `Settings` gear trigger (`aria-label="AI TTS voice settings"`) for signed-out users (and gear/avatar menu for signed-in users), always displaying `AI TTS voice` (`Female` / `Male`) at top and a quiet `Sign in` / `Sign out` footer below a hairline divider.
  - `handleReturnHome()` switching `appMode` to `'chat'` while **keeping** `messages`, `currentConversationId`, and `activeLocalConversationId` intact (without clearing messages or wiping the active conversation).
  - `SharedRoomControls` rendered inside `ChatHeader` whenever `sharedRoomSession` is active, including an explicit `Leave` button (`onLeaveRoom`) for both `?join=` guests and hosts.

- [ ] **Step 1: Write the failing test (`scripts/verify-web-shell-parity.mjs`)**

Inspect/assert the exported or source contracts:
1. Read `client/src/StringPhoneApp.jsx` and `client/src/components/chat/ChatHeader.jsx`: assert `FloatingAuthControls` renders `AI TTS voice` / `Female` / `Male` unconditionally outside the `isSignedIn ? ...` branch.
2. Assert `handleReturnHome` does NOT call `clearMessages()` or `setCurrentConversationId(null)` (preserving active conversation on `Return home` just like `mobile/src/components/AppShell.tsx`).
3. Assert `SharedRoomControls` accepts `onLeaveRoom` / renders a `Leave` button for `isGuestParticipant`, and `ChatHeader.jsx` renders `<SharedRoomControls` when `sharedRoomSession` is truthy.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx scripts/verify-web-shell-parity.mjs`
Expected: FAIL because `FloatingAuthControls` hides `AI TTS voice` behind `isSignedIn`, `handleReturnHome` clears messages, and `ChatHeader` does not render `SharedRoomControls`.

- [ ] **Step 3: Update `FloatingAuthControls`, `handleReturnHome`, `SharedRoomControls`, and `ChatHeader.jsx`**

- Import `Settings` and `LogOut` from `lucide-react` in `client/src/StringPhoneApp.jsx`.
- Update `FloatingAuthControls` so signed-out users see the circular `Settings` gear button (`h-10 w-10 rounded-full border border-white/12 bg-black/35`), opening the popover with `AI TTS voice` (`Female`/`Male`) at the top for everyone and a subtle `Sign in` footer link below a `border-t border-white/10`. Signed-in users keep the same popover structure with `Sign out`.
- Update `handleReturnHome` to close the sidebar, leave `messages` and `currentConversationId` intact, and set `appMode` to `'chat'`.
- Add `onLeaveRoom` prop to `SharedRoomControls` (rendering a `Leave` button for guests, plus host leave/untoggle), pass `onLeaveSharedRoom={leaveSharedRoom}` through `ChatScreen` -> `ChatHeader`, and render `<SharedRoomControls ... />` in `ChatHeader` only when `sharedRoomSession` is active so normal Chat headers remain uncluttered.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx scripts/verify-web-shell-parity.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add client/src/StringPhoneApp.jsx client/src/components/chat/ChatHeader.jsx client/src/components/chat/ChatScreen.jsx scripts/verify-web-shell-parity.mjs
git commit -m "feat(client): match APK top bar settings, return-home navigation, and room leave control"
```

---

### Task 4: Live Mic Token Prefetching, Socket Prewarm & Audio Playback Coordination

**Files:**
- Modify: `client/src/components/live/useLiveConversationCapture.js:1-140,440-615`
- Modify: `client/src/components/live/useLiveTurnFlow.js:1-148`
- Modify: `client/src/StringPhoneApp.jsx:2943-2960`
- Modify: `scripts/verify-mobile-mic-listening-state.mjs`

**Interfaces:**
- Consumes: `createLiveTranscriptionClientSecret` from `client/src/chatApi.js`
- Produces (`client/src/components/live/useLiveConversationCapture.js`):
  - `SECRET_REFRESH_INTERVAL_MS = 40_000`
  - `prefetchTranscriptionSecret({ sourceLanguage, targetLanguage, authFetch })`
  - `prefetchBothTranscriptionSecrets({ myLang, theirLang, authFetch })`
  - `clearPrefetchedTranscriptionSecrets()`
  - `createSecretCacheHarness()` (pure helper or module export tested directly in Node for TTL `50_000ms`, early refresh `12_000ms`, and language-pair cache keys)
- Produces (`client/src/components/live/useLiveTurnFlow.js`):
  - Accepts `onBeforeCapture` callback invoked immediately before `startListening(...)` (calling `stopAllPlayback()` in `StringPhoneApp.jsx`).

- [ ] **Step 1: Extend `scripts/verify-mobile-mic-listening-state.mjs` with failing tests (Review Focus #3 & #5)**

Add assertions verifying:
1. `useLiveConversationCapture.js` defines `SECRET_REFRESH_INTERVAL_MS = 40_000` (or `40000`), `prefetchBothTranscriptionSecrets`, and `prewarmRealtimeSocket`.
2. Simulated secret cache (imported from `useLiveConversationCapture.js` or pure helper `client/src/components/live/secretCache.js`):
   - Prefetching `en -> es` and `es -> en` caches two distinct entries and throttles socket prewarm.
   - Consuming a token older than `50_000ms` discards the stale token and fetches a fresh one.
   - Switching `myLang`/`theirLang` never returns a cached token for the previous language pair.
3. `useLiveTurnFlow.js` invokes `onBeforeCapture?.()` before calling `startListening(...)`.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx scripts/verify-mobile-mic-listening-state.mjs`
Expected: FAIL because `useLiveConversationCapture.js` does not yet prefetch/prewarm secrets.

- [ ] **Step 3: Implement token prefetching, socket prewarming, and playback coordination**

- Extract small pure helper `client/src/components/live/secretCache.js` (zero browser/React dependencies so Node tests import and execute it directly!) implementing `SECRET_CACHE_TTL_MS = 50_000`, `SECRET_EARLY_REFRESH_WINDOW_MS = 12_000`, `SECRET_REFRESH_INTERVAL_MS = 40_000`, `SOCKET_PREWARM_MIN_INTERVAL_MS = 25_000`, `prewarmRealtimeSocket`, `prefetchTranscriptionSecret`, `prefetchBothTranscriptionSecrets`, `consumeOrCreateTranscriptionSecret`, and `clearPrefetchedTranscriptionSecrets`.
- Use `consumeOrCreateTranscriptionSecret` inside `useLiveConversationCapture.js` `startListening` (preserving the existing uncommitted parallel `Promise.all([clientSecretPromise, localSdpPromise])`, `ICE_CANDIDATE_SETTLE_MS = 10`, `waitForEventsChannelOpen`, and `hasLiveTrack` checks).
- In `useLiveTurnFlow.js`: prefetch both directions on mount and whenever `myLang?.code` or `theirLang?.code` changes while `document.visibilityState === 'visible'`, refresh every `SECRET_REFRESH_INTERVAL_MS` (`40_000ms`) on `visibilitychange`/interval, and call `onBeforeCapture?.()` right before `startListening(...)` (blocking duplicate starts while `status !== 'idle'`).
- In `StringPhoneApp.jsx`: pass `onBeforeCapture={stopAllPlayback}` into `ChatScreen`, `SingleModeScreen`, and `ConversationScreen`. Also ensure `TextToSpeechButton` pauses any playing `VoiceMessagePlayer` via `onAudioPlay` / `stopAllPlayback`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx scripts/verify-mobile-mic-listening-state.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

Stage the task files (including the pre-existing uncommitted latency/state updates in `client/src/components/live/useLiveConversationCapture.js` and `scripts/verify-mobile-mic-listening-state.mjs`, while leaving `mobile/src/live/` untouched):

```powershell
git add client/src/components/live/secretCache.js client/src/components/live/useLiveConversationCapture.js client/src/components/live/useLiveTurnFlow.js client/src/StringPhoneApp.jsx client/src/components/chat/ChatScreen.jsx scripts/verify-mobile-mic-listening-state.mjs
git commit -m "feat(client): port APK realtime token prefetching, socket prewarm, and playback coordination"
```

---

### Task 5: Wire Guest `localStore` Across Chat, Single, Conversation & History Drawer

**Files:**
- Modify: `client/src/StringPhoneApp.jsx`
- Modify: `client/src/components/chat/MessageBubble.jsx:18-270`
- Modify: `client/src/components/chat/ChatHistorySidebar.jsx:33-690`
- Test: `scripts/verify-web-chat-parity.mjs`

**Interfaces:**
- Consumes: `createLocalStore`, `createIndexedDbDriver` from `client/src/localStore.js`; `isRtlLanguage` from `../../shared/languages.ts` (or re-exported via `client/src/utils.js`)
- Produces:
  - `StringPhoneApp.jsx`:
    - When `!isSignedIn`: initializes from `localStore`, saves text/voice/live turns + audio blobs into `localStore`, persists `activeLocalConversationId`, resolves `blob:` URLs cleanly (revoking on message removal/replacement/unmount), caches TTS WAVs per `(owner, role, ttsVoice)` in `localStore`, retries failed messages in place without duplicate message IDs, tracks `savedSourceMessageIds`, and exposes `Single` + `Conversation` all-message shared carousel (`messages` + mode `liveDrafts`) with `Save to Phrasebook` on `TranscriptCard`.
    - `SingleModeScreen`: adds circular `Invert languages` button (`ArrowLeftRight`) centered between `My language` and `Their language` below Speak/Listen columns, disabled while recording/processing or when languages match; updates status labels (`CONNECTING...`, `LISTENING · Xs`, `TRANSLATING`).
    - `ConversationScreen`: turns the center `<StringPhoneBrand compact />` divider badge into an interactive `<button aria-label="Invert languages">` that swaps `myLang` and `theirLang` and triggers a `450ms` cubic-out `360°` spin animation (preserving `-90deg` in landscape); adds `Save to Phrasebook` bookmark button and RTL direction to `TranscriptCard`.
  - `MessageBubble.jsx`: applies RTL `dir="rtl"` & `text-right` based on `isRtlLanguage(languageCode)`, renders `"Translating"` / `"Needs retry"` badges matching APK, passes `isSavedInPhrasebook` so bookmark displays saved checkmark on initial load too.
  - `ChatHistorySidebar.jsx`: removes `Sign in` callout; accepts `localStore` (or `conversations`/`collections` loaders + `onDeleteConversation`); adds `Search titles or messages` / `Search phrasebook` input; displays `· Single` / `· Conversation` mode tags; creates `New Conversation` tagged with active `originMode` (`'chat' | 'single' | 'conversation'`); confirms permanent delete on local conversations.

- [ ] **Step 1: Write the failing test (`scripts/verify-web-chat-parity.mjs`)**

Test assertions covering:
1. Export pure helper `client/src/chatParityHelpers.js` (used by `StringPhoneApp.jsx`, `MessageBubble.jsx`, `ChatHistorySidebar.jsx`):
   - `getCarouselMessages(messages, liveDrafts, originMode)` returns **all** ready/non-draft messages from `messages` (including typed `Chat` text messages — Review Focus #4) plus `liveDrafts` filtered by `originMode`, sorted chronologically.
   - `getTranscriptCardControlFlags(message, playbackMode, hasSaveHandler)` omits source-voice play for `kind === 'text'` while keeping translated TTS and `canSaveToPhrasebook` enabled when `status === 'ready'` and both texts are non-empty.
   - `formatHistoryRowMeta(conversation)` includes `· Single` for `originMode === 'single'` and `· Conversation` for `originMode === 'conversation'`.
   - `getTextDirectionAttrs(languageCode)` returns `{ dir: 'rtl', className: 'text-right' }` for `ar`/`he`/`fa` and `{ dir: 'ltr', className: 'text-left' }` for `en`/`es`.
2. Source checks verifying:
   - `ChatHistorySidebar.jsx` has no signed-out `Sign in` callout blocking the drawer and includes the search input (`Search titles or messages` / `Search phrasebook`).
   - `SingleModeScreen` renders an `Invert languages` button between `ActionColumn` language selectors.
   - `ConversationScreen` renders a clickable `Invert languages` button around the center `StringPhoneBrand` divider badge with spin animation.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx scripts/verify-web-chat-parity.mjs`
Expected: FAIL because `client/src/chatParityHelpers.js` and the updated UI controls do not exist yet.

- [ ] **Step 3: Implement `chatParityHelpers.js` and wire `localStore`, `MessageBubble`, `ChatHistorySidebar`, `SingleModeScreen`, and `ConversationScreen`**

- Create `client/src/chatParityHelpers.js` with `getCarouselMessages`, `getTranscriptCardControlFlags`, `formatHistoryRowMeta`, and `getTextDirectionAttrs` (importing `SUPPORTED_TTS_LANGUAGE_OPTIONS` / `getSupportedTtsLanguage` from `../../shared/languages.ts`).
- Update `MessageBubble.jsx` to use `getTextDirectionAttrs`, `"Needs retry"` / `"Translating"` parity labels, and external `isSaved` prop synced with `savedSourceMessageIds`.
- Update `TranscriptCard` in `StringPhoneApp.jsx` to apply `getTextDirectionAttrs`, render `Save to Phrasebook` bookmark button (`Bookmark` / `Check` / `Loader2`), and receive `getCarouselMessages(messages, liveDrafts, ...)` in both `SingleModeScreen` and `ConversationScreen`.
- Add `Invert languages` button between the `LanguageSelector`s in `SingleModeScreen` (matching `SingleView.tsx`'s `[My Language] [Invert] [Their Language]` bottom row while keeping `SPEAK` and `LISTEN` aligned above their respective pickers).
- Make the center divider logo in `ConversationScreen` a clickable `<button>` (`aria-label="Invert languages"`, disabled when capturing/processing or `myLang.code === theirLang.code`) that rotates `360deg` over `450ms` cubic-out via CSS transition/state counter (inside a `landscape:-rotate-90` wrapper so landscape stays upright).
- Wire guest `localStore` in `StringPhoneApp.jsx` for:
  - Startup load of active conversation + messages + `savedSourceMessageIds` + preferences when `!isSignedIn`.
  - Auto-creating local conversation on first send/record if none selected (`originMode: appMode`), saving pending -> ready/error records in `localStore`, retrying in place (`existingMessageId`), storing source audio blobs via `saveAudioAsset`, and caching/reading TTS audio via `getCachedTtsAudio` / `putCachedTtsAudio`.
  - Supporting `New Conversation` (`createConversation` with `originMode: appMode`), opening local conversations (resolving `sourceAudioId` into `blob:` URLs cleanly), and deleting local conversations with `window.confirm` confirmation.
- Update `ChatHistorySidebar.jsx` to remove the signed-out callout, add the search box (`query` state filtering `localStore.listConversations(query)` / `localStore.listPhrasebookCollections(query)` when signed out, and client-side filtering when signed in), pass `currentOriginMode` on `New Conversation`, show `· Single` / `· Conversation` badges, and confirm permanent deletion for local items.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx scripts/verify-web-chat-parity.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add client/src/chatParityHelpers.js client/src/StringPhoneApp.jsx client/src/components/chat/MessageBubble.jsx client/src/components/chat/ChatHistorySidebar.jsx scripts/verify-web-chat-parity.mjs
git commit -m "feat(client): wire local IndexedDB chat/history and APK parity for Single and Conversation"
```

---

### Task 6: Phrasebook Zero-Login Parity, `Manual fields`, `Edit card` & Flashcards

**Files:**
- Create: `client/src/components/learning/PhraseEditorModal.jsx`
- Modify: `client/src/components/learning/CollectionScreen.jsx:1-1310`
- Modify: `client/src/components/learning/LearningScreen.jsx:20-106`
- Modify: `client/src/StringPhoneApp.jsx:4999-5021`
- Test: `scripts/verify-web-phrasebook-parity.mjs`

**Interfaces:**
- Consumes: `localStore` Phrasebook & audio methods (`listPhrasebookCollections`, `getPhrasebookCollection`, `createPhrasebookEntry`, `updatePhrasebookEntry`, `deletePhrasebookEntry`, `getAudioAsset`, `getCachedTtsAudio`, `putCachedTtsAudio`), `updateCollectionEntry` from `chatApi.js`, `getTextDirectionAttrs` from `client/src/chatParityHelpers.js`
- Produces:
  - `PhraseEditorModal` (`{ isOpen, entry, availableLanguages, requireMeaning, isSaving, error, onClose, onSave }`) with front-first fields:
    1. `targetLanguageCode` (`Phrase language`, locked when editing if desired or selectable across `availableLanguages`)
    2. `sourceLanguageCode` (`Meaning language`)
    3. `phraseText` (`Phrase`, required)
    4. `phrasePronunciation` (`Phrase pronunciation (optional)`)
    5. `meaningText` (`Meaning / Translation`, optional when `!requireMeaning`, required when `requireMeaning`)
    6. `meaningPronunciation` (`Meaning pronunciation (optional)`)
    7. `noteText` (`Note (optional)`)
  - Updated `CollectionScreen.jsx` supporting both guest (`!isSignedIn` -> `localStore`) and signed-in (`isSignedIn` -> `chatApi.js`), `Manual fields` toggle in `CollectionComposer`, `Edit` action in `CollectionDetailView` card menu, permanent delete confirmation for local cards, and clean empty-meaning fallback in cards and `CollectionEntryViewer`.

- [ ] **Step 1: Write the failing test (`scripts/verify-web-phrasebook-parity.mjs`)**

Test assertions covering:
1. Export pure helper `client/src/components/learning/phrasebookHelpers.js`:
   - `validatePhrasebookEditorInput(input, { requireMeaning })`: requires non-empty `phraseText`, allows empty `meaningText` when `requireMeaning === false` (Review Focus #4), rejects empty `meaningText` when `requireMeaning === true`.
   - `getFlashcardBackDisplay(entry)`: omits meaning text and disables meaning TTS button when `meaningText` is empty, while keeping `noteText` and `"Tap card to flip"` intact.
2. Source checks verifying:
   - `CollectionScreen.jsx` does NOT gate `!isSignedIn` behind `SignInCallout` (routes to `localStore` when `!isSignedIn`).
   - `CollectionComposer` includes a `Manual fields` toggle allowing offline/direct field entry.
   - `CollectionDetailView` card action menu includes both `Edit` (`Edit card`) and delete actions.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx scripts/verify-web-phrasebook-parity.mjs`
Expected: FAIL because `phrasebookHelpers.js`, `PhraseEditorModal.jsx`, and guest `CollectionScreen` parity do not exist yet.

- [ ] **Step 3: Implement `PhraseEditorModal.jsx`, `phrasebookHelpers.js`, and update `CollectionScreen.jsx` / `LearningScreen.jsx`**

- Create `client/src/components/learning/phrasebookHelpers.js` with `validatePhrasebookEditorInput` and `getFlashcardBackDisplay`.
- Create `client/src/components/learning/PhraseEditorModal.jsx` matching the dark zinc/emerald modal aesthetic (`backdrop-blur-sm`, `rounded-[1.75rem]`, `border-white/10`, `bg-zinc-900`), front-first field layout (`Phrase language` / `Meaning language`, `Phrase`, `Phrase pronunciation`, `Meaning`, `Meaning pronunciation`, `Note`), and `getTextDirectionAttrs` on inputs.
- Update `CollectionScreen.jsx`:
  - Accept `localStore` (and `ttsVoice`) props from `LearningScreen` / `StringPhoneApp`.
  - Remove the `if (!isSignedIn) return <SignInCallout ... />` gate; load collections and collection detail via `localStore` when `!isSignedIn` and `chatApi` when `isSignedIn`.
  - Add `Manual fields` toggle button inside `CollectionComposer` switching between single-input auto-translate (`Word or phrase`) and inline front-first manual fields (`phraseText`, `phrasePronunciation`, `meaningText`, `meaningPronunciation`, `noteText`, locking `targetLanguageCode` to `activeLanguageCode` when inside a collection, or selectable from root).
  - Add `Edit` button (`Pencil` icon) inside `[data-collection-card-actions]` next to `Trash2` to open `PhraseEditorModal`.
  - Resolve stored `sourceAudioId` / `meaningAudioId` blobs from `localStore` for `VoiceMessagePlayer` when `!isSignedIn`, and allow offline/cached TTS playback via `localStore` per `(entry.id, role, ttsVoice)`.
  - Confirm before deleting local cards (`window.confirm`) and call `localStore.deletePhrasebookEntry(entryId)`.
  - Ensure `CollectionDetailView` and `CollectionEntryViewer` omit meaning text and meaning audio controls when `entry.meaningText` is empty.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx scripts/verify-web-phrasebook-parity.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add client/src/components/learning/phrasebookHelpers.js client/src/components/learning/PhraseEditorModal.jsx client/src/components/learning/CollectionScreen.jsx client/src/components/learning/LearningScreen.jsx client/src/StringPhoneApp.jsx scripts/verify-web-phrasebook-parity.mjs
git commit -m "feat(client): add zero-login local Phrasebook, Manual fields, and Edit card modal"
```

---

### Task 7: Full Verification, Production Build & Browser Smoke Check

**Files:**
- Check: `package.json`, `client/`, `scripts/`
- Verify: `npm.cmd run build` and all `scripts/verify-*.mjs` tests

- [ ] **Step 1: Run all verification scripts and website production build**

```powershell
node --import tsx scripts/verify-shared-mobile-logic.mjs
node --import tsx scripts/verify-mobile-mic-listening-state.mjs
node --import tsx scripts/verify-web-local-store.mjs
node --import tsx scripts/verify-collection-update-validation.mjs
node --import tsx scripts/verify-web-shell-parity.mjs
node --import tsx scripts/verify-web-chat-parity.mjs
node --import tsx scripts/verify-web-phrasebook-parity.mjs
npm.cmd run build
git diff --check
```

Expected: All verification scripts report PASS, `npm.cmd run build` (`vite build`) exits 0 with zero module errors, and `git diff --check` reports no whitespace errors.

- [ ] **Step 2: Run browser smoke verification against local dev server**

Start `npm.cmd run dev` (or `vite preview` + backend) and inspect in a real browser (`browser` subagent / Playwright) on a mobile viewport (`390x844`):
1. Confirm **zero login gates**: top-right Settings gear opens `AI TTS voice` (`Female` / `Male`) + tucked `Sign in`; Chat, Single, Conversation, History, and Phrasebook all open immediately without signing in.
2. Send a typed Chat message (or verify empty/UI controls + History search + Phrasebook `Manual fields` card add -> edit -> flashcard flip -> delete) and confirm data persists across a full browser reload via IndexedDB.
3. Verify `Single` mode shows the `Invert languages` button between `My language` and `Their language`, swaps languages on click, and `Conversation` mode rotates the center StringPhone badge `360°` and swaps languages on click (in both portrait and landscape).
4. Verify zero uncaught console errors.

- [ ] **Step 3: Report ready state for user-approved Vercel production deployment**

Present verification outputs, diff summary, and ask explicit user confirmation before pushing to GitHub / promoting or deploying to Vercel production (`https://stringphone-orcin.vercel.app`) — keeping `mobile/` untouched or explicitly handling the pre-existing uncommitted `mobile/src/live/` changes as instructed by the user.

---

## Self-Review Check (Completed)

1. **Spec coverage:** Every requirement in `docs/superpowers/specs/2026-11-16-web-apk-parity-design.md` maps directly to a task:
   - Top-right settings gear + `Return home` preservation + shared room `Leave` -> Task 3
   - IndexedDB `stringphone-local-v1` + `localStorage` preferences + ref-safe delete + per-voice TTS cache -> Task 1 & Task 5
   - Signed-in `PATCH /collections/entries` -> Task 2
   - Live token prefetch/40s refresh/prewarm + playback stop coordination -> Task 4
   - Chat RTL/retry/save + Single invert & shared carousel + Conversation spinning logo & shared carousel + History search/mode tags/delete -> Task 5
   - Phrasebook zero-login, `Manual fields`, `Edit card`, empty-meaning fallback, offline audio -> Task 6
   - Production build & browser smoke verification -> Task 7
2. **Type & signature consistency:** `createLocalStore`, `createIndexedDbDriver`, `createMemoryStorageDriver`, `prefetchBothTranscriptionSecrets`, `SECRET_REFRESH_INTERVAL_MS`, `updateCollectionEntry`, `PhraseEditorModal`, `getCarouselMessages`, and `validatePhrasebookEditorInput` share consistent parameter and return shapes across tasks.
3. **Review Focus coverage:** All 5 Review Focus conditions are explicitly pinned to unit/integration tests in Tasks 1, 4, 5, and 6.
