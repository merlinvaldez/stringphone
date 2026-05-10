# StringPhone Chat Mode Feature Spec

Status: Draft
Date: 2026-05-09
Repo: StringPhone

Primary UI Reference:

- `/c:/Users/merli/Desktop/repos/stringphone/client/src/StringPhoneApp.jsx`

Primary Backend References:

- `/c:/Users/merli/Desktop/repos/stringphone/src/services/translateText.ts`
- `/c:/Users/merli/Desktop/repos/stringphone/src/services/transcribeAudio.ts`
- `/c:/Users/merli/Desktop/repos/stringphone/src/services/generateSpeech.ts`
- `/c:/Users/merli/Desktop/repos/stringphone/src/server.ts`
- `/c:/Users/merli/Desktop/repos/stringphone/api/speech/translate.ts`

## 1. Feature Summary

StringPhone will gain a new `Chat` mode that presents translated communication inside a formal, WhatsApp-inspired thread UI. A user can send typed text or a voice note. Once sent, each item appears in both languages inside the chat. Voice items also appear as playable audio messages with transcript and translation below the player.

`Chat` becomes the default selected mode on app load. Existing `Single` and `Conversation` modes remain, but their translated turns should also be written into the same chat history so that Chat becomes the canonical session record.

## 2. Product Intent

- Preserve StringPhone as a human-to-human translation tool.
- Add a message-thread interface for bilingual communication.
- Keep the current mode selector pattern and current dark visual language.
- Continue using Mistral models for text translation.
- Reuse the existing STT -> translation -> TTS pipeline for voice-generated chat messages.
- Let users review prior translated text and voice turns in one place.

## 3. Important Clarification

This feature is a `chat mode`, not an AI chatbot.

That means:

- The app does not generate its own conversational replies.
- The app only transforms user input into translated output.
- The app keeps the current two-language communication model.
- The chat thread is a bilingual transcript and playback surface.

## 4. Goals

- Add a third mode named `Chat`.
- Make `Chat` the default selected tab on first load.
- Let the user send a text message and see the original plus translated version in one message bubble.
- Let the user send a voice note and see a playable audio bubble plus transcript and translation.
- Save turns from `Single` and `Conversation` into Chat history.
- Preserve current color cues and motion cues instead of redesigning the product into a generic messenger clone.
- Keep the experience mobile-first and safe-area aware.

## 5. Non-Goals For V1

- No user accounts.
- No real-time messaging between two separate devices.
- No backend database for persistent chat history.
- No contact list, inbox list, or conversation list.
- No push notifications.
- No editable pre-send transcript for V1 voice capture.
- No AI assistant persona or freeform LLM chat.
- No brand change away from the current StringPhone UI language.

## 6. Current Repo Constraints

The implementation must respect the current repo shape:

- `/client/src/StringPhoneApp.jsx` currently owns mode selection, language selection, recording state, and local per-screen history.
- The current app defaults to `single`, so the initial mode value must change to `chat`.
- The current `/speech/translate` route is audio-first and expects multipart audio input.
- Text chat does not currently have a dedicated API path.
- The current voice flow stores translated results locally inside each screen flow, so shared chat history requires a new top-level session state.
- The current visual system already uses:
  - zinc/black background surfaces
  - white/10 borders
  - rose for recording
  - amber for processing
  - emerald for playback/success-ready
  - indigo as a secondary accent
- The current language model and language picker structure should stay intact.

## 7. UX Direction

### 7.1 Overall UI Direction

The new mode should feel like a formal messaging surface inspired by WhatsApp, but it should not copy WhatsApp branding or color choices.

The desired feel is:

- clean
- compact
- message-first
- legible on phone
- obvious send/record actions
- clear distinction between original text and translated text
- strong playback affordance for voice notes

The desired feel is not:

- cartoonish
- overly animated
- bright green WhatsApp theming
- purple-on-white AI app styling
- a generic assistant/chatbot shell

### 7.2 Mode Selector

Keep the existing floating segmented control near the top center.

Changes:

- Expand from 2 choices to 3 choices.
- Order should be `Chat`, `Single`, `Conversation`.
- Default selected choice should be `Chat`.
- Keep the same glassy pill shell, border treatment, blur, and hover/active feel.
- Add an icon for Chat that fits the current Lucide icon language.

