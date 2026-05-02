# StringPhone

Talk to your grandma... even if you don't speak her language.

StringPhone is a one-phone, turn-based voice translation app. For MVP V1, each speaker records a phrase in the browser, the backend transcribes and translates it with Mistral, and Mistral instant voice cloning uses that same recording as the voice reference for translated playback.

## MVP V1

- React + Vite frontend in `client/`
- Express + TypeScript backend in `src/`
- Single Mode for speak/listen handoff on one phone
- Split Mode for face-to-face use, with portrait top-bottom layout and landscape/desktop side-by-side layout
- Browser `MediaRecorder` capture per turn
- `POST /speech/translate` supports MP3 output and frontend JSON output
- Supported V1 languages: English, Spanish, French, German, Portuguese, Italian, Dutch, Hindi, and Arabic

## Local Development

This Windows environment uses the explicit Node install path because `npm` is not on PATH:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' run dev
```

The app runs at:

- Frontend: `http://localhost:5174`
- Backend: `http://localhost:3001`

To run only one side:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' run dev:server
& 'C:\Program Files\nodejs\npm.cmd' run dev:client
```

To verify the client build:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' run build
```

## API

`POST /speech/translate`

Multipart fields:

- `targetLanguage`: language code such as `es`, `fr`, or `de`
- `sourceAudio`: recorded phrase
- `voiceSample`: same recorded phrase for MVP V1 instant voice cloning
- `responseMode`: optional; set to `json` for frontend responses

When `responseMode=json`, the backend returns:

```json
{
  "transcript": "Hello, how are you?",
  "translation": "Hola, ¿cómo estás?",
  "targetLanguage": "Spanish",
  "audio": {
    "mimeType": "audio/mpeg",
    "base64": "..."
  }
}
```

When `responseMode` is omitted, the existing MP3-only behavior is preserved.
