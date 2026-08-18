# StringPhone Live Transcription Mode

**Status:** Proposed on `feat/12-live-transcription-mode` for issue [#12](https://github.com/merlinvaldez/stringphone/issues/12) on 2026-08-18.  
**Product:** StringPhone  
**Audience:** people using StringPhone in an in-person conversation who want a passive bilingual transcript and tap-to-playback without changing the existing chat experience.

## Outcome

StringPhone adds a new Live mode for passive conversation capture.

When Live mode is started, the app listens continuously to the spoken conversation, splits speech into short utterance segments, transcribes each segment, identifies which of the selected two languages was spoken, translates the segment into the other selected language, and appends it to the existing bilingual thread pattern.

When the user clicks or taps a live conversation segment, StringPhone sounds that segment back using the existing playback patterns. The source transcript can replay the captured source audio when available, and the translated line can use the existing generated text-to-speech path.

The feature must feel like the current StringPhone chat surface gaining a passive listening state. It must not introduce a separate transcript dashboard, large new panels, or a new visual language.

## Product Intent

- Let people put the phone down during an in-person bilingual conversation and get a running transcript in both selected languages.
- Reduce interaction cost compared with the current turn-based voice modes.
- Keep the app's two-language model: `my language` and `their language`.
- Reuse the current chat thread, message bubble, language selector, history, and playback components wherever possible.
- Make every captured utterance playable without forcing a new explicit playback UI on each row.
- Preserve current typed chat, single voice, conversation voice, learning, shared chat, AI partner, saved history, and phrasebook behavior.

## V1 Principles

### Passive After Start

Live mode should require one intentional user action to satisfy browser microphone permissions and user consent. After that action, it listens continuously until the user stops it, leaves the mode, or microphone capture fails.

V1 must not require the user to hold the mic button or manually stop after every turn.

### Existing Thread First

Live utterances should render through the same message-thread mental model as Chat. They should look like regular bilingual conversation rows, not like a log viewer.

### No Unnecessary UI

The only new visible surface should be what is required to enter and control Live mode. Everything else should reuse existing patterns:

- top mode switcher;
- `ChatHeader` language controls;
- `ChatThread` scrolling behavior;
- `MessageBubble` bilingual text hierarchy;
- compact circular playback controls;
- existing amber, emerald, rose, zinc, and white state colors;
- History sidebar access.

### Tap To Sound

Each live segment must be playable from the conversation itself. The main bubble body should be clickable or tappable. Explicit existing speaker/play controls can remain for accessibility and discoverability, but the user should not have to hunt for a separate action.

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
- No replacement of Chat, Single, Conversation, Learning, or shared chat.

## Current Repo Constraints

The implementation should fit the current StringPhone code paths.

- Top-level mode selection is in `client/src/StringPhoneApp.jsx` through `MODE_OPTIONS` and `appMode` rendering.
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

Add Live to the existing top mode switcher.

Recommended order:

| Position | Mode | Rationale |
| --- | --- | --- |
| 1 | Chat | Default text/voice thread remains first. |
| 2 | Live | Passive listening is adjacent to Chat because it renders as a thread. |
| 3 | Single | Existing one-speaker turn mode. |
| 4 | Conversation | Existing manual two-speaker turn mode. |
| 5 | Learning | Existing lesson and phrasebook area. |

Recommended icon: use a Lucide icon that communicates listening or live capture, such as `Radio`, `AudioLines`, or `Ear`, depending on what is available and visually consistent.

### First Open

When the user enters Live mode:

- show the same language selector header used by Chat;
- show the existing History access control;
- show the same empty thread treatment or a lightly adapted empty state;
- show one existing-pattern bottom capture control for starting Live listening.

Browser microphone capture usually requires a user gesture, so Live mode should not silently start recording on page render. The visible start control should use the current mic/recording pattern and then transition into the continuous listening state.

### Active Listening

After the user starts Live:

- the bottom control shows listening state using the existing rose/recording and waveform treatment;
- the app keeps listening until stopped;
- no text composer is needed while Live is active;
- language selectors are disabled while processing active audio;
- each speech segment creates one pending thread item;
- the pending item resolves into transcript plus translation as soon as processing completes;
- long silence should not create empty messages;
- short non-speech sounds should be ignored.

### Live Segment Rendering

A resolved live segment should reuse `MessageBubble` where possible.

Recommended segment shape:

- `kind: "voice"` when captured source audio or generated playback is available;
- `sender: "self"` when the dominant detected language is `my language`;
- `sender: "partner"` when the dominant detected language is `their language`;
- `originalText` is the transcript in the detected spoken language;
- `translatedText` is the translation into the other selected language;
- `transcript` mirrors `originalText`;
- pronunciation guidance follows the existing cross-script rules;
- `messageOrigin: "human"` remains unchanged.

If language detection is ambiguous, V1 should still show the transcript and translation, but it may use the current selected source side as the fallback. The row should not introduce a third neutral bubble style unless a later design explicitly adds that pattern.

### Click To Sound Behavior

The user request is that clicking any part of the conversation should sound the conversation. V1 should implement this without adding a separate playback panel.

Recommended behavior:

- clicking the source transcript area plays the captured source audio for that segment when the browser still has it;
- if captured source audio is unavailable, clicking source text generates source-language speech through `POST /api/speech/output`;
- clicking the translated text area generates or reuses translated-language speech through `POST /api/speech/output`;
- clicking the bubble background defaults to playing the foreign-language side of the segment, because that is usually the learning/listening target;
- existing explicit play or speaker buttons keep working and should stop event propagation so their behavior is precise;
- only one segment should play at a time;
- click-to-play must work on desktop click, mobile tap, keyboard activation, and screen-reader accessible controls.

Playback is manual. Live mode should not auto-play every segment as it appears in V1.

### Stopping Live

When the user stops Live:

- the current in-flight chunk should be finalized when possible;
- incomplete silence-only chunks should be discarded;
- pending rows should resolve, fail softly, or be removed if they contain no transcript;
- the mode remains open so the user can review and tap previous segments;
- the stop action should use the existing square stop icon and recording color treatment.

### Mode Switching

When leaving Live mode while listening:

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

### New Live Screen

Recommended file:

- `client/src/components/live/LiveModeScreen.jsx`

This screen should be a thin wrapper around existing chat UI pieces, not a new app shell.

Recommended composition:

- reuse `ChatHeader` for language controls and History access;
- reuse `ChatThread` for rendering the live transcript;
- reuse `MessageBubble` for individual bilingual rows;
- introduce only a compact `LiveCaptureControl` if `ChatComposer` cannot be adapted without leaving unused text-input UI;
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
  sourceAudioUrl?: string;
  segmentStartedAt?: string;
  segmentEndedAt?: string;
};
```

These fields can remain client-side for V1 unless persistence requires them later.

### Audio Cleanup

Live mode will create more temporary object URLs than turn-based recording. The implementation must revoke object URLs when:

- a live segment is removed or replaced;
- the user starts a new conversation;
- the user returns home;
- the app unmounts;
- shared-room snapshots replace the active message list.

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

The route should not return chatbot content. It only transcribes, classifies, translates, and optionally persists a human speech segment.

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

Implementation should prefer provider metadata if available. If transcription providers do not return reliable language metadata, use a compact model classification call constrained to the two selected languages plus `ambiguous`.

Do not expose model reasoning to the client.

### Playback Reuse

Live mode should use the existing `fetchOutputSpeech()` client helper and `POST /api/speech/output` server path for generated playback.

Rules:

- source captured audio can be played directly from a browser object URL while available;
- source or translated TTS can be generated on demand and cached in the current client session;
- saved user voice samples may be used by `/api/speech/output` exactly as they are today;
- Live mode should not create a new TTS provider path unless the existing endpoint cannot satisfy click-to-sound behavior.

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
- show an error only if it looked like speech but transcription failed.

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
| Mode registration and orchestration | `client/src/StringPhoneApp.jsx` |
| Live screen wrapper | `client/src/components/live/LiveModeScreen.jsx` |
| Live capture control | `client/src/components/live/LiveCaptureControl.jsx` or an adapted `ChatComposer.jsx` pattern |
| Existing thread rendering reuse | `client/src/components/chat/ChatHeader.jsx`, `ChatThread.jsx`, `MessageBubble.jsx`, `VoiceMessagePlayer.jsx`, `TextToSpeechButton.jsx` |
| Client API | `client/src/chatApi.js` |
| Serverless live segment route | `api/chat/messages/live-segment.ts` |
| Express route parity | `src/server.ts` |
| Live segment orchestration | `src/lib/runLiveConversationSegment.ts` |
| Language classification | `src/services/classifyLiveSegmentLanguage.ts` |
| Existing speech services reused | `src/services/transcribeAudio.ts`, `translateText.ts`, `generatePronunciationGuidance.ts`, `src/lib/runOutputTextToSpeech.ts` |
| Persistence reuse | `src/db/queries/conversations.ts` |

## Acceptance Criteria

- [ ] The top mode switcher includes Live using the existing mode-switcher styling.
- [ ] Entering Live mode shows the existing language selector/header and thread layout.
- [ ] Starting Live requires one user action and then listens continuously until stopped.
- [ ] Live mode does not require manual start/stop per utterance.
- [ ] Speech is split into short utterance segments and processed in chronological order.
- [ ] Each valid spoken segment appears in the thread as a pending row, then resolves into transcript plus translation.
- [ ] The app renders every resolved segment in both selected languages.
- [ ] Segment language detection maps utterances to `my language`, `their language`, or an ambiguity fallback.
- [ ] Clicking or tapping a source transcript area plays captured source audio when available.
- [ ] Clicking or tapping translated text plays generated speech in the translated language.
- [ ] Clicking the bubble body defaults to sounding the foreign-language side of the segment.
- [ ] Only one segment plays at a time.
- [ ] Existing explicit playback buttons still work and remain accessible.
- [ ] Live mode reuses current chat/thread/bubble visual patterns and does not add a separate transcript dashboard.
- [ ] Leaving Live mode stops microphone capture.
- [ ] Returning home stops microphone capture and clears transient live state as appropriate.
- [ ] Signed-in live segments save to the current conversation as normal messages.
- [ ] Reopening a saved conversation shows saved live segments as normal bilingual messages.
- [ ] Signed-out live segments remain temporary and clear on reload.
- [ ] Shared-room active state blocks Live mode with the existing lock-notice pattern unless shared compatibility is intentionally added.
- [ ] Existing Chat, Single, Conversation, Learning, AI partner, shared chat, phrasebook saves, and text playback still work.

## Verification Plan

1. Start the dev server and open StringPhone in a desktop browser.
2. Enter Live mode and verify no microphone capture starts before the user presses the start control.
3. Press start, grant microphone permission, and verify the listening state is visible.
4. Speak one utterance in `my language`; verify one pending segment appears and resolves with transcript plus translation.
5. Speak one utterance in `their language`; verify it resolves in the opposite direction and aligns consistently with existing bubble behavior.
6. Pause between utterances and verify silence does not create empty rows.
7. Speak for longer than the maximum chunk length and verify the app force-finalizes bounded chunks without freezing the UI.
8. Tap the source transcript and verify captured audio or source-language generated speech plays.
9. Tap the translated text and verify translated-language generated speech plays.
10. Tap a different segment while one is playing and verify the previous playback stops.
11. Stop Live and verify microphone capture ends while existing rows remain reviewable.
12. Leave Live mode during active capture and verify background recording stops.
13. Sign in, start Live in a saved conversation, speak two segments, then reopen the conversation from History and verify the saved bilingual rows hydrate.
14. Try Live mode while shared chat is active and verify the existing lock-notice behavior blocks it.
15. Deny microphone permission and verify Live returns to idle with a compact inline error.
16. Force a segment transcription or translation failure and verify only that segment fails while capture can continue.
17. Run the existing build and targeted chat/audio verification scripts after implementation.
18. Use browser testing at mobile and desktop widths to confirm controls do not overlap and the thread remains scrollable above the bottom control.

## Open Product Calls

- Should Live mode appear before or after Single in the mode switcher once users have both Chat and manual voice modes?
- Should the default bubble-background click play the foreign-language side or the originally spoken side?
- Should signed-in users have an optional setting to persist original source audio for later replay, or should V1 keep source audio ephemeral for privacy and storage reasons?
- Should V1 expose any speaker labels beyond language-side alignment, or should true diarization wait for a later provider-supported version?