### 7.3 Chat Screen Layout

The Chat screen should have three major areas:

1. Header area

- App name or compact session label.
- My language chip.
- Their language chip.
- Optional sender-side toggle if needed for same-device chat simulation.

2. Thread area

- Scrollable message list.
- Left/right bubble alignment.
- Text messages and voice messages mixed in chronological order.
- Inline status for pending or failed messages.

3. Composer area

- Text input.
- Send button.
- Mic button.
- Recording state treatment.
- Safe-area aware bottom spacing on mobile.

### 7.4 Visual Rules

- Preserve the current dark radial background.
- Use rounded chat bubbles, but keep them aligned with current StringPhone radii and border softness.
- Keep current motion subtle and functional.
- Keep the current top-level blurred floating controls.
- Use the existing color signals consistently:
  - rose = recording
  - amber = translating/processing
  - emerald = ready/playing audio
  - zinc + white = idle surfaces
  - indigo = secondary or alternate-speaker accent if needed

## 8. Core User Flows

### 8.1 Text Message Flow

1. User opens `Chat`.
2. User selects `My language` and `Their language`.
3. User types a message in the composer.
4. User taps `Send`.
5. App immediately creates an optimistic pending bubble in the thread.
6. App sends the text to the backend for translation.
7. Bubble updates to show:

- original text
- translated text
- timestamp
- ready state

### 8.2 Voice Message Flow In Chat

1. User taps the mic in `Chat`.
2. Recording begins immediately on tap, consistent with current click-to-record behavior.
3. User taps stop.
4. App creates a pending voice message in the thread.
5. Backend transcribes the audio.
6. Backend translates the transcript.
7. Backend generates translated audio using the current TTS routing logic.
8. Thread item updates to show:

- playable audio bar
- transcript
- translated text
- timestamp
- ready state

### 8.3 Voice Flow In Single And Conversation Modes

- `Single` and `Conversation` continue to function as live capture interfaces.
- Every successful translated turn from those modes should also append a message item into Chat history.
- Switching to `Chat` after using those modes should show the full session transcript and playable voice items.
- Chat becomes the single source of truth for message history display.

## 9. Message Rendering Rules

### 9.1 Text Message Bubble

Each text bubble should show:

- sender side alignment
- original text first
- translated text second
- compact timestamp
- pending/error state when relevant

Display hierarchy:

- original text is visually primary
- translated text is visually secondary but always visible
- translation is not hidden behind an expand action

### 9.2 Voice Message Bubble

Each voice bubble should show:

- play/pause button
- progress bar or waveform-style progress rail
- duration label
- transcript under the player
- translated text under the transcript
- compact timestamp
- pending/error state when relevant

V1 playback decision:

- The default playable audio should be the translated audio output, because the current backend already returns translated audio cleanly.
- Original source audio playback can be a future enhancement.

### 9.3 Status Treatment

Message status should be local to the message, not only global.

Statuses:

- pending
- transcribing
- translating
- generating_audio
- ready
- error

Suggested visual treatment:

- amber micro-label for pending states
- emerald ready state for playable audio
- compact retry affordance on error
- no full-screen blocking spinner for text messages

## 10. Language Handling

The chat feature should reuse the current two-language mental model:

- `My language`
- `Their language`

Translation direction rules:

- If the sender is `self`, translate from `myLang` into `theirLang`.
- If the sender is `partner`, translate from `theirLang` into `myLang`.

This means V1 may need a lightweight sender toggle in Chat mode if the app is being used on one device by two people.

Recommended V1 sender model:

- default sender is `self`
- allow a quick sender toggle in the composer
- persist the last chosen sender until changed
- style the toggle to match existing segmented controls

## 11. Functional Requirements

### 11.1 Text Requirements

- User can enter text and send it.
- Empty messages cannot be sent.
- Whitespace-only messages cannot be sent.
- Send action creates an optimistic pending bubble.
- Successful translation updates the same bubble rather than creating a second bubble.
- Failed translation keeps the original text visible and offers retry.

### 11.2 Voice Requirements

- User can record a voice note from Chat mode.
- Recording starts on tap.
- Recording can be stopped manually.
- Existing 30-second max recording rule can remain in V1 unless intentionally changed.
- Successful voice translation produces a playable bubble in Chat.
- Transcript must be visible below the player.
- Translation must be visible below the transcript.
- Audio replay must be user-controlled.
- One active voice recording at a time is allowed.

