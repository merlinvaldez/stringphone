# StringPhone Chat Mode

**Status:** Implemented on `feat/14-live-text-translation`.
**Source of truth:** `client/src/StringPhoneApp.jsx`, `client/src/components/chat/*`, `client/src/components/live/*`, and the `/chat/*` handlers.

## Purpose

Chat is StringPhone's primary bilingual message surface. It supports typed messages, live voice messages, saved conversations, shared rooms, phrasebook saves, and the optional AI partner. The app keeps the original Single and Conversation turn-taking screens instead of replacing them with a generic chat UI.

## Visible modes

The floating mode switcher exposes:

- `Chat` — the default mode and canonical message-thread view.
- `Single` — one-phone Speak/Listen turn-taking.
- `Conversation` — paired top/bottom or side-by-side turn-taking.
- `Phrasebook` — lessons and saved phrasebook entries.

There is an internal `Live` mode identifier for state cleanup and compatibility, but it is hidden from the mode switcher. Live capture is started from Chat's existing mic button.

## Chat header

The header contains:

- the history button;
- the `My language` selector;
- the `Their language` selector;
- a centered language-invert button.

The invert button swaps both selected languages, persists the active conversation direction, and updates a host-owned shared room when the room is still editable. It is disabled while Chat is busy, while a shared-room update is in progress, for a guest, after the guest has joined, or when both selectors contain the same language.

Persian is part of the shared language list and is available in Chat, Single, Conversation, live capture, lessons, and phrasebook flows. There is no Chat-only Persian gate.

## Text messages

1. The user types into the composer and presses `Send` or Enter.
2. The client creates an optimistic message in the thread.
3. `POST /chat/messages/text` translates from `my language` to `their language` using the selected pair.
4. The message is updated in place with the original text, translation, pronunciation guidance where applicable, and ready/error state.
5. Signed-in messages are saved to the active conversation. A conversation is created on demand when a message needs persistence.

Chat is translation-first, not a general-purpose assistant. The optional AI partner is activated separately with `/aipartner` and is documented in [ai-partner-feature-spec.md](ai-partner-feature-spec.md).

## Voice messages: current live path

The Chat mic uses the live capture workflow. It does not call a separate manual voice-note workflow from the active Chat UI, and there is no separate Live recording button.

1. The user leaves the composer empty and presses the mic.
2. `useLiveTurnFlow` starts `useLiveConversationCapture` with the current language pair.
3. The browser requests microphone access and opens a WebRTC transcription session using a short-lived credential from `POST /chat/live-transcription/token`.
4. OpenAI transcription deltas are appended to the normal Chat message bubble as speech arrives.
5. The client sends partial transcript revisions to `POST /chat/messages/live-translation`. The draft translation updates in the same bubble while speech continues.
6. Local audio monitoring commits a segment after a short silence. The client also keeps a `MediaRecorder` blob for that utterance.
7. The final transcript, draft translation, live mode, selected languages, and captured audio are sent to `POST /chat/messages/live-transcript`.
8. The existing bubble is finalized with the transcript, translation, and captured voice recording. The source audio is playable through the normal voice message player.

The capture session has a 30-second limit. The countdown is visible while the mic is active, and capture also ends when the user presses the square stop button. Multiple speech segments can be committed during one active session. Empty or no-speech segments are discarded without adding a visible message.

Live drafts render through `ChatThread` and `MessageBubble`; they are not rendered in a separate transcript dashboard. The app does not autoplay captured or generated audio for each live segment.

## Message rendering

Every message keeps the selected source and target language snapshots so history remains understandable if the user later changes the selectors.

Text messages show:

- original text;
- translated text;
- pronunciation guidance when the language/script rules require it;
- timestamp;
- pending, translating, ready, or error treatment;
- retry when processing fails;
- phrasebook save when the message is complete.

Voice messages show:

- the captured transcript;
- a compact voice-message player when captured audio is available;
- the translated text;
- pronunciation guidance where applicable;
- processing/error/retry treatment.

The message sender controls bubble alignment. Chat-originated user turns use `sender: "self"`; AI partner turns use `messageOrigin: "ai_partner"` and `sender: "partner"`. Shared-room messages are mapped from the room participant who authored them.

