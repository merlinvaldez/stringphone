# Mobile conversation and message identity contract

Defined October 13, 2026 for Step 1, item 4 of [the Expo migration](expo-mobile-migration.md). This is the implementation contract for future mobile storage/API adapters, not a claim that SQLite or a native adapter exists yet. Complements [the API audit](expo-mobile-api-contract.md).

## Separate identity domains

An ID names a record; it does not prove permission to access that record. Phone history and web history are independent under the confirmed first-release scope. Matching UUID syntax does not make their IDs interchangeable.

| Proposed name | Created by | Meaning | May cross the API boundary? |
| --- | --- | --- | --- |
| `localConversationId` | Phone | SQLite conversation primary key | No; never as API `conversationId`, route ID or collection `sourceConversationId`. |
| `localMessageId` | Phone | SQLite message primary key and stable retry target | No cloud ownership use; stays local. |
| `localPhraseEntryId` | Phone | SQLite phrase entry primary key | No; mobile Phrasebook uses local storage. |
| `webConversationId` | Existing authenticated server routes | Owned PostgreSQL web conversation | Web only in first release; requires authenticated ownership checks. |
| `webMessageId` | Existing web persistence | PostgreSQL message, including response `savedMessage.id` | Web only; never replaces a local primary key. |
| `utteranceId` | Capture flow | Correlates partial/final results for one speech segment | Yes, as a processing correlation ID; grants no history ownership. |
| `revision` | Capture flow | Orders transcript/translation updates within an utterance | Yes; reject stale results locally. |
| `roomId` | Room server | Active relay room | Yes, only to room endpoints; never as `conversationId`. |
| `roomMessageId` | Room server (`message.id`) | Message identity inside a room | Yes for room retry/events; also retained as local deduplication metadata. |
| `participantId` | Room server | Speaker/participant identity inside a room | Yes where the room contract requires it; distinct from local speaker and web user ID. |

Participant session tokens and invite tokens are credentials, not record IDs. Keep participant credentials in secure device storage, outside message rows and logs. A locally generated ID must never substitute for a session token or authenticated user identity.

## Local storage rules

- Generate stable local UUIDs before remote work. SQLite foreign keys refer only to local primary keys. Do not regenerate a message ID on retry, navigation, restart or receipt of a successful response.
- Keep `localConversationId` in local persistence/state objects; use explicit names rather than a generic `conversationId` in mobile API inputs. Do not serialize a whole database row into a request.
- A live utterance gets its own correlation ID, retained across draft revisions and finalization retries. Map it to one `localMessageId`; enforce local uniqueness for `(localConversationId, utteranceId)` where an utterance is present. Native utterance IDs should be unique across capture sessions, not a counter reset to 1 every turn.
- Draft/final updates target that same local row. A lower revision cannot overwrite newer text; after finalization, late draft updates cannot downgrade ready state. Processing retries are not server idempotency: the current server may repeat provider work.
- For rooms, keep optional `roomId` and `roomMessageId` metadata alongside local IDs. Enforce a unique received-message key `(roomId, roomMessageId)` across the local message store, so reconnect snapshots update the same record. Reopening local history must not automatically rejoin an expired room.
- Room messages received by two phones have the same relay ID but different local primary keys. Each phone saves only what it received while connected; the mapping is not cross-device sync.
- Phrase entries keep their own text/direction snapshots and optional local source references. Archiving a source conversation does not remove the phrase. Permanent deletion/file ownership is still a separate Step 4/7 design task.

## Processing request boundary

Build each mobile request from an allowlist of accepted processing fields. An API input type should not accept `localConversationId` or `webConversationId`; unrelated local storage fields must be excluded at runtime too. TypeScript types alone do not remove extra fields from objects.

