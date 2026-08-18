# StringPhone Live Transcription Mode

**Status:** Proposed on `feat/12-live-transcription-mode` for issue [#12](https://github.com/merlinvaldez/stringphone/issues/12) on 2026-08-18.  
**Product:** StringPhone  
**Audience:** people using StringPhone in an in-person conversation who want a passive bilingual transcript and sound-button playback without changing the existing chat experience.

## Outcome

StringPhone adds Live listening inside the existing Chat mode for passive conversation capture.

When Live listening is started from Chat, the app listens continuously to the spoken conversation, splits speech into short utterance segments, transcribes each segment, identifies which of the selected two languages was spoken, translates the segment into the other selected language, and appends it to the existing bilingual thread pattern.

Live conversation segments use the same playback pattern as typed Chat messages: the compact sound button appears only on the second-language side of the message.

The feature must feel like the current StringPhone chat surface gaining a passive listening state. It must not introduce a separate top-level mode, transcript dashboard, large new panels, or a new visual language.

## Product Intent

- Let people put the phone down during an in-person bilingual conversation and get a running transcript in both selected languages.
- Reduce interaction cost compared with the current turn-based voice modes.
- Keep the app's two-language model: `my language` and `their language`.
- Reuse the current chat thread, message bubble, language selector, history, and playback components wherever possible.
- Make every captured utterance playable through the existing second-language sound button.
- Preserve current typed chat, single voice, conversation voice, learning, shared chat, AI partner, saved history, and phrasebook behavior.

## V1 Principles

### Passive After Start

Live mode should require one intentional user action to satisfy browser microphone permissions and user consent. After that action, it listens continuously until the user stops it, leaves the mode, or microphone capture fails.

V1 must not require the user to hold the mic button or manually stop after every turn.

### Existing Thread First

Live utterances should render through the same message-thread mental model as Chat. They should look like regular bilingual conversation rows, not like a log viewer.

### No Unnecessary UI

The only new visible surface should be what is required to enter and control Live mode inside Chat. Everything else should reuse existing patterns:

- `ChatComposer` control row;
- `ChatHeader` language controls;
- `ChatThread` scrolling behavior;
- `MessageBubble` bilingual text hierarchy;
- compact circular playback controls;
- existing amber, emerald, rose, zinc, and white state colors;
- History sidebar access.

### Existing Sound Button Only

Each live segment must be playable from the existing compact sound button, like a normal typed Chat message. The full message bubble should not become a separate playback target.

### Chunked Live, Not Perfect Streaming

The current repo has per-recording transcription and translation services. V1 can implement live behavior as near-live chunked capture: short audio chunks are segmented by silence or a small interval, processed in order, and rendered as pending rows that resolve into final bilingual text.

True token-level streaming transcription is a non-goal unless the selected provider API supports it cleanly without replacing the existing provider path.

## Non-Goals For V1

- No new AI partner behavior.
- No chatbot replies.
- No new landing page or onboarding screen.
- No speaker diarization beyond language-side inference.
- No arbitrary-language detection outside the selected two-language pair.
- No multi-person contact list or call room.
- No separate transcript editor.
- No mandatory transcript export.
- No pronunciation scoring.
- No autoplay of every captured segment.
- No background microphone capture before user consent.
- No deletion of the dormant Single or Conversation implementations; they are hidden from the switcher in V1 and can be brought back later.
- No separate top-level Live tab in V1.

## Current Repo Constraints

The implementation should fit the current StringPhone code paths.

- Top-level mode selection is in `client/src/StringPhoneApp.jsx` through `MODE_OPTIONS`, `VISIBLE_MODE_OPTIONS`, and `appMode` rendering. V1 should not add Live, Single, or Conversation to this switcher; Live belongs inside Chat.
- Chat UI composition lives in `client/src/components/chat/ChatScreen.jsx`.
- Thread rendering lives in `client/src/components/chat/ChatThread.jsx` and `MessageBubble.jsx`.
- Text playback already uses `client/src/components/audio/TextToSpeechButton.jsx` plus `POST /api/speech/output`.
- Voice bubble playback already uses `VoiceMessagePlayer.jsx`.
- Turn-based voice chat uses `translateVoiceMessage()` in `client/src/chatApi.js` and `POST /api/chat/messages/voice`.
- Backend voice translation uses `src/lib/runVoiceChatMessage.ts`, `src/lib/runSpeechTranslation.ts`, `src/services/transcribeAudio.ts`, `src/services/translateText.ts`, and `src/services/generateSpeech.ts`.
- Saved conversation persistence uses `public.conversations` and `public.messages` through `src/db/queries/conversations.ts`.
- AI partner state and `/aipartner` command handling already exist and must remain separate from Live mode.
- Shared-room chat currently locks the voice-focused live modes. Live mode should follow that lock behavior unless shared-room compatibility is intentionally designed later.
- `MAX_RECORDING_TIME` currently applies to turn-based recording. Live mode needs chunk-level limits instead of a 30-second whole-session limit.

## User Experience

### Entry Point

Add Live listening to the existing Chat composer as a compact icon control.

Recommended icon: use a Lucide icon that communicates live capture, such as `Radio`, placed beside the existing send/mic composer controls.

### First Open

When the user opens Chat:

- show the same language selector header used by Chat;
- show the existing History access control;
- show the same empty thread treatment or a lightly adapted empty state;
- show the normal Chat composer with an additional compact Live listening control.

Browser microphone capture usually requires a user gesture, so Live listening should not silently start on page render. The visible start control should use the current mic/recording pattern and then transition into the continuous listening state.

### Active Listening

After the user starts Live listening:

- the bottom control shows listening state using the existing rose/recording and waveform treatment;
- the app keeps listening until stopped;
- the existing text input is disabled while Live listening is active;
- language selectors are disabled while processing active audio;
- each captured candidate segment increments the compact Live processing indicator;
- the thread receives a message only after a segment returns transcript plus translation;
- long silence should not create empty messages;
- short non-speech sounds and provider no-speech responses should be ignored quietly with no visible error row.

### Live Segment Rendering

A resolved live segment should reuse `MessageBubble` where possible.

Recommended segment shape:

- `kind: "text"` so live rows use the same second-language generated-speech button as typed Chat messages;
- `sender: "self"` when the dominant detected language is `my language`;
- `sender: "partner"` when the dominant detected language is `their language`;
- `originalText` is the transcript in the detected spoken language;
- `translatedText` is the translation into the other selected language;
- `transcript` mirrors `originalText`;
- pronunciation guidance follows the existing cross-script rules;
- `messageOrigin: "human"` remains unchanged.

If language detection is ambiguous, V1 should still show the transcript and translation, but it must choose one of the two selected language sides with low confidence. The row should not introduce a third neutral bubble style or any language outside the active L1/L2 pair unless a later design explicitly adds that pattern.

### Sound Button Behavior

The user request is that playback should feel like Chat. V1 should implement this through the existing sound button, not by making the full message clickable.

Recommended behavior:

- live rows render as normal Chat text bubbles;
- self-side live rows show the sound button on the translated second-language line;
- partner-side live rows show the sound button on the original second-language line;
- clicking the bubble body does not play audio;
- source captured audio is not exposed as a separate playback target in V1;
- only one segment should play at a time;
- playback must work on desktop click, mobile tap, keyboard activation, and screen-reader accessible controls through the existing button.

Playback is manual. Live mode should not auto-play every segment as it appears in V1.

### Stopping Live

When the user stops Live listening:

- the current in-flight chunk should be finalized when possible;
- incomplete silence-only chunks should be discarded;
- pending rows should resolve, fail softly, or be removed if they contain no transcript;
- the mode remains open so the user can review and tap previous segments;
- the stop action should use the existing square stop icon and recording color treatment.

### Mode Switching

When leaving Chat or switching modes while Live listening:

- stop microphone capture cleanly;
- finalize or cancel the in-flight segment;
- keep resolved messages in the current conversation thread;
- do not leave background recording running;
- do not clear the active Chat thread unless the user explicitly starts a new conversation or returns home.

## Language And Segmentation Rules

### Selected Pair Only

Live mode is scoped to the currently selected `my language` and `their language` pair.

Each captured utterance should be treated as one of:

- spoken mostly in `my language`;
- spoken mostly in `their language`;
- ambiguous, with a fallback and a compact error/notice only if translation quality is blocked.

V1 should not claim support for detecting every possible spoken language in the room.

### Utterance Segmentation

Recommended V1 segmentation:

1. Use Web Audio or MediaRecorder-based amplitude analysis to detect speech start and speech end.
2. Finalize a segment after a short silence window, for example 700 to 1200 ms.
3. Force-finalize a segment at a maximum chunk length, for example 8 to 12 seconds, to keep latency bounded.
4. Drop chunks below a minimum audio duration or energy threshold.
5. Queue segments for processing in chronological order.

The exact thresholds should be tuned with browser testing rather than hard-coded from this spec without verification.

### Overlapping Speech

If both people speak at the same time, V1 should prefer a clear transcript over false diarization.

Acceptable V1 behavior:

- transcribe the dominant speech;
- mark the segment ambiguous if confidence is low;
- avoid inventing two separate speakers from one mixed chunk.

## Client Architecture

### Chat-Integrated Capture

Recommended file:

- `client/src/components/live/useLiveConversationCapture.js`

This hook should let `ChatScreen` own Live listening without creating a new top-level app mode.

Recommended composition:

- reuse `ChatHeader` for language controls and History access;
- reuse `ChatThread` for rendering the live transcript;
- reuse `MessageBubble` for individual bilingual rows;
- adapt `ChatComposer` with one compact Live listening button;
- use the existing `AudioWave`, stop icon, mic icon, processing spinner, and color semantics.

### App State

Add live capture state at the `StringPhoneApp.jsx` level because it affects mode switching, message appending, audio cleanup, saved conversation persistence, and shared-room locks.

Recommended state shape:

```ts
type LiveCaptureState = {
  status: "idle" | "starting" | "listening" | "processing" | "stopping" | "error";
  sessionStartedAt: string | null;
  activeSegmentId: string | null;
  pendingSegmentCount: number;
  lastError: string;
};
```

Use refs for MediaRecorder, Web Audio nodes, audio object URLs, and the segment processing queue so React renders stay stable.

### Segment Message Shape

Use the existing client message shape with small additions only where needed.

Recommended live message fields:

```ts
type LiveSegmentMessage = SessionMessage & {
  originMode: "live";
  detectedSourceLanguageCode: string;
  detectedSourceLanguageConfidence?: number;
  segmentStartedAt?: string;
  segmentEndedAt?: string;
};
```

These fields can remain client-side for V1 unless persistence requires them later.

### Audio Cleanup

Live mode can create temporary audio blobs for retrying failed processing. The implementation must clean up any object URLs if future revisions add them and must avoid exposing captured source audio as a playback target in V1.

## API And Services

### `POST /api/chat/messages/live-segment`

Purpose: process one finalized live audio segment.

Recommended multipart fields:

- `sourceAudio`: required audio chunk;
- `sourceLanguage`: current `my language` code;
- `targetLanguage`: current `their language` code;
- `conversationId`: optional owned conversation id;
- `segmentStartedAt`: optional client timestamp;
- `segmentEndedAt`: optional client timestamp.

Recommended response:

```json
{
  "detectedSourceLanguage": {
    "code": "es",
    "label": "Espanol",
    "confidence": 0.86
  },
  "sourceLanguage": {
    "code": "es",
    "label": "Espanol"
  },
  "targetLanguage": {
    "code": "en",
    "label": "English"
  },
  "sender": "partner",
  "transcript": "Podemos encontrarnos en la entrada.",
  "translatedText": "We can meet at the entrance.",
  "originalPronunciation": "",
  "translatedPronunciation": "",
  "savedMessage": {
    "id": "optional saved message id"
  }
}
```

The route should not return chatbot content. It only transcribes, classifies, translates, and optionally persists a human speech segment. If no speech is detected, it should return a no-speech response that the client treats as a quiet drop, not a visible message failure.

### Express And Vercel Parity

As with existing chat routes, add both:

- Express route in `src/server.ts`;
- file-backed serverless handler under `api/chat/messages/live-segment.ts`.

Both paths must share orchestration code to avoid drift.

### New Orchestration Helper

Recommended file:

- `src/lib/runLiveConversationSegment.ts`

Responsibilities:

1. validate both selected languages against current supported voice/transcription language rules;
2. transcribe the uploaded audio through `transcribeAudio()`;
3. classify the transcript as one of the selected two languages;
4. translate into the other selected language through `translateText()`;
5. add pronunciation guidance through `generatePronunciationGuidance()` when current cross-script rules require it;
6. determine `sender` using the detected language side;
7. persist through `createMessage()` when an owned `conversationId` is supplied;
8. return a client-ready message payload.

### Language Classification

Recommended helper:

- `src/services/classifyLiveSegmentLanguage.ts`

Input:

- transcript;
- `my language` code and label;
- `their language` code and label.

Output:

```json
{
  "languageCode": "es",
  "confidence": 0.86,
  "reason": "short optional diagnostic for logs only"
}
```

Implementation should prefer provider metadata if available only when it maps cleanly to one of the two selected languages. If transcription providers do not return reliable selected-pair metadata, use a compact model classification call constrained to exactly the two selected languages. Any third-language or uncertain result must be clamped back to the active L1/L2 pair.

Do not expose model reasoning to the client.

### Playback Reuse

Live mode should use the existing `fetchOutputSpeech()` client helper and `POST /api/speech/output` server path for generated playback.

Rules:

- translated or second-language TTS can be generated on demand and cached in the current client session;
- saved user voice samples may be used by `/api/speech/output` exactly as they are today;
- Live mode should not create a new TTS provider path.

## Persistence Model

### Signed-In Use

When the user is signed in:

- ensure a conversation id exists before saving processed live segments;
- save each resolved live segment as a normal `public.messages` row;
- keep `message_origin = 'human'`;
- set `sender` from the detected language side;
- set `original_text`, `translated_text`, `transcript`, pronunciation columns, and optional `audio_url` according to current message conventions;
- refresh conversation title using the existing title refresh path when appropriate.

V1 does not require a new live session table unless implementation testing shows that resume/replay needs durable segment metadata beyond current messages.

### Signed-Out Use

When the user is signed out:

- live segments exist only in memory for the current page session;
- captured source audio object URLs are temporary;
- generated TTS cache is temporary;
- reload clears the transcript.

This matches current guest chat behavior and avoids storing long passive recordings without an account.

### Audio Retention

Live mode should not persist raw continuous microphone audio as a long recording in V1.

For saved messages, persist only the minimum audio already needed for existing message playback behavior. If original captured source-audio replay after reload is required later, that should be a separate product decision because it changes storage cost and privacy expectations.

## Privacy And Consent

Live mode records the environment continuously after the user starts it. The UI must make the listening state visible the entire time.

Requirements:

- show an unmistakable listening state while microphone capture is active;
- stop capture immediately when the user stops Live, leaves the mode, returns home, or the app unmounts;
- do not start microphone capture without a user action;
- do not upload silence-only chunks;
- do not store raw continuous session audio;
- keep errors explicit when microphone permission is denied;
- avoid claiming complete transcript accuracy.

A lightweight privacy note can appear in the same compact style already used for inline notices, but V1 should not add a blocking modal unless legal/product review requires it.

## Failure Handling

### Microphone Failure

If microphone permission is denied or capture fails:

- keep the user in Live mode;
- show a compact inline error;
- return to idle state;
- do not create transcript rows.

### Segment Failure

If one segment fails:

- mark only that segment as failed;
- keep listening if capture is still active;
- offer retry if the source audio chunk is still available;
- do not clear successful prior segments.

### Transcription Empty Result

If a segment produces no transcript:

- discard it silently if it was likely silence;
- discard it silently if the provider returns no speech;
- do not append or retain a visible message row for no-speech cases.

### Translation Failure

If transcription succeeds but translation fails:

- show the transcript;
- mark translation as failed;
- offer retry for translation;
- keep listening active.

### Playback Failure

If generated TTS fails:

- keep the text visible;
- show a compact playback error;
- allow retry on the same segment;
- avoid adding duplicate playback buttons or duplicate rows.

## File Map

Recommended file additions and changes:

| Area | Files |
| --- | --- |
| Chat-integrated orchestration | `client/src/StringPhoneApp.jsx`, `client/src/components/chat/ChatScreen.jsx` |
| Live capture hook | `client/src/components/live/useLiveConversationCapture.js` |
| Live capture control | adapted `client/src/components/chat/ChatComposer.jsx` pattern |
| Existing thread rendering reuse | `client/src/components/chat/ChatHeader.jsx`, `ChatThread.jsx`, `MessageBubble.jsx`, `VoiceMessagePlayer.jsx`, `TextToSpeechButton.jsx` |
| Client API | `client/src/chatApi.js` |
| Serverless live segment route | `api/chat/messages/live-segment.ts` |
| Express route parity | `src/server.ts` |
| Live segment orchestration | `src/lib/runLiveConversationSegment.ts` |
| Language classification | `src/services/classifyLiveSegmentLanguage.ts` |
| Existing speech services reused | `src/services/transcribeAudio.ts`, `translateText.ts`, `generatePronunciationGuidance.ts`, `src/lib/runOutputTextToSpeech.ts` |
| Persistence reuse | `src/db/queries/conversations.ts` |

## Acceptance Criteria

- [ ] Chat includes a compact Live listening control using existing composer styling.
- [ ] Chat continues to show the existing language selector/header and thread layout.
- [ ] Starting Live requires one user action and then listens continuously until stopped.
- [ ] Live mode does not require manual start/stop per utterance.
- [ ] Speech is split into short utterance segments and processed in chronological order.
- [ ] Each valid spoken segment appears in the thread after transcript plus translation are ready.
- [ ] The app renders every resolved segment in both selected languages.
- [ ] Segment language detection maps utterances strictly to `my language` or `their language`; no third language appears in Live rows.
- [ ] No-speech chunks do not append or retain visible message rows.
- [ ] Live rows use the same compact sound button as typed Chat messages.
- [ ] The sound button appears only on the second-language side of each live row.
- [ ] Clicking or tapping the bubble body does not play audio.
- [ ] Only one segment plays at a time.
- [ ] Existing explicit playback buttons still work and remain accessible.
- [ ] Live listening reuses current chat/thread/bubble visual patterns and does not add a separate transcript dashboard or top-level mode.
- [ ] Leaving Live mode stops microphone capture.
- [ ] Returning home stops microphone capture and clears transient live state as appropriate.
- [ ] Signed-in live segments save to the current conversation as normal messages.
- [ ] Reopening a saved conversation shows saved live segments as normal bilingual messages.
- [ ] Signed-out live segments remain temporary and clear on reload.
- [ ] Shared-room active state blocks Live mode with the existing lock-notice pattern unless shared compatibility is intentionally added.
- [ ] Existing Chat, Phrasebook, AI partner, shared chat, phrasebook saves, and text playback still work; dormant Single, Conversation, and lesson-building code paths remain available for a future switcher restore.

## Verification Plan

1. Start the dev server and open StringPhone in a desktop browser.
2. Open Chat and verify no microphone capture starts before the user presses the Live listening control.
3. Press start, grant microphone permission, and verify the listening state is visible.
4. Speak one utterance in `my language`; verify one pending segment appears and resolves with transcript plus translation.
5. Speak one utterance in `their language`; verify it resolves in the opposite direction and aligns consistently with existing bubble behavior.
6. Pause between utterances and verify silence does not create empty rows.
7. Speak for longer than the maximum chunk length and verify the app force-finalizes bounded chunks without freezing the UI.
8. Verify no-speech silence does not leave a pending or error row.
9. Tap the live segment bubble body and verify it does not play audio.
10. Tap the compact sound button on the second-language side and verify generated speech plays.
11. Stop Live and verify microphone capture ends while existing rows remain reviewable.
12. Leave Chat during active capture and verify background recording stops.
13. Sign in, start Live in a saved conversation, speak two segments, then reopen the conversation from History and verify the saved bilingual rows hydrate.
14. Try Live mode while shared chat is active and verify the existing lock-notice behavior blocks it.
15. Deny microphone permission and verify Live returns to idle with a compact inline error.
16. Force a segment transcription or translation failure and verify only that segment fails while capture can continue.
17. Run the existing build and targeted chat/audio verification scripts after implementation.
18. Use browser testing at mobile and desktop widths to confirm controls do not overlap and the thread remains scrollable above the bottom control.

## Open Product Calls

- Should the Chat composer placement evolve into a denser control tray if Live listening, text, voice, commands, and language inversion compete for space?
- Should signed-in users have an optional setting to persist original source audio for later replay, or should V1 keep source audio ephemeral for privacy and storage reasons?
- Should V1 expose any speaker labels beyond language-side alignment, or should true diarization wait for a later provider-supported version?
