# StringPhone

Talk to your grandma—even if you don't speak her language.

StringPhone is a bilingual translation app for text and voice conversations. The app keeps the existing turn-taking interfaces for one-phone and paired conversations while using the Chat surface as the main message history. Chat voice capture is live: the microphone streams transcription and draft translation into the same message bubble as the user speaks.

## Current app

The top mode switcher exposes these surfaces:

| Mode | Current behavior |
| --- | --- |
| Chat | Sends bilingual text messages and starts live voice capture from the existing mic button. Chat also supports shared rooms, saved conversations, and phrasebook saves. |
| Single | One-phone turn-taking UI with separate Speak and Listen controls. Each active turn has a 30-second limit. |
| Conversation | Paired turn-taking UI with top/bottom portrait layout and side-by-side landscape layout. Each active speaker has a 30-second limit and the other side is locked during the turn. |
| Phrasebook | Lesson generation plus saved phrasebook browsing. |

Live capture is implemented inside Chat and is intentionally not a visible top-level mode. There is no separate Live recording button and no separate live transcript screen or dock in the active Chat layout.

## Chat voice capture

1. Choose `My language` and `Their language` in the Chat header. The centered invert button swaps the pair and persists the new direction.
2. Leave the composer empty and press the mic button.
3. The browser microphone streams audio to the live transcription session. Transcript deltas and low-latency translation updates appear in the normal Chat thread while the speaker is talking.
4. Brief silence commits an utterance. The final transcript, translation, and captured audio are passed through the live transcript route and finalized as the same voice message.
5. The active capture stops automatically after 30 seconds or when the square stop button is pressed. Captured voice messages remain playable with their transcript and translation.

Chat language selectors and the invert button are disabled while capture or shared-room updates are active. In a shared room, only the host can change the pair before the guest joins.

## Languages

Persian is available anywhere the shared language list is used, including Chat, Single, Conversation, Live capture, lessons, and phrasebook flows. The current UI language list includes English, Spanish, French, German, Portuguese, Italian, Dutch, Hindi, Arabic, Persian, Chinese, Japanese, Korean, Polish, Russian, Swedish, Turkish, Tagalog, Bulgarian, Romanian, Czech, Greek, Finnish, Croatian, Malay, Slovak, Danish, Tamil, Ukrainian, Hungarian, Norwegian, Vietnamese, Bengali, Thai, Hebrew, Georgian, Indonesian, Telugu, Gujarati, Kannada, Malayalam, Marathi, and Punjabi.

OpenAI is the only AI provider used by the app. Text translation, lessons, conversation titles, UI translations, transcription, and synthesized TTS audio all use OpenAI APIs. TTS supports the selectable `marin` and `onyx` voices.

## Project layout

- `client/` — React + Vite frontend
- `src/` — Express + TypeScript backend and shared orchestration
- `api/` — Vercel-compatible serverless handlers that share the backend helpers
- `docs/` — current feature and integration notes

Important client surfaces:

- `client/src/StringPhoneApp.jsx` — mode, language, message, persistence, and live-capture orchestration
- `client/src/components/chat/` — Chat header, thread, bubbles, and composer
- `client/src/components/live/useLiveConversationCapture.js` — WebRTC microphone capture, silence detection, and transcript events
- `client/src/components/live/useLiveTurnFlow.js` — maps live capture state into Chat, Single, and Conversation turns

## Local development

This Windows environment uses the explicit Node install path because `npm` may not be on `PATH`:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' install
```

Run the frontend and backend together:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' run dev
```

Run one side only:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' run dev:server
& 'C:\Program Files\nodejs\npm.cmd' run dev:client
```

The app normally runs at:

- Frontend: `http://localhost:5173` (or the next available Vite port)
- Backend: `http://localhost:3001`

Build the client:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' run build
```

Other repository checks:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' run verify:tts-audio
& 'C:\Program Files\nodejs\npm.cmd' run verify:saved-message-playback
```

## Environment variables

Create the server environment file from your deployment/local secret store. Do not commit secret values.

Required server variables:

| Variable | Used for |
| --- | --- |
| `DATABASE_URL` | PostgreSQL persistence for signed-in conversations, messages, rooms, lessons, and phrasebook entries |
| `CLERK_SECRET_KEY` | Server-side Clerk verification |
| `VITE_CLERK_PUBLISHABLE_KEY` | Clerk client configuration and server-side Clerk configuration |
| `OPENAI_API_KEY` | Chat translation, transcription, live draft translation, pronunciation guidance, and all synthesized speech |

Optional model and runtime variables:

| Variable | Default |
| --- | --- |
| `OPENAI_TRANSLATION_MODEL` | `gpt-4o-mini` |
| `OPENAI_LIVE_TRANSLATION_MODEL` | `gpt-4o-mini` |
| `OPENAI_LIVE_LANGUAGE_MODEL` | `gpt-4o-mini` |
| `OPENAI_PRONUNCIATION_MODEL` | `gpt-4o-mini` |
| `OPENAI_TRANSCRIPTION_MODEL` | `gpt-transcribe` |
| `OPENAI_TTS_MODEL` | `gpt-4o-mini-tts` |
| `OPENAI_TTS_VOICE` | `marin` |
| `OPENAI_UI_TRANSLATION_MODEL` | `OPENAI_TRANSLATION_MODEL` or `gpt-4o-mini` |
| `OPENAI_CONVERSATION_TITLE_MODEL` | `OPENAI_TRANSLATION_MODEL` or `gpt-4o-mini` |
| `OPENAI_LESSON_MODEL` | `OPENAI_TRANSLATION_MODEL` or `gpt-4o-mini` |
| `PORT` | `3001` |
| `CLIENT_ORIGIN` | local Vite origins |

Client build variables:

| Variable | Default |
| --- | --- |
| `VITE_API_BASE_URL` | `/api` |
| `VITE_SHARED_ROOM_TRANSPORT` | `auto` |

For Vercel, set the server variables in the project environment settings. The OpenAI model selectors are non-secret config; API keys remain secrets. New environment values apply to subsequent deployments.

## API surfaces

The active Chat and live paths are:

- `POST /chat/messages/text` — translate a typed message
- `POST /chat/messages/voice` — retained multipart voice-translation path
- `POST /chat/live-transcription/token` — mint a short-lived OpenAI browser credential
- `POST /chat/messages/live-translation` — translate a partial live transcript
- `POST /chat/messages/live-transcript` — classify, translate, add pronunciation guidance, and optionally save a completed live utterance with its source audio
- `POST /chat/messages/live-segment` — uploaded-segment compatibility path
- `POST /speech/output` — generate playback for text when requested

The same orchestration is exposed through local Express routes and Vercel handlers under `api/`.

The Vercel live-transcript handler accepts the same multipart form and captured source audio as the local Express path. Verify deployed live finalization and source-audio persistence in a Vercel Preview before treating the two paths as equivalent in production.

See [docs/chat-mode-feature-spec.md](docs/chat-mode-feature-spec.md) and [docs/live-transcription-mode-feature-spec.md](docs/live-transcription-mode-feature-spec.md) for implementation details.
