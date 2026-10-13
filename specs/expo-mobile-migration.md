# StringPhone Expo mobile migration

## Desired user behavior

People install StringPhone on iPhone or Android and use a native interface to communicate across two selected languages. An Expo app lives in `mobile/` alongside the existing website. Conversation records live on the phone in SQLite; recordings and generated speech live in durable app files, with references stored in SQLite. The phone controls its microphone and speakers. A server handles cloud AI requests and protects permanent API keys.

This is a phased implementation document. Completed checklist items identify implemented work; unchecked items remain planned. Tracking issue: [GitHub #16](https://github.com/merlinvaldez/stringphone/issues/16). Source discussion: [shared architecture conversation](https://chatgpt.com/share/6aca805a-d240-83ea-b0ab-fb49ea09a47d). Baseline inspected: `main` at `15e19c4`, October 10, 2026. Working branch: `feat/expo-mobile-sqlite`.

### Core flows

- Choose My language and Their language, swap their direction, and send typed messages. Show original text, translation, and existing pronunciation guidance. Keep each message's language direction even after the conversation pair changes.
- Open Chat, Single, Conversation, and Phrasebook using native controls. Preserve Single's Speak/Listen direction and Conversation's speaker ownership, portrait/landscape layout, and 30-second recording limit.
- Record a voice turn, stop it, send it for transcription/translation, and replay saved source or translated audio. Speech playback is requested by the user, with the existing marin/onyx choice; it does not start automatically.
- Reopen conversation history and phrasebook entries after closing the app. Browse, search, archive, restore archived items, and play already-saved audio without internet. Phone history is independent of website history; cross-device sync is outside the first release.
- Show an explanatory empty history/phrasebook state. Show recording, processing, ready, and failed states. Permission denial leaves text chat usable and offers instructions for enabling microphone access.
- When offline, preserve drafts and recordings and show that cloud translation is unavailable. Retry explicitly after reconnection without creating another message. Missing audio should leave readable text with an unavailable-audio indication. Storage errors must not claim that a message was saved.
- Stop microphone capture when the app becomes inactive or a phone interruption occurs; retain any usable captured recording and explain whether the turn can be retried. Background recording is outside the first release.
- Later implementation phases cover live partial transcripts/translations and invite-based shared rooms. Both are required for the first release and have separate acceptance milestones from recorded voice turns.

### Confirmed product decisions

Confirmed by the user through one-question-at-a-time UI choices on October 10, 2026:

1. **First release:** all core features are required: Chat, Single, Conversation, Phrasebook, recorded voice, live streaming transcript/translation, and shared rooms. Implementation can proceed in phases, but live streaming and rooms must pass acceptance before the first release.
2. **Accounts and sync:** no mobile account is required. Conversation history and Phrasebook stay on each phone in SQLite, with no cross-device sync. Existing website account/history behavior remains supported.
3. **Shared-room history:** each phone automatically saves both participants' messages and available audio exchanged while it is connected. This does not promise recovery of messages missed while disconnected or delivery of all room history to a late joiner.
4. **Backup and transfer:** manual export/import is deferred to a later release. No first-release migration of existing website history is planned.
5. **Live playback:** show live transcript and translation updates; translated audio plays only when the listener taps Play. There is no automatic translated speech playback.
6. **App inactivity:** stop recording when the phone locks or the user switches apps; preserve usable captured audio. Returning starts a new turn rather than silently resuming capture. Phone interruptions also stop capture.

These decisions complete the first checklist item in step 1. On-device AI, account/sync features, export/import, hidden lessons, and voice cloning remain outside the first-release scope.

Local storage is not offline AI or a backup guarantee. Explain that uninstalling/clearing app data can remove history. Device/OS backup behavior and encryption requirements must be reviewed before release; do not promise encrypted SQLite or zero provider retention by default. Necessary audio/text still travels to the backend and AI provider for processing.

## Implementation steps

### 1. Confirm scope and define the mobile contract

Outcome: a clear list of required mobile behavior and server requests before rewriting screens.

- [x] Resolve the release and account/sync choices above and update this spec and its issue.
- [x] Map current behavior from `client/src/StringPhoneApp.jsx`, Chat components, `useLiveTurnFlow.js`, and the feature docs into native screen acceptance criteria. See [native screen acceptance criteria](expo-mobile-screen-acceptance.md), reviewed against the current checkout on October 13, 2026.
- [x] Document text, multipart audio, speech response, and error contracts for both Express and Vercel handlers. Audit body limits, recording size/duration, audio formats, and provider compatibility on both phones. See [API contract audit](expo-mobile-api-contract.md), reviewed October 13, 2026; local validation passed on both handler paths. Actual phone/provider compatibility remains explicitly unverified until the Step 6 and Step 8 device checks.
- [x] Distinguish phone conversation IDs from server-owned conversation IDs. Local IDs must not be submitted as cloud ownership/persistence IDs. See [mobile identity contract](expo-mobile-identity-contract.md), defined October 13, 2026; native request allowlists, retry mapping and storage constraints remain implementation acceptance checks.
- [x] Preserve the web app and its PostgreSQL/Clerk routes while adding mobile processing behavior. Removing web storage is a separate decision. See [web compatibility requirements](expo-mobile-web-compatibility.md), defined October 13, 2026; current web build and processing validation pass. Future runtime changes must satisfy the documented web regression gates.

### 2. Add the Expo application and development setup

Outcome: one mobile codebase starts on iPhone and Android.

- [x] Scaffold a TypeScript Expo app under `mobile/`, with native navigation, safe areas, keyboard handling, and accessibility labels. Implemented October 13, 2026 with SDK 57; see [mobile setup and recorded versions](../mobile/README.md). Native device acceptance remains unverified.
- [x] Add native audio, SQLite, and file-system dependencies using the SDK's supported installation workflow. Installed SDK 57-compatible packages and `expo-dev-client` October 13, 2026; see [native dependencies and development-client workflow](../mobile/README.md#native-dependencies-and-development-client). Native compilation and device module checks remain unverified; final streaming requires a development build.
- [x] Keep mobile scripts/install steps separate from the existing root postinstall and web build. Documented October 13, 2026 in [mobile/backend Windows setup](../mobile/README.md#separate-mobile-and-backend-development-on-windows), including LAN API addressing and phone health checks. Physical-device reachability remains a manual check.
- [x] Configure development/preview/production API URLs. Implemented explicit public environment selection, validated API base resolution, and configuration checks October 13, 2026; existing Vercel preview serves development/preview and the production project domain serves production. See [API environment setup](../mobile/README.md#api-environments). Vercel SSO protection/native access remains unresolved before translation integration. Permanent credentials remain server-side; mobile requests and device transport checks are later milestones.
- [x] Configure app identity, icons, microphone permission descriptions, and reproducible development builds. Configured October 13, 2026: `ai.stringphone.mobile`, branded icon, microphone plugin settings, pinned EAS development/simulator profiles and reviewed account/signing prerequisites. See [development-build guide](../mobile/docs/development-builds.md). Config/type/lint/Doctor checks pass; account linking, signed native compilation and device installation remain unverified.

### 3. Separate reusable logic from browser-specific code

Outcome: web and mobile share behavior without importing browser or server-only APIs into native screens.

- [ ] Extract platform-independent language metadata, validation, message types, and formatting into a shared module where practical. Compare `client/src/utils.js` and `src/lib/languages.ts` before consolidating.
- [ ] Use separate adapters for native storage, audio, navigation, and API requests. Browser localStorage, DOM components, CSS, Blob recording code, and WebRTC hooks cannot be copied wholesale.
- [ ] Keep `src/lib/runTextChatMessage.ts`, `runVoiceChatMessage.ts`, `runOutputTextToSpeech.ts`, and AI services server-side. Never bundle Node database/provider code into the phone app.

### 4. Build SQLite history and durable audio storage

Outcome: local records survive restart without relying on an account or network under the confirmed local-history scope.

- [ ] Create versioned database migrations for conversations, messages, phrasebook entries, and preferences. Use stable IDs, timestamps, speaker identity, origin mode, per-message language direction, original/translated text, pronunciation, status/error state, and archive markers.
- [ ] Store source/translated audio references and metadata (format, duration, availability) in SQLite, with files in the persistent app document directory. Recordings must not remain only in purgeable cache.
- [ ] Use parameterized SQL, foreign keys, indexes for history/search, and transactions for related record updates. Track pending requests with stable IDs so retries and restarts do not duplicate messages.
- [ ] Save new drafts/recordings before remote processing; update the same row when results arrive. Recover interrupted requests without assuming the server operation can be resumed automatically.
- [ ] Coordinate file writes and database changes so failed writes do not leave apparently playable records. Handle missing files, insufficient disk space, orphan cleanup, and database migration failures without silent history loss.
- [ ] Separate archive from permanent deletion. Define removal of dependent audio and phrasebook references before exposing deletion controls.
- [ ] Keep account-based sync outside the first release. Any future sync work needs a separate design for identity, offline conflicts, deletions, audio uploads, and web compatibility.

### 5. Connect text chat and simplify mobile backend processing

Outcome: typed mobile messages translate and are persisted locally.

- [ ] Adapt the request behavior in `client/src/chatApi.js` for an absolute mobile API URL. Reuse `POST /chat/messages/text` and its language/pronunciation response.
- [ ] Implement optimistic local pending messages, disabled repeated send actions, clear network errors, and explicit retry on the same record.
- [ ] Keep mobile history writes in SQLite rather than calling authenticated web conversation/collection APIs under the confirmed local-history scope.
- [ ] Audit all selected mobile endpoints for unintended history writes and sensitive request logging. Keep request-lifetime processing separate from permanent application history, including live finalization.
- [ ] Add appropriate input limits and abuse/cost controls to guest-accessible AI endpoints. Choose a mobile-compatible approach rather than treating browser CORS as authentication.
- [ ] Add native language selection, swapping, chat list, conversation history, and archive/restore flows. Preserve RTL text rendering and screen-reader usability.

### 6. Add recorded voice and playback

Outcome: a complete record-to-translation flow works on real devices.

- [ ] Use `expo-audio` for permission-aware recording, playback, audio session lifecycle, and the 30-second cap. Persist source files before upload.
- [ ] Adapt `POST /chat/messages/voice` multipart uploads with the actual native URI, MIME type, and filename. Current handlers return source/translated audio as base64 JSON; decode to durable files instead of storing large base64 strings in SQLite.
- [ ] Implement recording, uploading, processing, ready, and retryable failure states; handle interruptions, empty recordings, unsupported formats, and oversized payloads.
- [ ] Support source audio playback and user-requested translated speech. Reuse `POST /speech/output`; preserve its current validation, including its 500-character input limit, and explicitly design longer-message handling before claiming full playback support.
- [ ] Prevent simultaneous recording/playback feedback and overlapping players. Test headphones, Bluetooth, silent mode, and speaker routing on both platforms.
- [ ] Port Single and Conversation speaker locking, direction, landscape layout, and message placement to native screens.

### 7. Add a local Phrasebook

Outcome: users can keep learning material without cloud collection ownership under the confirmed local-history scope.

- [ ] Save phrases from translated messages or manual entry to SQLite with language, text, translation, pronunciation, and optional available audio references.
- [ ] Implement language grouping, search, edit, archive/restore, and playback. Local browsing and saved playback work offline; generating new speech requires internet.
- [ ] Preserve local entries when their originating conversation is archived or deleted according to an explicitly defined ownership rule.
- [ ] Keep currently hidden lesson-generation features outside the mobile UI unless separately requested.

### 8. Prove and implement native live streaming

Outcome: partial transcript and translation updates work in native development builds, then finalize into local history once.

- [ ] First run a small real-device spike for native WebRTC/audio capture and the short-lived token route. Verify compatibility with the chosen Expo/React Native versions before committing to a library.
- [ ] Adapt the behavior in `useLiveConversationCapture.js`, `useLiveTurnFlow.js`, `runLiveConversationTranslation.ts`, and `runLiveConversationTranscript.ts`. Browser getUserMedia, RTCPeerConnection, and audio recording require native equivalents.
- [ ] Preserve selected-pair constraints, 30-second limit, silence-based commits, pronunciation, captured source audio, and user-requested playback. Keep partial drafts separate from final durable records.
- [ ] Use utterance IDs/revisions to reject stale translations and deduplicate finalization; stop/release capture and connections on navigation, interruptions, and app inactivity.
- [ ] Verify native source-audio recording alongside streaming. File recording alone is not evidence that live streaming works.
- [ ] Document the supported fallback when the streaming spike fails. Recorded-turn voice remains usable; do not label it live streaming.

### 9. Add shared rooms and app invite links

Outcome: two participants can join and communicate while each phone stores its own local history.

- [ ] Adapt `client/src/sharedRoomApi.js` and `src/lib/realtimeRooms.ts` room contracts and reconnect behavior for mobile transport. Verify the deployed server model supports the required room lifetime and event transport.
- [ ] Support host/guest roles, language-pair locking, ordering, duplicate suppression, participant tokens, and expired/invalid invite states. Store sensitive session tokens in secure device storage rather than ordinary message rows.
- [ ] Add app links/deep links and a web fallback. Validate incoming room IDs/tokens and provide deliberate join/leave controls.
- [ ] Automatically persist both participants' messages and available audio received while connected on each phone, using stable room/message IDs to avoid duplicates.
- [ ] Keep only the server state needed for active communication, with explicit expiry/cleanup. Define retention of temporary room messages/audio and communicate it accurately; SQLite does not remove server relay requirements.
- [ ] Test web-to-mobile and iPhone-to-Android participation, reconnects, room expiry, and separation of local records from account-based web history.

### 10. Prepare device releases and maintenance

Outcome: verified native builds can be distributed and maintained on both platforms.

- [ ] Configure EAS development, preview/internal, and production builds, signing, app identifiers, and compatible update/runtime policies. Windows can use cloud iOS builds; local Xcode testing requires macOS.
- [ ] Run device acceptance tests and backend/web regressions before releasing. Use real microphone and playback tests on iPhone and Android, not only a web preview or simulator.
- [ ] Prepare store metadata, screenshots, privacy disclosures covering AI processing and local storage, support contacts, and permission descriptions.
- [ ] Document environment setup, schema upgrades, release/rollback procedures, and the limits of local backup/uninstall recovery. Accounts, payments, credentials, and store submission remain explicit release actions.
- [ ] Treat steps 8 and 9 as first-release blockers: live streaming and shared rooms must pass their acceptance checks before release. Defer export/import and cross-device sync.

### Source references

Implementation should recheck current official guidance when selecting versions:

- [Expo SQLite](https://docs.expo.dev/versions/latest/sdk/sqlite/) — persistent local database and parameterized queries.
- [Expo Audio](https://docs.expo.dev/versions/latest/sdk/audio/) — native recording/playback; default cache recordings need durable storage.
- [Expo FileSystem](https://docs.expo.dev/versions/latest/sdk/filesystem/) — manage local audio files.
- [Expo development builds](https://docs.expo.dev/develop/development-builds/introduction/) — custom native dependencies and device builds.
- [EAS Build](https://docs.expo.dev/build/introduction/) — build distribution workflow.

## How to check it works

- [ ] Install on a real iPhone and Android device; select languages, swap direction, send text, and verify original/translation/pronunciation and speaker placement.
- [ ] Kill/reopen the app and confirm history, message order, preferences, archive state, and local Phrasebook survive. Exercise a schema upgrade against existing records.
- [ ] In airplane mode, browse history and play saved audio; new AI requests show a clear offline state without losing input. Reconnect and retry without duplicates.
- [ ] Deny microphone permission, then enable it; text remains usable. Test 30-second stops, app backgrounding, phone/audio interruptions, permission revocation, and headset routing.
- [ ] Record in both language directions on both platforms. Verify the server accepts actual native formats and source/translated audio remains playable after restart.
- [ ] Simulate network failures, slow responses, missing audio, disk-full writes, and app termination mid-request; show accurate errors and preserve recoverable input.
- [ ] Save/search/archive/restore manual and message-derived phrases without an account under the local-history scope. Check RTL languages and accessibility.
- [ ] Verify no permanent AI keys are bundled and mobile processing does not create permanent server conversation records under the confirmed local-history scope. Verify current web account/history and room flows still work.
- [ ] For live streaming: see partial updates while speaking, finalize exactly once after silence/stop, preserve source audio, and reject stale updates on both real devices.
- [ ] For rooms: join from iPhone/Android/web, exchange text/voice, reconnect without duplicates, and handle expired links. Reopen each phone's local history after leaving/restarting and verify both participants' received messages and available audio were automatically saved. Confirm temporary relay expiry and local record isolation.
- [ ] Build signed release candidates for both platforms and check the all-core-features release gate against all required phases. Record device/OS versions and any unverified behavior before store submission.
