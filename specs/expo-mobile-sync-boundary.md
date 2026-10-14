# Mobile local-history and future sync boundary

Reviewed October 14, 2026 for Step 4 item 7 of [the migration checklist](expo-mobile-migration.md).

## First release

Mobile history, Phrasebook entries, preferences and durable audio belong to the phone. No mobile account is required. SQLite IDs and processing request/attempt IDs do not identify cloud-owned records. A network connection does not upload, restore, merge or synchronize history. Reopening storage or recovering interrupted requests makes no cloud-history calls.

Current JSON processing transport allows only `/chat/messages/text` and `/speech/output`, constructing allowlisted payloads without local IDs, `conversationId` or `userId`. The local storage modules use SQLite and app files; they have no account, upload, synchronization or web-history client. Voice, live and room adapters remain later implementation milestones and must preserve this boundary. This source review is not runtime evidence that every future endpoint avoids server persistence; Step 5 explicitly audits those endpoints.

Cloud processing still sends necessary text/audio to the backend and provider. Shared-room communication still uses server relay state: each phone saves the messages it receives while connected. Relay IDs support communication/deduplication, not account-based history sync, late-join recovery or transfer between phones. Website accounts and PostgreSQL history continue independently.

Permanent deletion removes local records and audio no retained record needs; it does not issue cloud deletion requests or maintain sync tombstones. Saved Phrasebook copies and shared audio references survive source-conversation deletion. SQLite compaction and file cleanup do not promise secure erasure, provider deletion or removal from device backups.

Uninstalling/clearing app data can remove local history. Local storage is not a backup guarantee; device backup behavior must be reviewed before release. Manual export/import, website-history migration, account enrollment and cross-device sync remain deferred. Do not add sign-in, sync toggles, cloud restore, implicit uploads or a background sync queue as part of remaining first-release work.

## Required design before future implementation

Future sync needs a separately reviewed feature spec and explicit scope approval before changing the first-release boundary. That design must resolve these issues together:

| Area | Required decisions |
| --- | --- |
| Identity and ownership | Account enrollment/consent, authentication, authorization, local-to-cloud ID mapping, device identity, guest-history adoption, account switching/sign-out and access revocation. Local IDs must never bypass ownership checks. |
| Offline conflicts | Record revisions, durable outbox/inbox, retry/idempotency keys, ordering, interrupted batches and deterministic conflict handling for edits, language direction and Phrasebook copies. Keep local message IDs stable. |
| Deletions | Tombstones/retention, deletion propagation, delete-versus-edit conflicts, offline devices, restore/reinstall behavior and how permanent deletion avoids resurrecting records. Define shared audio/Phrasebook ownership before uploading any data. |
| Audio uploads | Explicit upload scope, supported formats/limits, resumable transfers, checksums, encryption requirements, authenticated download access, deduplication, quotas, partial-upload cleanup and server/object-store expiry/deletion. Relative local filenames cannot serve as cloud object authorization. |
| Web compatibility | Distinct mobile/local and server IDs, web account/history preservation, schema/API rollout, device/web conflict behavior, feature gating, rollback and acceptance on both existing web and native clients. |
| Privacy and recovery | Retention/disclosures, backup/restore guarantees and limits, opt-out, data removal, provider processing boundaries and what happens to already-uploaded data after sign-out or uninstall. |

Acceptance must include two offline devices editing/deleting the same records, delayed retries after deletion, account switching, failed audio transfers, sign-out/revocation, reinstallation and existing website history regressions. A shared room working across devices is not evidence that history sync works.

## Verification

Reviewed the current migrations, history/audio/processing/deletion modules and native JSON transport. Run the existing boundary/transport checks from the repository root:

```powershell
node --import tsx scripts/verify-mobile-adapters.mjs
npm.cmd --prefix mobile run check:server-boundary
```

These verify current allowlists, excluded ownership fields and source boundaries. Actual mobile network captures and no-server-history-write checks remain the endpoint integration acceptance gates in the [identity contract](expo-mobile-identity-contract.md).
