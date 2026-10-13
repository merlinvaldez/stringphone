# Expo mobile API contract audit

Reviewed October 13, 2026 on `feat/expo-mobile-sqlite`. Completes the documentation/audit portion of Step 1, item 3 in [the migration spec](expo-mobile-migration.md). Existing handler behavior is documented below; proposed remedies are not implemented. Native device/provider acceptance remains pending in Steps 6 and 8.

## Addresses and scope

Express listens on `PORT` or 3001. Its paths have no `/api` prefix. Vite proxies `/api` to Express and removes that prefix (`client/vite.config.js`). Vercel exposes the handlers below under `/api`. A future mobile adapter needs an absolute base URL, such as `http://<PC-LAN-address>:3001` during development or `https://<deployment>/api`; append the paths below exactly once. Phone localhost is the phone, not the PC. Reachability, HTTPS, iOS transport policy and Android cleartext policy require device verification.

All listed processing routes accept guest requests. Optional authentication is used for live token safety identity and live persistence; it is not a requirement for translation alone. CORS headers do not authenticate a native app. Permanent OpenAI keys remain server-side.

| POST path | Request | Success | Shared processing | Vercel handler |
| --- | --- | --- | --- | --- |
| `/chat/messages/text` | JSON | JSON bilingual text, `ok: true` | `src/lib/runTextChatMessage.ts` | `api/chat/messages/text.ts` |
| `/chat/messages/voice` | Multipart | JSON bilingual voice plus two base64 audio objects; no top-level `ok` | `src/lib/runVoiceChatMessage.ts` | `api/chat/messages/voice.ts` |
| `/speech/output` | JSON | Binary WAV | `src/lib/runOutputTextToSpeech.ts` | `api/speech/output.ts` |
| `/chat/live-transcription/token` | JSON | Provider credential JSON plus mode/reason; no wrapper `ok` | `src/lib/createLiveTranscriptionClientSecret.ts` | `api/chat/live-transcription/token.ts` |
| `/chat/messages/live-translation` | JSON | JSON partial translation, `ok: true` | `src/lib/runLiveConversationTranslation.ts` | `api/chat/messages/live-translation.ts` |
| `/chat/messages/live-transcript` | Multipart or compatibility JSON | JSON finalized text, `ok: true`; optional saved web message ID | `src/lib/runLiveConversationTranscript.ts` | `api/chat/messages/live-transcript.ts` |
| `/chat/messages/live-segment` | Multipart compatibility/retry | JSON transcript/translation, `ok: true`; optional saved web message ID | `src/lib/runLiveConversationSegment.ts` | `api/chat/messages/live-segment.ts` |

Express implementations live in `src/server.ts`; browser callers live in `client/src/chatApi.js`. `/speech/translate` is a retained general pipeline, not the selected mobile chat endpoint. Account conversation, collection and room APIs need their own ownership/transport work in the later migration items.

## Shared conventions

Language fields are supported language-code strings, resolved by `src/lib/languages.ts`. Do not use a display name as the phone's canonical identifier. Success language objects are `{ code: string, label: string }`. Returned pronunciation strings can be empty; pronunciation failure is logged and does not necessarily fail translation. Identical supported source/target languages are not rejected by these helpers.

Validation failures generally have an HTTP status and JSON `{ error: string }`; unsupported-language errors may also include `supportedLanguages`. There is no stable machine error code or standardized retryable flag. Server/provider/network failures are not all guaranteed to use this JSON shape. The phone must inspect status and content type, handle unparseable bodies with a safe fallback, preserve input and offer deliberate retry. A successful request does not establish that local SQLite/file writes succeeded.

### Text translation

Request: `Content-Type: application/json`; required `text`, `sourceLanguage`, `targetLanguage`. Text must be a nonempty string after trimming. No explicit character maximum exists in this helper.

```json
{ "text": "Hello", "sourceLanguage": "en", "targetLanguage": "es" }
```

Illustrative success shape (translation wording is not guaranteed):

```json
{
  "ok": true,
  "originalText": "Hello",
  "translatedText": "Hola",
  "originalPronunciation": "",
  "translatedPronunciation": "",
  "sourceLanguage": { "code": "en", "label": "English" },
  "targetLanguage": { "code": "es", "label": "Spanish" }
}
```

400 errors: `text is required`, `sourceLanguage is not supported`, `targetLanguage is not supported`. Translation uses the Responses API through `src/services/translateText.ts` / `src/lib/openai.ts`, default `OPENAI_TRANSLATION_MODEL` or `gpt-4o-mini`. The helper does not persist conversations/messages.