## Shared history and persistence

The root app owns the message list. Chat, Single, Conversation, and live callbacks append to the same list with an `originMode` of `chat`, `single`, `conversation`, or `live` as appropriate. Single and Conversation filter that list for their own voice histories while Chat renders the full current thread.

For signed-in users, completed messages are saved in the active `public.conversations` / `public.messages` records. Live finalization can save the captured source audio with the message. Signed-out messages remain in the current page session and are cleared on reload.

Opening a saved conversation loads its language pair and messages into Chat. Starting a new conversation clears the active message list and resets the AI partner/live state.

## Single and Conversation modes

The turn-taking screens retain their separate existing UI:

- `Single` has independent Speak and Listen controls.
- `Conversation` has one control for each side, with the active side shown in the top or bottom portrait layout and in the left or right landscape layout.
- An active speaker gets up to 30 seconds.
- The other action/side is locked until the active capture is stopped or finalized.
- Both modes use the same live transcription, silence segmentation, final transcript processing, captured-audio handoff, and bilingual message shape as Chat.

Their completed messages are also available in the root message history and can be reviewed from Chat or History when persisted.

## Current API routes

All client URLs are prefixed by `VITE_API_BASE_URL`, which defaults to `/api` in the Vite build.

| Method | Route | Purpose |
| --- | --- | --- |
| `POST` | `/chat/messages/text` | Translate a typed message. |
| `POST` | `/chat/messages/voice` | Retained multipart voice translation path used by compatibility/retry flows. |
| `POST` | `/chat/live-transcription/token` | Validate the selected pair and mint a short-lived OpenAI browser credential. |
| `POST` | `/chat/messages/live-translation` | Classify/translate a partial transcript revision for the streaming draft. |
| `POST` | `/chat/messages/live-transcript` | Finalize a transcript, classify the language side, add pronunciation guidance, and optionally persist the message/audio. |
| `POST` | `/chat/messages/live-segment` | Process an uploaded live audio segment for compatibility or retry. |
| `POST` | `/chat/conversations` | Create an authenticated saved conversation. |
| `GET` | `/chat/conversations/:id/messages` | Load saved messages. |
| `POST` | `/chat/conversations/:id/messages` | Save a completed message. |
| `POST` | `/chat/rooms` and `/chat/rooms/:roomId/*` | Create, join, synchronize, and exchange shared-room messages. |
| `POST` | `/speech/output` | Generate on-demand speech output where a UI path requests it. |

Each deployed handler under `api/` shares orchestration with the Express route in `src/server.ts` where both paths exist.

## Provider responsibilities

- OpenAI: typed Chat translation, live transcription credentials, live draft translation, selected-pair language classification, and pronunciation guidance.
- Mistral: provider-backed speech paths, conversation title refresh, lesson generation, AI partner generation, and UI translations where those services are used.
- ElevenLabs: Persian speech and related speech operations.
- Cartesia: the Cartesia-supported speech languages.

The OpenAI model selectors are configurable through `OPENAI_TRANSLATION_MODEL`, `OPENAI_LIVE_TRANSLATION_MODEL`, `OPENAI_LIVE_LANGUAGE_MODEL`, `OPENAI_PRONUNCIATION_MODEL`, and `OPENAI_TRANSCRIPTION_MODEL`. Their current defaults are documented in the repository README.

## Verification checklist

1. Open the app and confirm Chat is selected by default.
2. Select two different languages and press the centered invert button. Confirm both selectors swap.
3. Send a typed message and confirm one bilingual bubble updates in place.
4. Press the empty-composer mic, speak, pause briefly, and confirm the transcript and translation stream into a voice bubble.
5. Confirm the captured voice note remains playable after the segment finalizes.
6. Let capture run or speak until the 30-second timer ends and confirm the session stops.
7. Confirm Single and Conversation still show their original turn-taking controls and 30-second timers.
8. Select Persian in Chat and in a voice mode and confirm it is not blocked by a mode gate.
9. Sign in, send a message, reopen it from History, and confirm its bilingual content and voice playback hydrate.
