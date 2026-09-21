# StringPhone Live Speech Capture

**Status:** Implemented on `feat/14-live-text-translation`.
**Current entry point:** the existing mic button in Chat, Single, and Conversation.

## What Live means in the current app

Live is a backend and capture workflow, not a separate visible mode. The user presses the normal mic control for a turn. The app opens a streaming transcription session, shows the partial transcript and translation in the normal message surface, and finalizes each utterance as a bilingual voice message.

The current Chat layout does not render a separate Live button, Live dashboard, or `LiveTranslationDock`. `client/src/components/live/LiveTranslationDock.jsx` remains an available component, but it is not part of the active Chat render path. This preserves the existing Chat, Single, and Conversation UIs.

## User flow

1. The user selects `my language` and `their language`.
2. The user presses the existing mic control.
3. The browser requests microphone access and opens a WebRTC connection to OpenAI's realtime transcription endpoint using a short-lived server-minted credential.
4. Transcript delta events immediately update the active message bubble.
5. The client sends partial transcript revisions to the live-translation route. The translated preview updates in the same bubble while speech continues.
6. Client-side audio monitoring starts a segment when speech is detected and commits it after roughly one second of silence.
7. The segment's transcript and recorded audio blob are sent to final transcript processing.
8. The existing draft becomes a ready voice message with the captured audio, transcript, translation, and pronunciation guidance where required.

Live capture stops when the user presses the square stop control, when the screen changes/unmounts, when the connection fails, or when the 30-second turn timer expires. A single active capture is allowed. Multiple speech segments can be committed during one active 30-second turn.

## UI behavior

- Chat continues to show its existing header, thread, and composer.
- The empty Chat composer shows the mic button; it does not show a separate Live/Radio recording button.
- While capture is active, the composer shows the remaining seconds and an audio-wave/processing state.
- Partial transcript and translation are rendered through `ChatThread` and `MessageBubble`.
- A final live message uses the normal voice-message player and keeps the transcript and translation visible.
- Live audio is not autoplayed.
- The language selectors and invert button are disabled while capture is active or while a shared-room update is busy.
- The active Single/Conversation speaker receives the same 30-second limit and the other turn is locked.

## Language behavior

Live processing is constrained to the selected pair. The server classifies each transcript as `my language` or `their language`; it does not expose a third language in the message model.

- Speech classified as `my language` becomes a `self` message translated into `their language`.
- Speech classified as `their language` becomes a `partner` message translated into `my language`.
- Low-confidence classifications are clamped to the selected pair and marked ambiguous in the server result; model reasoning is not sent to the client.
- Persian (`fa`) is supported in the same language list as the other modes. It is not restricted to Chat.

## Client implementation

| File | Responsibility |
| --- | --- |
| `client/src/components/live/useLiveConversationCapture.js` | Requests the microphone, opens WebRTC, receives transcript deltas/completions, monitors speech/silence, records per-utterance audio blobs, and closes the connection. |
| `client/src/components/live/useLiveTurnFlow.js` | Maps capture status into recording/processing state and tags callbacks with `chat`, `single`, or `conversation`. |
| `client/src/components/chat/ChatScreen.jsx` | Starts the live flow from the existing Chat mic and passes live callbacks to the app root. |
| `client/src/StringPhoneApp.jsx` | Owns live drafts, pending segment processing, message promotion, audio URL cleanup, persistence, retry payloads, and mode-switch cleanup. |
| `client/src/components/chat/MessageBubble.jsx` | Renders the live message as a normal text/voice bubble. |

The app creates the live draft in the root message list as soon as transcript deltas arrive. Later revisions update that same message id rather than appending duplicate bubbles. A final callback marks the draft complete and attaches the recorded source audio. Failed finalization keeps a retry payload containing the transcript and audio blob when available.

## Backend flow

### 1. Credential creation

`POST /chat/live-transcription/token` validates both selected languages and calls `createLiveTranscriptionClientSecret` with the server-only `OPENAI_API_KEY`. The active client requests the transcription fallback session explicitly, which uses the OpenAI transcription client-secret endpoint and the `gpt-live-transcribe` transcription model. The API key is never sent to the browser.

The browser then posts its WebRTC offer to `https://api.openai.com/v1/realtime/calls` with the short-lived credential. Provider audio output is disabled; the app displays text and keeps playback under the user's control.

