# Recorded audio foundation

Step 6 item 1 adds native Chat recording and local source playback with the installed Expo SDK 57 `expo-audio` API. [Versioned audio reference](https://docs.expo.dev/versions/v57.0.0/sdk/audio/).

Open Chat, start a conversation, then tap **Record voice**. Permission is requested on demand. Denial leaves text usable and offers **Open microphone settings**. Capture uses HIGH_QUALITY M4A/AAC on iOS/Android, a native `forDuration: 30` stop and a polling fallback. The controller locks the conversation and selected pair until recording is cancelled or saved. Stop, tab blur, app inactivity, and native completion/interruption finalize usable audio; returning never starts capture automatically.

The recorder initially writes to the document directory. After stopping, the saved-message flow copies source audio into managed durable storage and links it to a SQLite voice draft. Step 6 item 3 now uploads and translates after foreground saves; background/navigation finalization leaves a draft for explicit retry. Failed saves retain the captured URI and stable message/request IDs for **Retry saving recording**. An app termination before the managed copy/SQLite link completes is not guaranteed to recover that recording. Unlinked recorder originals currently remain in the document directory; cleanup of those originals is still needed before release.

The horizontal **Play saved recording** controls correspond to voice messages in displayed chronological order. Each tap resolves the managed file, including after app restart or without internet, and replaces the single screen player. Missing audio shows an unavailable message. Recording pauses playback; inactivity/navigation pauses playback. Expo hooks own recorder/player release. Routing, physical interruption behavior, and OS termination timing require device acceptance.

Voice multipart, response decoding and failure/retry states are implemented below. User-requested translated speech and Single/Conversation integration remain later checklist items.

## Verification

From the repository root in PowerShell:

```powershell
npm.cmd --prefix mobile run typecheck
npm.cmd --prefix mobile run lint
node --import tsx scripts/verify-mobile-chat-history.mjs
npm.cmd --prefix mobile run dev:client
```

On an installed development build on both iPhone and Android:

1. Deny microphone permission; confirm text still sends. Enable permission through Settings and retry recording.
2. Record, stop, and play the saved source. Confirm one voice message, foreground upload/translation, and locked conversation/language controls during capture/save/processing.
3. Record for 30 seconds and confirm automatic stop and one saved draft.
4. Background/lock the phone, switch tabs, disconnect headphones, and trigger a phone/audio interruption while recording. Confirm capture stops, usable audio is retained, and returning requires a new tap to record.
5. Restart, use airplane mode, reopen history, and replay recordings. Remove a managed file during development and confirm playback reports unavailable audio.
6. Exercise disk-full/save failure and **Retry saving recording**. Confirm no claim of successful save until both file and database writes succeed.

## Android smoke test, October 15, 2026

Tested on the USB-connected Pixel 10a through Expo Go. Found and fixed an actual source-save failure: SDK 57 `File.copy()` returns a promise, so the adapter must await it before checking destination size. `scripts/verify-mobile-native-files.mjs` reproduces delayed native copy completion and guards this behavior.

Observed automatic stop/save after a 30-second recording, manual stop/save, native playback entering its playing state, and successful playback of a saved recording after force-stopping/reopening Expo Go. Existing text history remained present. Playback was confirmed through native UI state; remote testing did not assess audible speech quality. This does not complete iOS, signed development-build, permission-denial, phone interruption, Bluetooth/headphone, offline, or disk-full acceptance.

## Voice multipart and durable response adapter (Step 6 item 2)

`adapters/api.ts` exposes `translateVoiceMessage`. Supply the resolved managed source URI, stored MIME type and filename plus language codes and an optional AbortSignal. Expo SDK 57's patched fetch converter rejects React Native `{ uri, type, name }` FormData parts, and its React Native Blob implementation rejects `ArrayBuffer` parts. The transport therefore uses `expo-file-system`'s native multipart file upload, with `sourceAudio` as the file field and the two language codes as text fields. Native code supplies the multipart boundary; local ownership IDs never enter the request.

The voice API validates text, language direction, MIME types and bounded nonempty base64 before decoding source/translated audio into Uint8Array values. No Buffer, browser Blob conversion, data URI or base64 SQLite column is used. `storage/voiceProcessing.ts` supplies a saved-message processor that preserves the already durable source and writes translated bytes through the existing transactional audio storage before returning text for same-row finalization. The echoed source is decoded but not duplicated on disk. Item 3 explicitly replaces the translated message link transactionally on retry, preserving any independent Phrasebook links. Unreferenced old assets are removed by storage reconciliation.

Item 3 wires this adapter to recording controls and saved-message retry. Device testing caught both the original `Unsupported FormDataPart implementation` error and the unsupported `Blob([ArrayBuffer])` workaround on the Pixel 10a. On October 19, 2026, the preview APK successfully recorded a spoken turn, uploaded the managed M4A, received its transcript and Spanish translation, and saved both playback references. Provider compatibility is confirmed for this Pixel/backend path; iPhone playback after restart remains unverified.

Run the focused checks from the repository root:

```powershell
node --import tsx scripts/verify-mobile-voice-api.mjs
node --import tsx scripts/verify-mobile-adapters.mjs
npm.cmd --prefix mobile run typecheck
npm.cmd --prefix mobile run lint
```

## Voice processing states (Step 6 item 3)

Foreground Stop/30-second completion saves the source before dispatching to the voice endpoint. Capture/preparation/saving are screen states. The saved message becomes pending while uploading/waiting for the server, then the composer announces processing/saving after the native upload returns the server response body. The native upload API does not expose server processing progress here. Ready is committed only after translated bytes and text are saved. No audio autoplays.

Offline/provider/proxy failures leave the same row retryable with its original language direction. Retry saved message also processes older voice drafts. Only one send/record/retry runs at once. Cancel voice translation and app inactivity/navigation abort active work; late results cannot finalize. A 60-second attempt timeout aborts stalled requests. Cold-start recovery marks pending work interrupted without automatic resubmission. Background capture finalization saves a draft and checks foreground state again after saving before deciding whether to upload.

The mobile upload ceiling is 3,000,000 source bytes to leave multipart room below deployment body limits; this is a conservative app policy, not a claim about every server configuration. Empty/missing files, unsupported MIME types and oversized recordings fail before fetch. Format/size failures ask for a new recording; network failures can retry the retained source. Existing file storage rejects empty copies. A failed local recording save retains the capture and stable IDs for Retry saving recording; termination before the managed save still has the recovery limits described above.

Verify on iPhone and Android with the configured backend: record a short spoken turn, stop, observe upload/processing and then Saved with transcript/translation. Use airplane mode to produce a failure, reconnect, and Retry saved message; confirm one message. Cancel a slow request or switch tabs/background, return and explicitly retry. Restart during a pending request and confirm interruption recovery. Background during capture and confirm a saved draft without an automatic upload. The October 19 Pixel 10a preview APK check confirmed a spoken turn reached Saved with transcript and translation; the user confirmed the test worked. Source and translated playback controls entered their active states. iPhone acceptance, airplane-mode failure/retry, cancel/background/restart interruption handling and physical failure recovery remain unverified. Desktop fixtures cover SQLite ownership, failure/retry, duplicate guards, late cancellation, background dispatch gating and validation. Translated-speech controls remain item 4.

## Source audio playback and user-requested translated speech (Step 6 item 4)

Native `ensureTranslatedSpeech` in `adapters/speech.ts` requests speech synthesis for translated message text via `POST /speech/output`.
- **Validation & Chunking**: When message text exceeds the endpoint's strict 500-character ceiling, it is chunked cleanly along sentence endings (`. `, `! `, `? `), clause breaks (`, `, `; `), or whitespace boundaries under 500 characters.
- **WAV Concatenation**: Chunks are synthesized sequentially and concatenated at the byte level. The adapter parses the 44-byte RIFF header, validates 24kHz 16-bit mono PCM format, extracts raw PCM audio samples, combines the payloads, and generates a valid composite RIFF/WAVE header with correct `ChunkSize` and `Subchunk2Size`.
- **Durable Persistence**: The composite WAV file is saved into managed durable audio storage via `saveTranslatedAudio` and linked to the message row in SQLite.
- **Playback Hook**: `useAudioPlayback` manages both source audio playback (`resolveNativeSourceAudio`) and on-demand translated speech (`ensureTranslatedSpeech`), displaying an active playing state and generating indicators on individual `MessageCard` components.

## Anti-feedback and audio session coordination (Step 6 item 5)

`adapters/playbackCoordinator.ts` provides `AudioPlaybackCoordinator` to ensure mutual exclusion between playback and recording:
- **Recording Lock**: Starting any voice recording calls `AudioPlaybackCoordinator.setRecording(true)` and immediately stops and cancels any active audio player, preventing microphone feedback loops.
- **Playback Lock**: While recording is active, any attempt to start audio playback via `playSource` or `playTranslated` is rejected.
- **Audio Session Routing**: `configureNativeAudioSession` configures `setAudioModeAsync` with `playsInSilentMode: true`, `interruptionMode: 'doNotMix'`, and `shouldRouteThroughEarpiece: false`, ensuring playback routes to the main loud speaker, headphones, or Bluetooth instead of the low-volume phone earpiece.

## Single and Conversation screen modes (Step 6 item 6)

Two dedicated native screens port the mobile translation experience:
- **Single Mode (`SingleView.tsx` / `app/single.tsx`)**: Designed for taking turns holding a single phone. Offers two large color-coded action buttons: red for Speak (My Language) and blue for Listen (Partner Language). Integrates 30-second recording countdowns, automatic 30s caps, status notices, language selection/swapping, and per-mode conversation persistence (`newModeConversation('single')`).
- **Conversation Mode (`ConversationView.tsx` / `app/conversation.tsx`)**: Designed for face-to-face across-the-table conversation. The partner half is rotated 180° in portrait orientation so each person faces their own language controls and translated text right-side-up. When rotated to landscape, the layout switches to a side-by-side two-column view without rotation. Active recording locks the opposite side to prevent simultaneous speaking.
- **Lifecycle & Focus Stability**: `useFocusEffect` hooks use stable refs for `chat` and `audioPlayback` with empty callback dependencies to prevent accidental cancellation during component re-renders. Audio playback and recording are safely finalized and torn down upon app backgrounding or tab navigation.

