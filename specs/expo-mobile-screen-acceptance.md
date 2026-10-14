# Expo native screen acceptance criteria

Behavior mapping completed October 13, 2026 on `feat/expo-mobile-sqlite`. This completes Step 1, item 2 of [the migration spec](expo-mobile-migration.md). These are requirements for future native implementation; unchecked criteria are not device-test results. The confirmed mobile decisions in that spec take precedence over the web implementation.

## Current behavior and native changes

| Area | Current checkout evidence | Native target |
| --- | --- | --- |
| Navigation | `client/src/StringPhoneApp.jsx`: `MODE_OPTIONS`, `HIDDEN_MODE_IDS`, `handleSelectAppMode` | Chat, Single, Conversation, Phrasebook; live remains a capture workflow within these screens. |
| Chat | `client/src/components/chat/{ChatScreen,ChatHeader,ChatComposer,ChatThread,MessageBubble}.jsx` | Preserve language selection, swap, bilingual bubbles, processing/retry, manual speech and phrase saves with native controls. |
| Single / Conversation | `StringPhoneApp.jsx`: `SingleModeScreen`, `ActionColumn`, `ConversationScreen`, `UserSection`, `TranscriptCarousel` | Preserve direction, speaker locking, turn countdown, transcript browsing and orientation behavior. |
| Live turns | `client/src/components/live/{useLiveTurnFlow,useLiveConversationCapture}.js`; root draft/finalization callbacks | Current mic controls stream; native equivalents must show partial results and finalize captured audio once. Recorded upload is a separate implementation milestone, not proof of streaming. |
| History | `ChatHistorySidebar.jsx`; root `openSavedConversation`, `startNewConversation`, `voiceHistory` | Replace account-owned web history with durable SQLite records on each phone. Archive restoration and offline history are mobile additions. |
| Phrasebook | `client/src/components/learning/{LearningScreen,CollectionScreen}.jsx`; root `buildCollectionPayloadFromMessage` | Preserve language groups, search, manual add, card browsing and save direction without sign-in. Editing, permanent deletion and durable optional audio are mobile additions. |
| Rooms | Root shared-room controls, snapshot mapping and mode locks; `client/src/sharedRoomApi.js` | Preserve participant-relative direction and Chat-only room interaction; add deliberate app-link join and automatic local saves of received messages/audio. |

Supporting feature docs: [Chat](../docs/chat-mode-feature-spec.md), [live speech](../docs/live-transcription-mode-feature-spec.md), [Phrasebook](../docs/language-collections-feature-spec.md). Their dated status sections are historical; the files above were rechecked for this mapping. Lesson-generation requirements in [the lesson spec](../docs/language-lessons-feature-spec.md) remain outside the visible mobile scope.

## Navigation, languages and native controls

- [ ] On both iPhone and Android, open each of the four visible modes using native controls. Do not expose a fifth Live tab or the hidden lesson builder/history.
- [ ] Select My language and Their language, including Persian; search by displayed language names. Swap exchanges the pair; equal languages make swap a no-op. Preserve each existing message's language snapshots when selectors change.
- [ ] Disable direction changes during capture/finalization and room updates. Changing modes stops and releases capture; late results keep their originating mode and direction.
- [ ] Respect safe areas and the keyboard: the composer, Stop, navigation and focused input remain reachable. Render Arabic/Persian text in the correct direction and keep long text readable with larger system fonts.
- [ ] VoiceOver/TalkBack announce icon actions, selected languages, active speaker, recording/processing/error state and countdown meaning. Controls remain operable in portrait and landscape.
- [ ] Restore saved language/voice preferences and last usable local screen after restart. A home action returns to Chat without deleting saved records. Starting a new conversation creates a separate history rather than overwriting the previous one.

## Chat

- [ ] Send nonblank trimmed text using Send or the keyboard action. Create one pending local record immediately, then update that record with original text, translation, pronunciation when supplied, timestamp, direction and status. Do not generate unsolicited assistant replies.
- [ ] Prevent repeated submission of the same pending action. Failure leaves readable input and an explicit Retry; retry updates the same record without duplicating the message. Switching language after sending does not change the pending request's direction.
- [ ] Keep self/partner ownership stable. Current bubbles use sender for outer alignment and source-language matching for inner styling; native rendering must remain understandable after the current pair changes.
- [ ] Completed text offers user-requested original and translated speech. Voice messages show the transcript, translation, pronunciation and source player when a recording exists. Missing audio leaves text readable with an unavailable indication.
- [ ] Saving a ready message to Phrasebook confirms success only after local storage succeeds. Pending or incomplete messages cannot be saved as complete phrases.
- [ ] With an empty composer, Mic starts a voice turn and changes to Stop with a visible countdown. Recording/processing disables incompatible composer actions. Recorded-turn and live-streaming milestones are verified separately.

## Single

- [ ] Speak captures My language -> Their language with `sender: self`; Listen captures Their language -> My language with `sender: partner`. Listen is microphone capture of the other person, not automatic playback.
- [ ] Only the selected action can stop the active turn; lock the other action and both language selectors until capture/finalization ends. Show the selected action, remaining time and processing/error state.
- [ ] Stop manually or at 30 seconds; return to an idle usable screen after completion/failure. Display partial transcript/translation during live capture and completed bilingual turns in the transcript viewer.
- [ ] Browse earlier turns and tap to play translated speech. Preserve message ownership, selected direction and `originMode: single` in local history and the shared Chat thread.

## Conversation