### Recorded voice translation

Multipart fields: required `sourceLanguage`, `targetLanguage`, and file field **`sourceAudio`**. Let the upload implementation generate the multipart boundary; do not manually set a bare multipart content-type header. Send the recorder's actual file bytes, accurate filename extension and MIME type. Browser Blob upload code is not a native file adapter.

The browser optionally appends `conversationId`, but neither voice handler forwards it to the helper. This route processes audio without saving a web message. The mobile adapter should omit that field.

Success JSON fields: `transcript`, `translatedText`, `originalPronunciation`, `translatedPronunciation`, `sourceLanguage`, `targetLanguage`, plus:

```json
{
  "audio": { "mimeType": "audio/wav", "base64": "<translated audio bytes encoded as text>" },
  "sourceAudio": { "mimeType": "<uploaded MIME type, or audio/webm fallback>", "base64": "<original uploaded bytes encoded as text>" }
}
```

These placeholders describe shape and are not playable fixtures. There is no top-level `ok` field. Decode both objects into durable local files and store their references/metadata, not base64, in SQLite. This route generates translated speech as part of processing; the app still waits for the user to tap Play. It does not accept a `speechVoice` choice: generation uses server/default voice, so marin/onyx preference needs a follow-up design for this path.

400 errors cover unsupported languages and `sourceAudio file is required`. A zero-byte file is not explicitly rejected before provider processing. Parse/provider exceptions return 502 `Voice chat translation failed`. No application MIME allowlist, signature check, size cap or decoded-duration check is configured here.

Pipeline: `runVoiceChatMessage` -> `runSpeechTranslation` -> `transcribeAudio` -> `translateText` -> `generateSpeech`. `transcribeAudio.ts` posts to `/v1/audio/transcriptions`, default `OPENAI_TRANSCRIPTION_MODEL` or `gpt-transcribe`, and supplies `languages[]` when a source language is known. It trusts an uploaded MIME type; without one, filename mapping handles mp3/wav/m4a/ogg and otherwise defaults to webm. Mapping an extension is not transcoding or provider compatibility evidence. Generated speech is WAV through `generateOpenAiSpeech.ts`.

### User-requested speech output

Required JSON `text`, `language`; optional `speechVoice` is `marin` or `onyx` (undefined/null accepted). Text is trimmed and consecutive whitespace collapsed before validation. The maximum is **500 JavaScript string-length units** after normalization (UTF-16 units, not necessarily 500 visible characters).

```json
{ "text": "Hola", "language": "es", "speechVoice": "onyx" }
```

Success: HTTP 200, `Content-Type: audio/wav`, inline filename `stringphone-output-speech.wav`, raw audio bytes. Errors: JSON 400 `text is required`, `text must be 500 characters or fewer`, `language is not supported`, or `speechVoice is not supported`; exceptions return JSON 502 `Output speech generation failed`.

The phone must check status before reading success as binary. Persist the returned file and play on tap. No long-message splitting is implemented. Model defaults to `OPENAI_TTS_MODEL` or `gpt-4o-mini-tts`; absent an explicit voice, `OPENAI_TTS_VOICE` or `marin` is used. Overrides need separate compatibility checks. The 500-unit rule applies to this route, not automatically to voice translation's internal speech generation.

## Live requests

### Short-lived credential

JSON fields: required `sourceLanguage`, `targetLanguage`; optional `forceFallback` (only boolean `true` activates it) and `fallbackReason` string. Current browser capture requests `forceFallback: true`. Success spreads provider credential JSON, including `value`, and adds `liveMode` (`fallback-transcription` or `realtime-translation`) and `fallbackReason`; do not persist or log credential values as ordinary conversation data. Exact expiry fields are provider-owned and must be validated by the native spike rather than assuming a lifetime.

Fallback requests `/v1/realtime/client_secrets` with transcription session model `gpt-live-transcribe`, selected languages and low delay. The alternative requests `/v1/realtime/translations/client_secrets` with `gpt-realtime-translate` and input transcription `gpt-realtime-whisper`. The browser negotiates WebRTC through `/v1/realtime/calls`. These are the configured source values, not proof of native library or live provider acceptance.

400: `Both selected languages must be supported.`; 503: `Live translation is not configured.`. Credential failures may propagate provider HTTP status with a sanitized fallback error; unexpected handler failures return 502 `Unable to start live transcription.`. Native WebRTC, simultaneous recording and session cleanup remain Step 8 spike work.

### Partial translation

