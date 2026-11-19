# Mobile processing history and logging audit

Reviewed October 15, 2026 against Express `src/server.ts`, the corresponding Vercel handlers in `api/`, processing runners, provider helpers, optional authentication and database helpers. This audit covers the selected processing endpoints, including planned recorded and live turns. Rooms require a separate temporary relay retention review in Step 9.

| Endpoint | Application history behavior |
| --- | --- |
| `POST /chat/messages/text` | Translation/pronunciation only; no database writes. Ignores ownership fields. |
| `POST /chat/messages/voice` | Transcription/translation/speech/pronunciation only; uploaded bytes and generated audio remain request data. No database/file writes. |
| `POST /speech/output` | Generated speech response only; no application persistence. |
| `POST /chat/live-transcription/token` | Short-lived provider credential; optional authenticated user lookup and hashed safety identifier. No application history writes. |
| `POST /chat/messages/live-translation` | Partial translation/classification only; no application persistence. |
| `POST /chat/messages/live-transcript` | Without `conversationId`, finalizes a response only, including when authenticated. With a web conversation ID, requires authenticated ownership before processing; saves the web message/source audio and updates languages/title. |
| `POST /chat/messages/live-segment` | Without `conversationId`, returns a processed turn only. With a web conversation ID, requires authenticated ownership and saves the web message/source audio/title. |

Mobile must omit server `conversationId`, cookies and authorization for these processing requests. The current allowlisted JSON transport only exposes text and output speech, drops extra fields, and does not attach account credentials. Future voice/live adapters must preserve that boundary; local SQLite IDs are never web ownership IDs. Optional authentication performs user reads, not user creation. The runners do not infer a history destination from authentication alone.

Processing inputs, audio buffers and responses exist for the request lifetime; this is separate from permanent application history. Web live finalization deliberately retains its existing persistence behavior. No new mobile persistence flag or account requirement was introduced.

## Diagnostics

Removed raw error/rejection arguments from selected Express/Vercel processing handlers and their pronunciation, classification, fallback translation, token, optional Vercel auth, title and database diagnostics. These now log only fixed operation labels. Errors can contain provider response text, SQL details, filenames, tokens or user speech; neither error messages nor stacks are logged in this path. Vercel text processing now catches provider failures and returns a fixed JSON 502 instead of allowing an uncaught provider exception to reach platform diagnostics.

Code inspection found no request-body, audio, transcript, response-body or credential logging in the selected processing graph. The shared Responses API helper and live draft translator request `store: false`. This is not a claim about provider retention, hosting access logs, Clerk telemetry or encrypted storage. Deployed logging configuration and real provider/device behavior were not inspected. Permanent web history endpoints and room relay behavior retain their separate contracts.

## Verification

From the repository root in PowerShell:

```powershell
node scripts/verify-mobile-processing-audit.mjs
node --import tsx scripts/verify-mobile-api-contract.mjs
node --import tsx scripts/verify-mobile-local-history.mjs
```

The processing audit executes real text/voice/live orchestration with isolated provider/database substitutes: successful processing without a conversation ID touches no database methods for guests or authenticated callers; guest web-ID requests fail before database access; authenticated web live finalization still saves. It exercises pronunciation failures containing a sensitive sentinel and checks that diagnostics omit it, verifies the Vercel text failure response, and guards fixed-message diagnostics on the reviewed paths. Provider/network/database dependencies are substituted, so these checks do not establish deployed end-to-end behavior. Speech output and token persistence behavior were established by code inspection; contract probes cover their validation paths.

