# Web App Parity with Android APK Design

**Date:** 2026-11-16
**Target:** Vercel production web app (`client/` deployed to `https://stringphone-orcin.vercel.app`)
**Source of Truth:** Android APK (`mobile/src/`)

## Intent & Why

Because sharing native iPhone builds remotely requires a paid \$99/year Apple Developer Program membership and Expo EAS cloud builds are unlinked/stale, friends on both iPhones and Android phones will try StringPhone through the Vercel production web app (`https://stringphone-orcin.vercel.app`).

Today, Vercel production is 55 days behind (`main` at `15e19c4`, September 22, 2026), and `client/src/` diverges from the Android APK (`mobile/src/`) in several ways—most importantly by locking History, Phrasebook, and the AI TTS voice toggle behind Clerk sign-in, and by missing newer APK controls added in November (Single invert button, Conversation spinning logo swap, Save to Phrasebook on voice cards, History search, Phrasebook editing, and live-mic token prefetching).

The goal is to make the Vercel production web app match the Android APK user experience end-to-end—treating the Android APK (`mobile/src/`) as the source of truth—using **Approach 1**: browser-local persistence (IndexedDB + `localStorage`) for signed-out guests while keeping optional Clerk/Postgres support intact under the hood.

## Goals, Non-Goals & Anti-Goals

### Goals
1. **Zero-login guest parity:** Every core screen and feature (`Chat`, `Single`, `Conversation`, `History`, `Phrasebook`, and `AI TTS voice` selection) works immediately when a visitor opens the web app without signing in.
2. **Browser-local persistence (IndexedDB + `localStorage`):** Store guest conversations, messages, source voice recordings, cached/generated TTS audio blobs, and Phrasebook cards in browser IndexedDB (`stringphone-local-v1`), and language/voice/active-conversation preferences in `localStorage`.
3. **Full UI & interaction parity with `mobile/src/`:**
   - **Header / Shell (`AppShell.tsx` parity):** Top-left clickable home badge (`Return home`), centered 4-tab mode switcher (`Chat`, `Single`, `Conversation`, `Phrasebook`), and a top-right Settings gear button opening a popover with `AI TTS voice` (`Female` / `Male`) accessible to everyone—plus a subtle optional `Sign in` / `Sign out` control tucked at the bottom of that popover.
   - **Chat (`ChatView.tsx` & `MessageCard.tsx` parity):** Searchable language selectors + `Invert languages` button + History button; emerald/sky language-matched message cards, original-text TTS & source-voice playback, translated TTS, bookmark icon (`Save to Phrasebook` / saved checkmark), `"Translating"` / `"Needs retry"` badges without clutter, retry bar on failed/interrupted messages, and composer `AudioWave` countdown banner (`Connecting microphone...`, `Listening · Xs left`, `Translating voice note...`).
   - **Single (`SingleView.tsx` parity):** Add the centered `Invert languages` button between `My language` and `Their language` below the `SPEAK` / `LISTEN` buttons; add `Save to Phrasebook` bookmark button on `TranscriptCard`; display `CONNECTING...`, `LISTENING · Xs`, `TRANSLATING` status indicators and empty-state brand badge matching the APK.
   - **Conversation (`ConversationView.tsx` parity):** Make the center `StringPhone` divider badge clickable to invert languages with a 360-degree spin animation (`450ms` cubic-out, preserving `-90deg` orientation in landscape); add `Save to Phrasebook` bookmark button on `TranscriptCard`; match timer pills and portrait (180°-rotated top section) / landscape split layout.
   - **History drawer (`HistorySheet.tsx` parity):** Remove the signed-out login wall; add live search (`Search titles or messages` for Chat, `Search phrasebook` for Phrasebook); preserve Chat and Phrasebook icon tabs; show flag pair pill (`my -> their`), display title, creation date, and `· Single` / `· Conversation` mode tags; support `New Conversation` in Chat, Single, or Conversation mode and permanent deletion (with confirmation) for local IndexedDB conversations that preserves independently saved Phrasebook text/audio.
   - **Phrasebook (`mobile/src/app/phrasebook.tsx` parity):** Remove the `SignInCallout` wall when signed out; open directly to language collections and detail cards backed by IndexedDB; add **Edit card** (`PhraseEditorModal` parity: source/target languages, phrase, phrase pronunciation, translation, translation pronunciation) inside card actions (`more-vertical`); add **Manual fields** option inside the `New card` composer for offline/custom entries without calling translation; keep full-screen flippable flashcard viewer with random shuffle, prev/next arrows, swipe, and front/back audio playback.
   - **Live capture & audio parity (`nativeRealtime.ts` & `useLiveTurnFlow.ts` parity):** Keep the uncommitted startup-speed improvements in `client/src/components/live/useLiveConversationCapture.js` and `useLiveTurnFlow.js`, and add focus/mount OpenAI Realtime token prefetching (in both `myLang -> theirLang` and `theirLang -> myLang` directions) with 40-second periodic refresh while the tab is visible so tapping the mic starts immediately.