JSON fields: required `utteranceId` nonblank string, `revision` positive integer (numeric strings also accepted), `transcript` nonblank string and the selected language codes; optional `sender` (`self`/`partner`). Both HTTP handlers forward these fields only. Although the shared helper also supports `liveMode`/`translatedText`, these draft HTTP handlers do **not** forward them; do not claim that override is exposed here.

Success: `ok`, `utteranceId`, `revision`, `transcript`, `translatedText`, `sender`, `sourceLanguage`, `targetLanguage`, `detectedSourceLanguage` (`code`, `label`, `confidence`, `ambiguous`). Explicit sender preserves supplied direction; without one, classification selects a side within the pair. Reject stale response revisions on the phone. The server does not provide request deduplication.

400: missing utterance ID, invalid revision or unsupported language. 422: `No speech was detected`. Exceptions: 502 `Live draft translation failed.`. No transcript-length maximum exists at the helper level.

### Final transcript

Current browser uses multipart fields `utteranceId`, stringified `revision`, `transcript`, `sourceLanguage`, `targetLanguage`, `liveMode`; optional `translatedText`, `sender`, `sourceAudio` file and web `conversationId`. Both handlers also accept JSON for compatibility, without an uploaded file. Vercel resolves optional authentication before consuming the body.

Success has the draft result fields plus `originalPronunciation`, `translatedPronunciation`, `savedMessage: { id } | null`. Source audio is not returned as a new audio object here: the native app retains its own durable recording. Realtime-translation mode requires a nonblank supplied translation or returns 422 `No live translated speech was produced`; other mode values default to fallback transcription.

When `conversationId` is omitted, the helper does not write web conversation history. A supplied ID requires a valid authenticated app user (401 `Unauthorized`) and owned conversation (404 `Conversation not found or unauthorized`), then may insert a message/audio and update its language pair/title. Persistence failures can be swallowed while processing still returns success; `savedMessage: null` is not a storage guarantee. This is why phone-local IDs must be omitted. Full local/server identity design remains the next Step 1 item.

Validation also uses the draft errors above; processing exceptions return 502 `Live transcription failed.`. Utterance ID/revision are echoed, but there is no server-side exactly-once persistence guarantee. Native retry/finalization must deduplicate local rows.

### Compatibility live audio segment

Multipart: required language codes and `sourceAudio`; optional web `conversationId`. Browser segment timestamps are not forwarded to the shared helper by these handlers. Success is bilingual transcript/translation, pronunciation, detected-language metadata, sender and `savedMessage`; no returned source/translated audio object. This is recorded-segment processing, not proof of a streaming session. Omit local IDs and retain source files on the phone. Ownership checks and possible web persistence resemble final transcript processing. No-speech returns 422; outer exceptions return 502 `Live conversation segment failed`.

## Transport, duration and format audit

| Boundary | Current rule/evidence | Implication |
| --- | --- | --- |
| Express JSON | `express.json()` defaults to 100kb; confirmed installed body-parser source | Oversized JSON can fail before helpers run. |
| Express multipart | Multer 2.1.1 memory storage, no explicit `limits.fileSize` | No application file cap; full upload buffered in memory. |
| Vercel request/response | Documented 4.5 MB function payload cap | Include multipart/JSON overhead and both returned audio objects; local handler invocation cannot reproduce the host cap. |
| Server duration | `vercel.json` specifies `maxDuration: 300` | Host timeout can precede response; this is not an audio duration rule. |
| Recording duration | UI countdown 30 seconds; live silence threshold 1000ms | No server decoded-audio 30-second enforcement; upload size still varies. |
| Base64 | Each binary payload becomes `4 * ceil(bytes / 3)` characters | JSON voice response contains source plus generated WAV; measure total encoded response. |
| Provider file transcription | Official guide: max 25 MB; mp3/mp4/mpeg/mpga/m4a/wav/webm | Vercel can reject before provider; ogg mapping in source is not proof of supported upload. |
| Phone recording | Expo audio documented presets include platform-specific recording configuration | Choose settings after SDK selection; actual iPhone/Android files still require acceptance. |

For illustration, 30 seconds of mono 24 kHz, 16-bit PCM is approximately 1.44 MB before container overhead; base64 is approximately 1.92 MB. Source plus generated audio can exceed the response budget, especially with stereo, higher sample rates or longer translated speech. This calculation is not a measured provider output or a safe upload cap.

Candidate for the native spike: correctly labeled compressed M4A/AAC on both phones, with actual format/codec/MIME/sample-rate/duration/byte measurements. Do not commit to a preset or infer compatibility solely from extension. Verify compressed upload, transcript and durable playback; test generated WAV on both platforms. Audio formats, headphone/Bluetooth routing and capture interruption remain unverified.