### 11.3 Cross-Mode Requirements

- Successful `Single` mode turns append to Chat.
- Successful `Conversation` mode turns append to Chat.
- Chat history survives mode switching within the active session.
- The active thread must not reset when moving between modes unless the user explicitly clears it.

## 12. Data Model

Recommended client-side message shape:

```ts
type SessionMessage = {
  id: string;
  kind: "text" | "voice";
  originMode: "chat" | "single" | "conversation";
  sender: "self" | "partner";
  status:
    | "pending"
    | "transcribing"
    | "translating"
    | "generating_audio"
    | "ready"
    | "error";
  sourceLanguageCode: string;
  sourceLanguageLabel: string;
  targetLanguageCode: string;
  targetLanguageLabel: string;
  originalText: string;
  translatedText: string;
  transcript?: string;
  translatedAudio?: {
    mimeType: string;
    durationMs?: number;
    objectUrl?: string;
  };
  createdAt: string;
  errorMessage?: string;
};
```

Notes:

- For text messages, `originalText` is the typed message.
- For voice messages, `originalText` and `transcript` may initially be the same value in V1.
- Audio should be stored client-side as a `Blob` and converted to an object URL for playback.
- The app should continue revoking object URLs when items are removed or replaced.

## 13. API Direction

This feature needs a dedicated text path and a clearer voice-message path.

### 13.1 Text Chat Endpoint

Recommended route:

- `POST /chat/messages/text`

Recommended request:

```json
{
  "text": "Hello, how are you?",
  "sourceLanguage": "en",
  "targetLanguage": "es"
}
```

Recommended response:

```json
{
  "originalText": "Hello, how are you?",
  "translatedText": "Hola, como estas?",
  "sourceLanguage": {
    "code": "en",
    "label": "English"
  },
  "targetLanguage": {
    "code": "es",
    "label": "Espanol"
  }
}
```

Backend behavior:

- Reuse the existing `translateText.ts` service.
- Keep using Mistral chat completions for text translation.
- Return plain translated text only, not chatbot commentary.

### 13.2 Voice Chat Endpoint

Recommended route:

- `POST /chat/messages/voice`

Recommended multipart fields:

- `sourceAudio`
- `voiceSample`
- `sourceLanguage`
- `targetLanguage`

Recommended V1 simplification:

- If `voiceSample` is omitted, backend should default it to `sourceAudio`.
- This matches the current StringPhone same-turn self-reference voice-cloning approach.

Recommended response:

```json
{
  "transcript": "Hello, how are you?",
  "translatedText": "Hola, como estas?",
  "sourceLanguage": {
    "code": "en",
    "label": "English"
  },
  "targetLanguage": {
    "code": "es",
    "label": "Espanol"
  },
  "audio": {
    "mimeType": "audio/mpeg",
    "base64": "..."
  }
}
```

Backend behavior:

- Reuse `transcribeAudio.ts`
- Reuse `translateText.ts`
- Reuse `prepareVoiceReference.ts`
- Reuse `generateSpeech.ts`

### 13.3 Express And Vercel Parity

Because the repo currently supports both local Express routes and deployed `/api/...` routes, the final implementation should preserve parity.

Recommended parity plan:

- add Express handlers in `/src/server.ts`
- add matching serverless handlers in `/api/...`
- keep payload shape consistent between local dev and deployed runtime

## 14. Frontend Architecture Direction

Recommended structural change:

- move shared session state above the individual screen components
- keep `StringPhoneApp.jsx` as the orchestration shell
- split mode-specific UI into dedicated components

Recommended client pieces:

- `ChatScreen.jsx`
- `ChatHeader.jsx`
- `ChatThread.jsx`
- `MessageBubble.jsx`
- `VoiceMessagePlayer.jsx`
- `ChatComposer.jsx`
- `useSessionMessages.js`
- `chatApi.js`

Important implementation note:

- The current `useTranslationFlow()` is too screen-local to act as the long-term owner of shared message history.
- V1 should introduce a shared session store and convert the current live modes into producers of message entries.

## 15. UI Components

### 15.1 Reusable Existing Elements To Keep