4. **Production deployment readiness:** Ensure `npm run build` succeeds and deploy the updated app (after explicit user confirmation) to Vercel production (`https://stringphone-orcin.vercel.app`).

### Non-Goals
- Modifying `mobile/` (the Android APK code stays unchanged as the source of truth).
- Re-enabling EAS cloud builds or building iOS native binaries.
- Syncing or migrating guest IndexedDB data into Postgres if a user later signs in with Clerk.
- Exposing hidden `Lessons` UI (`SHOW_LESSON_BUILDING` remains `false`).
- Changing Postgres database schemas or breaking authenticated `api/` endpoints (preserving [expo-mobile-web-compatibility.md](../../../specs/expo-mobile-web-compatibility.md)).

### Anti-Goals
- Showing any `Sign in` callout/wall on History, Phrasebook, Voice Settings, or `Save to Phrasebook`.
- Storing binary audio recordings inside `localStorage` (must use IndexedDB `Blob` storage so browsers do not hit ~5 MB `localStorage` quota errors).
- Autoplaying translated TTS audio (APK only plays audio when the user taps play, matching `mobile/src/` and confirmed mobile decisions).
- Breaking existing shared room invite links (`?join=...`) when opened directly in the browser.

## Constraints

- **Browser audio formats (iOS Safari vs. Android Chrome/Desktop):** iOS Safari `MediaRecorder` often produces `audio/mp4`, whereas Chrome/Android produces `audio/webm;codecs=opus` or `audio/webm`. Both `api/chat/messages/voice.ts`, `api/chat/messages/live-transcript.ts`, `api/chat/messages/live-segment.ts`, and IndexedDB blob storage must handle both `Blob` MIME types cleanly when recording, saving, and creating object URLs for playback.
- **Unauthenticated AI endpoints already exist:** `api/chat/messages/text.ts`, `api/chat/messages/voice.ts`, `api/speech/output.ts`, `api/chat/live-transcription/token.ts`, `api/chat/messages/live-transcript.ts`, `api/chat/messages/live-translation.ts`, and `api/chat/messages/live-segment.ts` all already work without Clerk authentication (when `conversationId` is omitted). Local IndexedDB IDs must never be sent as Postgres `conversationId` parameters to server processing routes.
- **Browser audio playback rules:** Only one audio clip plays at a time (including stopping active playback before starting recording, matching `AudioPlaybackCoordinator` in `mobile/`). Object URLs created from IndexedDB blobs must be properly managed/revoked on unmount or conversation switch to prevent memory leaks.
- **Existing Clerk setup:** `client/src/main.jsx` initializes `<ClerkProvider publishableKey={clerkPublishableKey}>`. Approach 1 keeps Clerk intact so signed-in sessions continue working seamlessly without blocking guest rendering if Clerk takes a moment or if the visitor is signed out.
- **Deploy safety:** Do not commit, push, or run production Vercel deployments until implementation and verification checks pass and the user approves deployment.

## Approaches Considered

- **Approach 1 (Selected): Dual-mode `client/` — Browser IndexedDB for guests + optional Clerk/Postgres intact, with APK UI/UX parity**
  - Uses IndexedDB + `localStorage` for all signed-out visitors (100% of friends trying the link) and keeps existing Postgres API routes for signed-in users.
  - Preserves [expo-mobile-web-compatibility.md](../../../specs/expo-mobile-web-compatibility.md) and shared room links (`?join=`).
  - Trade-off: Slightly more storage abstraction (`localStore` vs `authFetch` API) inside `client/src/`, in exchange for zero breaking backend changes.
- **Approach 2 (Rejected): Strip Clerk & Postgres out of `client/` completely**
  - Simpler single storage path, but deletes existing web account features, `/login`, `/signup`, and Postgres history persistence.