## Express/Vercel parity findings and follow-up work

| Finding | Observed/source behavior | Required follow-up |
| --- | --- | --- |
| Text provider exception | Express catches -> JSON 502; Vercel text fetch has no equivalent catch | Add and verify consistent safe failure response before mobile connection. |
| Malformed JSON | Express parser -> 400 HTML; Vercel text parser converts failure to null -> 400 JSON `text is required` | Agree error normalization; phone handles non-JSON errors regardless. |
| Oversized JSON | Express -> 413 HTML at default limit; locally invoked Vercel helper has no host byte cap | Agree application limits below deployment limits and test deployed failures. |
| Multipart parsing errors | Express upload middleware executes outside route try/catch; Vercel parsing is inside try -> often 502 | Standardize invalid multipart/file errors and bounded buffering. |
| Size/duration validation | No explicit upload cap or decoded-duration validation in selected helpers | Add shared validation with deployment headroom; test empty/unsupported/oversized files. |
| Speech preference | Voice route internally generates speech without requested voice; output route accepts marin/onyx | Decide route behavior so mobile respects saved preference. |
| Long speech | Output route rejects >500 normalized UTF-16 units | Design chunking or explicit unavailable state before claiming full playback. |
| Successful transport | Success schemas match by inspection; no real AI/device probes executed | Verify deployed and local successful text, voice and speech with device fixtures. |
| Mobile history | Live finalization can persist if web IDs/auth supplied | Complete ID-separation item; audit processing history/logging in Step 5. |

These findings are retained rather than silently changing web behavior during a documentation audit. No server routes, providers, authentication or web persistence were changed.

## Verification evidence and commands

October 13, 2026: **11/11 validation probes passed against running Express HTTP and 11/11 against Vercel handlers invoked locally**, via `scripts/verify-mobile-api-contract.mjs`. Covered empty text, unsupported source/target language, missing voice file, empty/oversized speech, unsupported speech language/voice, missing utterance ID, invalid revision and no live speech. Expected statuses and JSON error messages matched. These requests stop at validation; no paid AI processing or database writes were requested.

Separate parser probes confirmed malformed JSON -> Express 400 HTML versus Vercel-local 400 JSON; a 103000-character JSON input with invalid source language -> Express 413 HTML versus Vercel-local 400 JSON. No deployed-host, successful provider, live credential, authenticated persistence or native device acceptance is claimed. Source inspection establishes success shapes; runtime acceptance must still prove them.

From the repository root in PowerShell (Node must be installed/on PATH):

```powershell
# Vercel handler validation, entirely local
node --import tsx scripts/verify-mobile-api-contract.mjs

# Start Express in another terminal using existing environment setup
npm.cmd run dev:server

# Validate local HTTP behavior
node --import tsx scripts/verify-mobile-api-contract.mjs --base-url http://localhost:3001

# Optional deployed validation: replace the example URL with the real API base
node --import tsx scripts/verify-mobile-api-contract.mjs --base-url https://YOUR-DEPLOYMENT/api
```

Expected: 11 PASS lines for each validation run. The script does not read or print credentials. Deployed execution proves only these validation cases, not native audio or successful AI processing. This session's shell lacked Node/npm on PATH, so checks used `C:/Program Files/nodejs/node.exe` explicitly.

Before recorded-voice acceptance, record the device/OS/build, chosen Expo SDK/audio preset, actual MIME/codec/filename/sample rate/channels/duration/bytes, request/response byte counts, handler/provider model, transcript/translation results and playback after restart. Include empty recording, corrupt/unsupported format, oversized upload, long translated output, slow/offline requests and interruptions. Step 8 additionally requires actual live partial updates and concurrent source capture.

## Official references reviewed

- [Express Multer](https://expressjs.com/en/resources/middleware/multer/): multipart storage and upload limits.
- [Vercel Functions limits](https://vercel.com/docs/functions/limitations): payload and duration limits; `maxDuration` does not increase payload allowance.
- [OpenAI file transcription](https://developers.openai.com/api/docs/guides/speech-to-text): upload formats, maximum size and `gpt-transcribe` usage. Configured model overrides require rechecking.
- [OpenAI speech generation](https://developers.openai.com/api/docs/guides/text-to-speech): WAV output and voice/model compatibility, including marin/onyx.
- [Expo audio](https://docs.expo.dev/versions/latest/sdk/audio/): recording options/presets and native lifecycle. Latest docs do not select the migration SDK.