- `LanguageSelector`
- `ErrorNotice`
- top floating mode switch styling
- current recording/pending/playback color semantics
- current safe-area spacing approach
- current dark radial scene background

### 15.2 New Components Needed

- `ChatTabButton` or equivalent chat mode icon entry
- `ChatScreen`
- `ChatHeader`
- `SenderToggle`
- `ChatComposer`
- `ChatThread`
- `TextMessageBubble`
- `VoiceMessageBubble`
- `VoiceMessagePlayer`

## 16. Voice Player Requirements

The voice player should feel closer to a messaging app than the current auto-play behavior.

Required controls:

- play/pause
- progress rail
- elapsed or remaining duration
- replay after end

Behavior:

- playback must not auto-start when simply opening Chat history
- playback should be explicit user action
- only one voice bubble should actively play at a time
- active playback should use the existing emerald signal

## 17. Error Handling

### 17.1 Text Errors

- Show original text in the failed bubble.
- Show a compact error label.
- Provide retry.
- Do not erase the failed message.

### 17.2 Voice Errors

- If transcription fails, show the voice bubble in error state.
- If translation fails, keep the bubble and show retry.
- If TTS fails, show transcript plus translation if available and label audio generation as failed.
- If microphone permission is denied, show an immediate inline error near the composer.

### 17.3 Mode-Switch Errors

- Switching tabs during processing must not drop a pending message.
- Pending work should resolve into Chat even if the user has navigated to another mode.
- UI should stay stable if a message finishes while another tab is visible.

## 18. Performance And State Notes

- Text sends can be allowed to queue.
- Voice recording should remain single-active at a time.
- Avoid global blocking overlays for message send.
- Keep audio objects cleaned up properly to avoid memory leaks.
- If temporary local persistence is added later, avoid storing large audio blobs in local storage in V1.

## 19. Accessibility And Mobile Behavior

- Maintain large enough tap targets for mic, send, and playback controls.
- Preserve current focus-visible behavior.
- Keep strong text contrast on dark surfaces.
- Respect `prefers-reduced-motion`.
- Keep safe-area padding on top and bottom.
- Ensure the composer remains usable above mobile keyboards.

## 20. Privacy And Product Messaging

Because voice and text are processed by external model providers, Chat mode should include lightweight disclosure copy somewhere appropriate in the product.

Recommended V1 approach:

- short settings/help note
- no heavy modal interruption
- clear language that audio and text are processed for translation

## 21. Acceptance Criteria

This feature is complete for V1 when all of the following are true:

- App loads into `Chat` mode by default.
- Mode switcher contains `Chat`, `Single`, and `Conversation`.
- User can send text and receive a bilingual text bubble.
- User can record a voice note and receive a playable bilingual voice bubble.
- Voice bubbles include a playback bar and transcript below.
- Successful turns from `Single` appear in Chat.
- Successful turns from `Conversation` appear in Chat.
- Switching modes does not clear the active thread.
- Text translation still uses Mistral text translation.
- Existing speech translation pipeline still works.
- UI uses existing StringPhone color signals instead of introducing a new visual system.

## 22. Recommended Build Order

Phase 1

- Add `Chat` mode shell.
- Change default mode to `chat`.
- Lift shared message state to the app root.

Phase 2

- Add text-message translation path.
- Render bilingual text bubbles.
- Add inline pending/error states.

Phase 3

- Add voice-note capture in Chat.
- Render voice player bubble with transcript and translation.
- Make playback explicit instead of auto-play only.

Phase 4

- Append `Single` and `Conversation` results into shared Chat history.
- Polish switching behavior.
- Tighten mobile layout and keyboard behavior.

## 23. Open Product Calls

The implementation should be confirmed on these points before coding starts:

- Should Chat mode expose a visible `Self / Partner` sender toggle in V1?
- Is translated-audio playback the correct default for voice bubbles, or do you want original-audio playback first?
- Do you want V1 history to live only for the current session, or should refresh persistence be included now?

## 24. Final Recommendation

Build this as a translation-thread mode, not a bot mode.

That means:

- keep Mistral for translation
- keep current voice pipeline
- add a proper shared session message model
- add a WhatsApp-inspired thread UI
- make Chat the default tab
- make Chat the canonical history surface for all translated turns