- [ ] In portrait, Their language/partner occupies the top area facing the other person (rotated 180 degrees); My language/self occupies the bottom. In landscape the areas become left/right, without the portrait rotation.
- [ ] Top/partner captures Their language -> My language; bottom/self captures My language -> Their language. Rotation changes layout without swapping ownership, languages or message order.
- [ ] Lock the other side during capture/finalization, expose Stop on the active side, and show its 30-second countdown. Unlock after completion or failure; neither side can start overlapping capture.
- [ ] Each side can browse bilingual turns from its language perspective. Preserve existing playback direction: top plays translated self turns and original partner turns; bottom plays original self turns and translated partner turns. Playback starts only on tap.
- [ ] Completed turns retain speaker identity and `originMode: conversation`, and remain reviewable in Chat and local History.

## Voice lifecycle and live acceptance

- [ ] Denied microphone access shows an actionable explanation; text stays usable. Empty/no-speech turns do not create completed empty messages.
- [ ] Recorded turns preserve usable source audio durably before upload. Show recording, uploading/processing, ready and retryable error states; saved source and generated speech remain playable after app restart.
- [ ] Live capture displays transcript deltas and translation revisions before Stop, in the normal message/turn surface. Silence commits utterances; multiple utterances may occur within the same 30-second session.
- [ ] Update the same utterance draft as revisions arrive; reject stale translations. Finalize each utterance once into a durable record with available source audio, even if Stop and a final event overlap. Constrain output to the selected language pair.
- [ ] Navigation, app inactivity, locking or phone interruption stops microphone capture and releases resources. Retain usable captured audio, explain interrupted work and require a new explicit turn on return.
- [ ] No captured or translated audio plays automatically. Prevent overlapping players and recording/playback feedback; preserve marin/onyx preference without requiring a mobile account.
- [ ] Connection/finalization failure preserves recoverable input for explicit retry. A recorded fallback is clearly identified and cannot satisfy the first-release live-streaming acceptance gate.

## Local History and offline states

- [ ] Without signing in, reopen completed conversations from local History with ordered text, pronunciation, per-message direction, speaker, origin and available audio after killing/reopening the app.
- [ ] Search local conversations/messages; permanently delete a conversation after confirmation, remove its messages and unreferenced audio, and retain independently saved Phrasebook text. These offline/search/deletion requirements extend the current web drawer.
- [ ] Opening history restores its pair and thread; completed voice turns remain usable in the turn viewers. Current `voiceHistory` includes ready voice turns across modes, while partial drafts are filtered by origin; preserve that distinction.
- [ ] Airplane mode permits history search/browsing and saved playback. New cloud work explains that internet is required, preserves drafts/recordings and offers explicit retry after reconnection.
- [ ] Interrupted processing, missing files and failed database/file writes show accurate recoverable states. Do not claim a save succeeded when storage failed or silently discard existing history.
- [ ] Explain that uninstalling/clearing app data may remove local history. No account, sync, web-history import or backup/export is required for these flows.

## Phrasebook

- [ ] Open language groups without sign-in, ordered by stable English language name and showing counts. Search at the root and within a language by phrase, meaning, pronunciation and notes; language-name search applies at the root.
- [ ] Save an outgoing message's translation as the practice phrase and original as its meaning. Save an incoming message's original as the phrase and translation as its meaning. Preserve pronunciation and snapshot direction rather than using later selector values.
- [ ] Repeated normalized language/phrase/meaning saves reuse the active local entry. Show saving/saved/failure states accurately.
- [ ] Add manually from root (choose language) or language detail (prefilled language). Preserve the current single-input translation flow; cloud translation requires internet, and failure preserves input. Successful save opens the new card.
- [ ] Open and close the focused card viewer; browse neighboring cards and use previous/random actions. Edit an entry, search it, permanently delete it after confirmation and verify it stays deleted after restart. Edit/delete are mobile additions, not current web controls.
- [ ] Tap to play the practice phrase or meaning. Available saved audio plays offline; generating missing audio requires internet. Optional audio references must use durable local files, not web object URLs.
- [ ] Keep saved text snapshots independent of the source conversation. Archiving that conversation does not remove its phrase entries. Permanent deletion/audio ownership rules remain a required design task in Steps 4 and 7 before deletion controls are exposed.

## Shared Chat rooms

- [ ] Create/copy an invite and deliberately join a valid incoming link. Show host/guest, joining, connected, reconnecting, failed and expired states; failures do not strand the composer.
- [ ] Derive My/Their languages relative to the participant. Host can edit the pair before guest joins; guest and both participants after joining cannot edit/swap it. Lock room interaction to Chat with an explanatory mode notice.
- [ ] Order and deduplicate incoming/outgoing text and voice turns, retries and reconnect updates by stable room/message identity. Automatically save both participants' received messages and available audio locally while connected.
- [ ] Leave the room and reopen its saved local history after restart. Do not promise missed-message recovery, complete history for late joiners, or web-account persistence; these differ from the current ephemeral web-room flow.
- [ ] Verify iPhone-to-Android and web-to-mobile communication, invite failures, reconnects and manual playback. Streaming and rooms both remain first-release gates.

## Verification boundary and remaining contract work

Run every unchecked criterion on real iPhone and Android development builds, recording device/OS, build, scenario and pass/fail evidence. This document records source inspection only; no native app or device acceptance has been completed.

Step 1's remaining items still need the Express/Vercel request, response, error and upload-limit audit; native format/provider checks; local/server ID separation; and preservation of web account/storage routes. Later steps must settle permanent deletion/audio ownership and longer-message speech behavior before claiming complete support. This screen mapping does not choose SDK versions or certify backend/device compatibility.