### 2. Draft translation

`POST /chat/messages/live-translation` receives `utteranceId`, `revision`, `transcript`, `sourceLanguage`, and `targetLanguage`. `runLiveConversationTranslation` classifies the transcript against exactly the selected pair and calls `translateLiveDraft` for the opposite-language preview.

Draft translation uses the OpenAI Responses API with `OPENAI_LIVE_TRANSLATION_MODEL` and defaults to `gpt-4o-mini`. The standard `translateText` path is used if the low-latency request cannot produce a result. The client ignores stale revisions so an older response cannot overwrite newer speech.

### 3. Final transcript processing

`POST /chat/messages/live-transcript` sends the final utterance through `runLiveConversationTranscript`. It:

1. validates the selected pair;
2. classifies the spoken side;
3. finalizes the translation;
4. generates pronunciation guidance when cross-script rules require it;
5. saves the message and captured source audio when an authenticated conversation id is available;
6. returns the final bilingual message payload and saved message id when applicable.

The saved message uses the existing `public.messages` shape with `message_origin: "human"`. Raw source audio is not stored for anonymous sessions; anonymous live messages remain in the current page session.

### Compatibility route

`POST /chat/messages/live-segment` remains available for an uploaded finalized audio segment and compatibility/retry flows. The active streaming UI uses the token, live-translation, and live-transcript routes above.

## API route summary

| Method | Route | Active role |
| --- | --- | --- |
| `POST` | `/chat/live-transcription/token` | Mint the short-lived OpenAI browser credential. |
| `POST` | `/chat/messages/live-translation` | Classify and translate a partial transcript revision. |
| `POST` | `/chat/messages/live-transcript` | Finalize a transcript, pronunciation, audio handoff, and optional persistence. |
| `POST` | `/chat/messages/live-segment` | Compatibility path for an uploaded audio segment. |

The local Express handlers in `src/server.ts` and Vercel handlers under `api/chat/` share the corresponding `src/lib/` orchestration helpers where implemented.

### Deployment parity note

The local Express and Vercel `/chat/messages/live-transcript` handlers both parse the multipart form sent by the client, including the optional `sourceAudio` file. The Vercel handler also retains JSON parsing for compatibility with older clients.

## Configuration

Required for the live path:

- `OPENAI_API_KEY` — server-only OpenAI key used to mint the browser credential and call translation/classification/pronunciation services.
- `DATABASE_URL` — required for signed-in persistence across the app.
- `CLERK_SECRET_KEY` and `VITE_CLERK_PUBLISHABLE_KEY` — required for authenticated persistence.

Optional model overrides:

- `OPENAI_LIVE_LANGUAGE_MODEL`, default `gpt-4o-mini`;
- `OPENAI_LIVE_TRANSLATION_MODEL`, default `gpt-4o-mini`;
- `OPENAI_PRONUNCIATION_MODEL`, default `gpt-4o-mini`;
- `OPENAI_TRANSCRIPTION_MODEL`, default `gpt-transcribe`.

The transcription session itself currently uses the provider model names defined in `createLiveTranscriptionClientSecret.ts`.

## Failure behavior

- Unsupported language pairs return a validation error before the session starts.
- Missing OpenAI configuration returns `Live translation is not configured.`
- Microphone/browser/WebRTC failures return the capture state to error/idle and show an inline message.
- An unexpected connection close stops background capture.
- No-speech segments are ignored instead of creating empty bubbles.
- A final processing failure leaves the message available for retry when the transcript/audio payload is still available.
- A live translation failure does not turn the captured utterance into an AI/chatbot reply; it remains a human message or an explicit message error.

## Verification checklist

1. Open Chat and confirm there is no separate Live recording button.
2. Press the normal mic with an empty composer and grant microphone permission.
3. Speak continuously and confirm transcript text appears before the utterance is finalized.
4. Pause for about a second and confirm the same bubble receives the translation and voice recording.
5. Speak in the other selected language and confirm the sender side/direction changes according to language classification.
6. Confirm the 30-second timer stops the active capture.
7. Stop early and confirm the final in-flight utterance is handled without background recording.
8. Deny microphone permission and confirm an inline error appears without leaving capture running.
9. Sign in, complete a live utterance, reopen the conversation from History, and confirm the bilingual message and source audio are restored.