- **Approach 3 (Rejected): Export `mobile/` directly via Expo Web (`expo export --platform web`)**
  - Ruled out because `mobile/src/live/nativeRealtime.web.ts` is only an error stub without browser WebRTC mic capture, and SQLite on web requires cross-origin isolation headers.

## Detailed Design

### 1. Top Bar, `Return home` & Optional Authentication (`client/src/StringPhoneApp.jsx`)
- **My Call — Top-right Settings Gear (`AppShell.tsx` parity):**
  - Replace the top-right `Sign in` pill button in `FloatingAuthControls` with a `40px` (`h-10 w-10`) circular settings gear icon button (`Settings` icon from `lucide-react`) for signed-out users (and keep the avatar or gear trigger consistent—specifically, show the `Settings` gear icon for signed-out users and either the user's avatar or gear icon when signed in).
  - Clicking the top-right trigger opens a compact popover containing:
    1. **`AI TTS voice` selector (`Female` / `Male`, mapping to `marin` / `onyx`)** — always visible and enabled for **every** user, signed in or signed out, persisted to `localStorage` (`stringphone-tts-voice-v1`).
    2. **Subtle account footer** separated by a thin hairline border: when signed out, a quiet `Sign in` button (navigating to `/login`); when signed in, the account label and `Sign out` button.
- **Confirmed Decision — Top-left `Return home` badge (`AppShell.tsx` parity):**
  - Tapping the top-left StringPhone home badge switches back to `Chat` while **preserving the active conversation and messages** (and is a no-op when already in `Chat`, matching [AppShell.tsx](../../../mobile/src/components/AppShell.tsx#L38-L40)). Starting a fresh chat happens via History → `New Conversation`.
- **Shared Rooms visibility & explicit `Leave` control:**
  - Keep the `?join=` invite URL auto-join flow and `SharedRoomControls` functional when a shared-room session is active, without cluttering the normal Chat header when no shared room is active.
  - Because `Return home` no longer resets/exits conversations, add an explicit **Leave** button inside `SharedRoomControls` for `?join=` guests (and hosts) whenever a shared room session is active so room participants can cleanly exit without relying on `Return home`.

### 2. Local Browser Persistence Layer (`client/src/localStore.js` — new module)
- **My Call — IndexedDB + `localStorage` architecture modeled on `mobile/src/storage/`:**
  - When `isSignedIn === false`, all persistence runs locally in IndexedDB database `stringphone-local-v1` (with graceful fallback error messaging if IndexedDB is unavailable in private/restricted storage):
    - `conversations` store: `{ id, title, originMode ('chat' | 'single' | 'conversation'), myLanguage, theirLanguage, createdAt, updatedAt }`
    - `messages` store (indexed by `conversationId` and `createdAt`): `{ id, conversationId, speaker ('self' | 'partner'), originMode, kind ('text' | 'voice'), status ('pending' | 'ready' | 'error'), originalText, translatedText, originalPronunciation, translatedPronunciation, transcript, sourceLanguageCode, targetLanguageCode, sourceAudioId, translatedAudioId, errorMessage, createdAt, updatedAt }`
    - `phrasebook` store (indexed by `targetLanguageCode`, `sourceMessageId`, `updatedAt`): `{ id, sourceMessageId, sourceLanguageCode, targetLanguageCode, phraseText, phrasePronunciation, meaningText, meaningPronunciation, noteText, sourceMessageKind, sourceMessageSender, sourceAudioId, meaningAudioId, createdAt, updatedAt }`
    - `audioAssets` store: `{ id, blob, mimeType, createdAt }` storing binary `Blob`s for recorded voice turns and generated TTS WAVs.
  - **Active conversation sharing across Chat / Single / Conversation (matching `mobile/src/chat/controller.ts` & `native.ts`):**
    - On startup (when signed out), load the active local conversation ID from `localStorage` (`stringphone-local-active-conversation-v1`), or fall back to the most recent local conversation, or leave empty/auto-create a `'New chat'` / `'Single session'` / `'Two-way conversation'` conversation on first use or `New Conversation`.
    - Chat, Single, and Conversation share the currently selected conversation (unless the user starts a `New Conversation` in a specific mode or switches via History), so turns recorded in Single or Conversation are also visible in Chat and History.
    - When the first text or voice turn completes in a conversation titled `'New chat'`, `'Single session'`, or `'Two-way conversation'`, update its title to the trimmed first 80 characters of the original text/transcript (matching `mobile/src/storage/history.ts#L56` and generalizing cleanly to voice turns).
  - **Generated TTS audio caching:** Cache generated `/api/speech/output` audio blobs in IndexedDB keyed by `(messageId/entryId, role, speechVoice)` or `(text, languageCode, speechVoice)` so replaying saved phrases/messages works offline too, while changing `Female` ↔ `Male` generates with the newly selected voice.
  - **Permanent deletion & reference-safe audio cleanup (matching `mobile/src/storage/deletion.ts`):**
    - Deleting a local conversation asks for confirmation (`window.confirm` or an in-app confirmation dialog—left to the builder, with clear permanent-deletion copy), removes the conversation and its messages, keeps any independently saved `phrasebook` entries intact (`sourceConversationId` cleared / text preserved), and deletes an `audioAssets` blob only if no remaining message or phrasebook entry references it.
    - Deleting a local Phrasebook card asks for confirmation, deletes the card, and cleans up unreferenced audio blobs.
  - **My Call — Signed-in behavior:** Keep existing signed-in Postgres flows (`chatApi.js`) working when `isSignedIn === true` so existing web accounts remain unbroken. Signed-in users also receive the UI parity updates (Single invert, Conversation logo spin, History search filtering client-side over loaded conversations, `TranscriptCard` bookmark, and top-right voice menu). For signed-in Phrasebook cards, `api/collections/entries.ts` currently supports `POST` and `DELETE` only; adding an optional `PATCH` update path (or limiting `Edit card` to guest IndexedDB until a Postgres update endpoint is warranted) is left to the builder without altering existing database schemas.

### 3. Screen-by-Screen UI & Behavior Parity

1. **Chat (`ChatScreen.jsx`, `ChatHeader.jsx`, `MessageBubble.jsx`, `ChatComposer.jsx`)**
   - Language header keeps `History` menu button, `My language` picker, `Invert languages` (`ArrowLeftRight`) button, and `Their language` picker.
   - `MessageBubble.jsx`:
     - Keep emerald/sky language-matched tints (`baseLanguageCode`), timestamp, bookmark button (`Save to Phrasebook` / `Saved` checkmark), `"Translating"` / `"Needs retry"` status indicators, original-text TTS button, source voice player, translated TTS button, and retry bar.
     - Ensure `canSaveToCollection` works when **signed out** (removes the `handleRequireSignIn()` redirect in `handleSaveMessageToCollection` when signed out; saves to IndexedDB instead!) and matches the APK rule (`mobile/src/chat/MessageCard.tsx#L57`: ready message with non-empty `originalText` and `translatedText`).
     - Ensure RTL languages (`ar`, `fa`, `he`) apply `dir="rtl"` / right-aligned text direction on original/translated text in `MessageBubble` and `TranscriptCard` (matching `mobile/src/chat/presentation.ts`).
   - `ChatComposer.jsx`: keep `AudioWave` countdown banner (`Connecting microphone...`, `{seconds}s left`, `Translating voice note...`) and circular Mic / Send / Stop primary action button.
   - **Startup / Retry persistence:** Failed or interrupted guest messages stay in the thread with `errorMessage` and a `RETRY` button; retrying updates the same message record in IndexedDB without duplicating it.

2. **Single Mode (`SingleModeScreen` in `StringPhoneApp.jsx`)**
   - **Invert languages button:** Add the circular `Invert languages` button (`ArrowLeftRight` / `repeat`) centered between `My language` and `Their language` selectors below the `SPEAK` and `LISTEN` buttons (matching [SingleView.tsx](file:///c:/Users/merli/Desktop/repos/stringphone/mobile/src/chat/SingleView.tsx#L292-L331)). Disabled during `starting`, `recording`, `processing`, or when `myLang.code === theirLang.code`.
   - **Confirmed Decision — Shared active conversation in carousel:** `TranscriptCarousel` renders **all ready messages from the shared active conversation** (including typed `Chat` text turns) plus active `liveDraft` turns, matching [SingleView.tsx](file:///c:/Users/merli/Desktop/repos/stringphone/mobile/src/chat/SingleView.tsx#L171-L185) instead of filtering out typed Chat turns via `voiceHistory`. Only show the source-voice play button when `message.kind === 'voice'` and source audio exists; show translated TTS and `Save to Phrasebook` for both text and voice turns ([TranscriptCarousel.tsx](file:///c:/Users/merli/Desktop/repos/stringphone/mobile/src/chat/TranscriptCarousel.tsx#L63-L77)).
   - **Save to Phrasebook on `TranscriptCard`:** Add a bookmark button in `TranscriptCard`'s controls row alongside source voice playback and translated TTS playback (matching [TranscriptCarousel.tsx](file:///c:/Users/merli/Desktop/repos/stringphone/mobile/src/chat/TranscriptCarousel.tsx#L210-L230)), showing saved/saving state.
   - **Status & audio parity:** Match APK status slots (`CONNECTING...`, `LISTENING · Xs`, `TRANSLATING`), show `AudioWave` when recording before the first partial transcript arrives, disable playback overlap, and never autoplay translated TTS.
   - **History integration:** `HistoryShortcutButton` opens the History drawer; starting `New Conversation` from Single creates a new `originMode: 'single'` conversation.

3. **Conversation Mode (`ConversationScreen` & `UserSection` in `StringPhoneApp.jsx`)**
   - **Clickable spinning StringPhone divider badge:** Turn the center `<StringPhoneBrand compact />` badge in the divider into a `<button type="button" aria-label="Invert languages">` that swaps `myLang` and `theirLang` and triggers a smooth `360°` spin animation (`450ms` cubic-out CSS transition/keyframe) when tapped (preserving `-90deg` base rotation in landscape, matching [ConversationView.tsx](file:///c:/Users/merli/Desktop/repos/stringphone/mobile/src/chat/ConversationView.tsx#L75-L89,L301-L318)). Disabled while capturing/processing or when both languages are equal.
   - **Confirmed Decision — Shared active conversation in carousel:** Like Single mode, `TranscriptCarousel` in both sections shows **all ready messages from the shared active conversation** (including typed `Chat` turns) plus active `liveDraft` turns, matching [ConversationView.tsx](file:///c:/Users/merli/Desktop/repos/stringphone/mobile/src/chat/ConversationView.tsx#L173-L188).
   - **Save to Phrasebook on `TranscriptCard`:** Include the bookmark button on `TranscriptCard` in both top and bottom sections.
   - **Status & layout parity:** Keep portrait top section rotated `180°` and landscape side-by-side layout; keep per-section timer pill (`{seconds}s`) and `LISTENING` / `CONNECTING...` / `TRANSLATING` / `PARTNER'S TURN` status labels.

4. **History Drawer (`ChatHistorySidebar.jsx`)**
   - Remove the signed-out `"Sign in to save..."` callout so guests immediately see `New Conversation` (on Chat tab) or `Open phrasebook` (on Phrasebook tab) and their saved conversations/collections.
   - **Search input:** Add a search bar below the primary emerald button (`Search titles or messages` on Chat tab; `Search phrasebook` on Phrasebook tab) that searches local conversation titles & message contents (or filters loaded Postgres conversations when signed in) and phrasebook collections.
   - **Row details & actions:** Display flag pair pill (`my -> their`), display title, creation date, and `· Single` / `· Conversation` mode suffix when `originMode` is `'single'` or `'conversation'` (matching [HistorySheet.tsx](file:///c:/Users/merli/Desktop/repos/stringphone/mobile/src/chat/HistorySheet.tsx#L353-L360)). Clicking `New Conversation` in Chat, Single, or Conversation mode creates a new conversation tagged with the current mode (`originMode`).

5. **Phrasebook (`CollectionScreen.jsx`)**
   - Remove the signed-out `SignInCallout` screen (`CollectionScreen.jsx#L1242-L1249`) so signed-out users immediately see the Phrasebook root (`PHRASEBOOK`, search bar, `+` add button, language collections list) and can browse, search, add, edit, delete, play audio, and use the flashcard viewer using IndexedDB.
   - **Confirmed Decision — `Manual fields` & `Edit card` field mapping and optionality:**
     - **Consistent front-first field order:** Both `Manual fields` (inside `CollectionComposer`) and `Edit card` put the **learning/collection language phrase first** (`phraseText` in `targetLanguageCode`, **required**) and **your-language meaning second** (`meaningText` in `sourceLanguageCode`), matching the card list and flashcard front/back (`CollectionScreen.jsx`). Optional fields: `phrasePronunciation`, `meaningPronunciation`, and `noteText`.
     - **Optional second field for guests (APK parity):** In guest local mode (IndexedDB), `meaningText` is **optional** (matching the APK's optional second text field), and `CollectionDetailView` / `CollectionEntryViewer` / `TextToSpeechButton` gracefully omit the meaning text and meaning audio button when `meaningText` is empty. When signed in (`isSignedIn === true`), keep `meaningText` required if backed by Postgres (`src/services/languageCollections.ts#L105-L108`).
     - When `Manual fields` is opened inside an existing language collection, prefill and lock `targetLanguageCode` to that collection's language (defaulting `sourceLanguageCode` to `myLang.code`); when opened from the Phrasebook root, allow choosing both languages.
   - **Manual fields toggle in `New card` composer:** Add a `Manual fields` button/mode inside `CollectionComposer` (matching [phrasebook.tsx](file:///c:/Users/merli/Desktop/repos/stringphone/mobile/src/app/phrasebook.tsx#L855-L866)) so users can either enter a single `Word or phrase` (auto-translated online) OR enter manual card fields directly without calling translation.
   - **Edit card (`PhraseEditorModal` parity):** Add an `Edit` (`edit-2` / `Pencil`) button alongside the delete (`Trash2`) button when the card's `MoreVertical` menu is opened on `CollectionDetailView`, opening a modal/drawer to edit `targetLanguageCode`, `sourceLanguageCode`, `phraseText`, `phrasePronunciation`, `meaningText`, `meaningPronunciation`, and `noteText` (matching [PhraseEditorModal.tsx](file:///c:/Users/merli/Desktop/repos/stringphone/mobile/src/phrasebook/PhraseEditorModal.tsx) capabilities with the consistent front-first field order above).
   - **Permanent deletion confirmation:** When deleting a local Phrasebook card, confirm first and permanently delete from IndexedDB (cleaning up unreferenced audio blobs).

6. **Live Voice Startup & Cross-Browser Mobile Safari / Android Chrome Polish (`useLiveConversationCapture.js`, `useLiveTurnFlow.js`)**
   - Keep the uncommitted startup optimizations in `client/src/components/live/useLiveConversationCapture.js` and `client/src/components/live/useLiveTurnFlow.js` (`clientSecretPromise` started concurrently with `getUserMedia` + SDP offer, `ICE_CANDIDATE_SETTLE_MS = 10`, `waitForEventsChannelOpen`, `hasLiveTrack` guard).
   - **Port APK token prefetching (`nativeRealtime.ts` parity):** Prefetch OpenAI Realtime transcription client secrets for both `(myLang -> theirLang)` and `(theirLang -> myLang)` on initial mount, language pair change, and every `40_000ms` while `document.visibilityState === 'visible'` (only for active visible modes `chat`, `single`, `conversation`), consuming the cached secret if unexpired (`< 50_000ms` old) and warming the next one after consumption.
   - **Audio playback coordination:** Ensure starting any recording pauses active audio playback (`pauseActiveAudio`), and starting any playback in Chat, Single, Conversation, or Phrasebook stops any other active player (matching `AudioPlaybackCoordinator`).

## What Is Left to the Builder

- Exact component/module file organization for the browser IndexedDB wrapper (e.g., `client/src/localStore.js` and/or `client/src/phrasebookEditorModal.jsx`), IndexedDB schema versioning/upgrade helper, and unit/browser verification scripts.
- Exact CSS/Tailwind animation classes for the 450ms 360-degree Conversation logo spin (preserving `-90deg` landscape orientation) and confirmation modal vs `window.confirm` styling for permanent deletes.
- Checking `src/db/queries/languageCollections.ts` and `src/services/languageCollections.ts` to decide whether signed-in Postgres Phrasebook cards also get a `PATCH` handler in `api/collections/entries.ts` (without schema changes) or whether card editing is scoped cleanly to guest IndexedDB.
- Checking Safari iOS `MediaRecorder` / `AudioContext` edge cases (such as reusing or resuming `AudioContext` inside the user click handler and handling missing `MediaRecorder` formats gracefully) during mobile browser testing.
- Executing `npm run build` and end-to-end verification tests, and preparing a clean commit/deployment step for user confirmation before deploying to Vercel production.