| Mobile processing request | Fields allowed by this identity contract | Excluded ownership fields |
| --- | --- | --- |
| Text | `text`, `sourceLanguage`, `targetLanguage` | `conversationId`, `userId`, local row IDs |
| Recorded voice | `sourceAudio`, `sourceLanguage`, `targetLanguage` | `conversationId`, `userId`, local row IDs |
| Speech output | `text`, `language`, optional `speechVoice` | Conversation/message ownership IDs |
| Live credential | Language pair, optional `forceFallback`, `fallbackReason` | Local row IDs; never send permanent provider credentials |
| Live draft | `utteranceId`, `revision`, `transcript`, language pair, optional `sender` | `conversationId`, `userId`, local row IDs |
| Live final | Draft fields plus `liveMode`, optional `translatedText`, `sourceAudio` | **Omit `conversationId` entirely**; do not send a local or room ID |
| Compatibility live segment | `sourceAudio`, language pair | **Omit `conversationId` entirely** |

Use the separate room adapter for `roomId`, participant session tokens and server room message retry IDs. First-release mobile history must not call web conversation create/read/save/archive routes or authenticated collection routes. This does not change their existing web use.

### Why omission matters in current code

`client/src/chatApi.js` optionally adds `conversationId` to voice, live-segment and live-transcript multipart forms. Copying these callers wholesale into native code risks passing the phone's active history ID.

`src/lib/runLiveConversationTranscript.ts` and `runLiveConversationSegment.ts` treat any nonblank `conversationId` as a request for authenticated web ownership checking. Without authentication this returns 401; with authentication it looks up an owned web conversation and can persist a web message/audio. Omitting the field avoids this persistence branch. It must stay omitted even if the mobile request happens to carry an authentication header in the future.

The recorded-voice handlers currently ignore an uploaded `conversationId`, while text/speech processing does not accept it. That is not permission to send local IDs: explicit field construction prevents future handler changes from turning them into ownership identifiers.

Live-final response `savedMessage: null` is expected for the local-history mobile path. If a non-null value unexpectedly arrives, do not adopt it as a local message ID or a guarantee of local save. Treat it as a contract discrepancy for investigation; preserve the local identity and processing result.

## Concrete example

The phone creates local conversation `local-conversation-A` and pending message `local-message-B`. These readable labels illustrate different records; implementation uses generated UUIDs.

```json
{
  "utteranceId": "capture-session-C-segment-D",
  "revision": 3,
  "transcript": "Hello",
  "sourceLanguage": "en",
  "targetLanguage": "es",
  "sender": "self",
  "liveMode": "fallback-transcription"
}
```

This illustrates compatibility JSON finalization. A recording uses multipart with the same fields plus `sourceAudio`. Neither form contains `local-conversation-A`, `local-message-B` or `conversationId`. Keep the local target in the pending operation separately. On response, update `local-message-B` inside `local-conversation-A`; use `utteranceId`/revision to confirm the result still belongs to this operation.

## Shared-room send ambiguity

The existing room send methods create server message IDs; they do not accept a client idempotency key (`client/src/sharedRoomApi.js`, `src/lib/realtimeRooms.ts`). Once a response/event supplies a server ID, deduplicate received data by the room/message pair. A timeout before that ID is known leaves an uncertain send: blindly resending may create another server message.

Before Step 9 acceptance, define how an optimistic local outbound row is associated with its server room message and how uncertain sends are reconciled. Do not deduplicate by text/timestamp alone or claim exactly-once room sends with the current transport. Adding a room idempotency key requires a separate server/client contract change, not reuse of `conversationId`.

## Acceptance for later implementation

- [ ] Capture actual outbound mobile JSON/multipart fields for text, voice, live draft/final and segment retry. None contain a local primary key or cloud ownership `conversationId`; avoid logging audio, text or credentials in production diagnostics.
- [ ] Finalize a guest turn with `conversationId` absent and verify local save, `savedMessage: null` and no web-history insert. Repeat with optional authentication present to prove omission, not sign-out, controls the branch.
- [ ] Retry after failure/restart and verify the same local message/utterance identity is updated once; stale revisions and late partial updates are ignored.
- [ ] Reopen another conversation while a request is pending; its response updates its original local target rather than the newly active thread.
- [ ] Receive the same room message through response, event and reconnect snapshot; one local record exists. Two participants' independently stored histories retain their own local IDs.
- [ ] Verify existing authenticated web conversation/audio persistence still receives server-owned IDs and continues to work.

Source review confirms the identity and ownership branches above. Native adapters, SQLite constraints, room reconciliation and runtime no-write evidence remain future implementation checks. This checklist item defines the separation; it does not certify those implementations.
