# Local history schema

History remains phone-local with no required mobile account or cross-device sync. See the [first-release boundary and prerequisites for future sync](../../../specs/expo-mobile-sync-boundary.md). Processing and shared-room communication do not authorize cloud history uploads.

Step 4 item 1, implemented October 14, 2026. `openNativeHistoryDatabase()` explicitly opens and migrates the database before returning it. The app-owned native Chat session now calls it once per app lifetime.

Version 1 creates conversations, messages, phrasebook entries and preferences. IDs are nonempty app-generated stable text identifiers, independent of web IDs. Timestamps are UTC epoch milliseconds. Messages retain speaker (`me`/`them`), origin mode, language direction, both pronunciation fields, draft/pending/ready/failed/interrupted status, errors and an optional unique request ID. Preferences hold JSON values; Chat now stores its active conversation and preferred language pair atomically with selection changes.

Migrations run in an exclusive transaction with `PRAGMA user_version`. Failure rolls back schema/version changes and closes the opening connection; newer schemas are rejected without reset. Append future versions instead of editing shipped migrations. No migration deletes existing history to recover an error.

Permanent deletion replaces archive/restore. Deleting a conversation cascades to its messages; a saved Phrasebook entry owns its copied text and pronunciation, and its source link becomes null. Deleting a phrase does not delete its originating message. No archive flags or soft-delete rows exist. Future deletion controls must confirm the action and coordinate removal of audio files no longer referenced by any retained record. Shared audio references and unreferenced-file cleanup are now implemented; confirmation-gated deletion and database compaction are now implemented; SQL row deletion alone does not guarantee the database file shrinks.

History/Phrasebook screen integration remains later checklist work. Native restart/upgrade acceptance remains unverified. Schema checks use real desktop SQLite through Node; they do not substitute for native device checks.

Reviewed [Expo SDK 57 SQLite](https://docs.expo.dev/versions/v57.0.0/sdk/sqlite/).

From the repo root:

```powershell
node --import tsx scripts/verify-mobile-history.mjs
npm.cmd --prefix mobile run typecheck
npm.cmd --prefix mobile run lint
```

## Durable audio

Step 4 item 2, implemented October 14, 2026. Schema version 2 adds `audio_assets`, `message_audio` and `phrasebook_audio`. References store a basename rather than an absolute sandbox URI, plus format, MIME type, optional duration in milliseconds (null means unknown), byte size, creation time and available/missing state. Source and translated roles have independent links. Phrasebook links can retain shared audio after source-message deletion; asset rows remain until future unreferenced-file cleanup.

Compose `createAudioStorage(database, createNativeAudioFiles(), newId)` from `storage/audio.ts` and `adapters/files.ts`, using a stable unique ID generator. `save(owner, { uri }, metadata)` copies a stopped recording from its local URI into `Paths.document/stringphone-audio`; `{ bytes: Uint8Array }` saves decoded generated speech. Source cache files are preserved until a later capture controller decides it is safe to remove them. Base64 decoding and capture/upload integration remain Step 6 work. Do not call remote processing until save succeeds.

Writes refuse existing filenames. File size is checked before inserting asset metadata and the owner link in a transaction. Database failure attempts to remove the new file and propagates the error. Missing or size-mismatched files resolve to a null playback URI and update availability without removing readable message text. File-stat errors propagate instead of silently claiming availability. Use `resolve(owner)` before playback rather than trusting a previously stored availability flag.

Filesystem and SQLite operations cannot be one atomic transaction. App termination between them or failed cleanup can leave an orphan; storage reconciliation now cleans these orphans; permanent confirmation-gated deletion and database compaction are now implemented. File bytes are not codec-validated here, and duration is supplied by capture/response metadata. Screens remain unwired.

Checks use a temporary on-disk SQLite database and real desktop files: v1-to-v2 preservation, close/reopen, metadata/links, missing-file detection, duplicate-role rollback and disk-full failure injection. Native Expo file operations and actual playback still require iPhone/Android acceptance. The versioned FileSystem docs were unavailable; APIs were checked against installed SDK 57 declarations and [current Expo FileSystem documentation](https://docs.expo.dev/versions/latest/sdk/filesystem/).

## History repository

Step 4 item 3, implemented October 14, 2026 in `history.ts`. Compose `createHistoryRepository(await openNativeHistoryDatabase())`. It provides conversation creation/listing, ordered message history, indexed text search, pending-request listing, queueing, explicit retry and request finalization. All caller values use bound parameters. Read limits are 1-200; longer histories must be paginated in a later UI integration. Message reads currently return the earliest requested rows, not an entire unbounded thread.

Schema version 3 backfills an FTS5 index for conversation titles, original/translated message and phrase text, and pronunciation. Triggers maintain it on inserts, updates and deletes, including cascaded message deletion. Search uses Unicode token phrase matching rather than arbitrary substring matching or user-authored FTS syntax; quotes are escaped before binding. Existing language/history indexes remain, with an added partial index for pending-request enumeration. FTS5 is enabled by default in Expo SQLite; verify it in signed device builds.

`queueMessage` returns `created` once and `existing` for the same message/request/input. Conflicting identity reuse throws. Only dispatch a new remote operation for `created`; `existing` does not authorize another send. A failed/interrupted row may be explicitly claimed using `retryMessage`, which returns true only when changing it to pending. It retains the same local message/request IDs and clears the previous error. Listing pending rows after restart is read-only: recovery must not automatically resubmit them. Cold-start interruption recovery is now implemented in the saved-message flow below.

`finishRequest` updates the pending row and parent conversation timestamp atomically; wrong IDs, deleted rows, and already finalized rows return false. Completion preserves per-message language direction and speaker identity. It stores text and pronunciation or a failure on the existing row. Controllers must serialize remote attempts for each row and abort/ignore earlier attempts before retrying; these local IDs do not establish provider-side idempotency. Schema v4 adds a separate local attempt counter for guarded finalization.

The native database adapter retains one dedicated writer connection, enables foreign keys before any transaction, and queues exclusive callbacks. Each callback uses `BEGIN IMMEDIATE`, commits on success and rolls back on failure. The writer stays open until the caller closes the session; closure drains queued work and closes both connections once. This avoids the native SQLite finalization crash observed when closing each startup transaction in Expo Go 57.0.9 on a Pixel 10a (Android 17). The primary connection remains separate so ordinary reads cannot join a writer transaction. SQLite ignores attempts to turn foreign keys on inside an active transaction, so setting them only in a callback would be insufficient. Use the migrated native adapter, not an unconfigured raw connection.

Run `node --import tsx scripts/verify-mobile-exclusive-connection.mjs` to check queued isolation, rollback recovery, retained connections and idempotent close. On-device October 14, 2026: the old adapter reproduced a Scudo abort in `libexpo-sqlite.so` / `sqlite3_close`; the retained writer allowed Chat to open and save a test message. The configured preview returned HTTP 401, so successful remote translation remains unverified.

Verification covers v1-to-v3 upgrades/backfill, duplicate/conflicting IDs, retry after disk reopen, parameterized quoted input, search index update/deletion, bounded reads, wrong/late finalization and failure rollback across message/conversation updates. No network requests are made. Native connection behavior, recovery controllers and UI remain unverified/unwired. Run the history verification command above to repeat these checks.

## Saved-message processing

Step 4 item 4, implemented October 14, 2026. Schema v4 adds text/voice input kind and an attempt counter. Existing rows retain their content and default to text/attempt zero; no voice callers existed before this migration.

Compose one app-owned `createSavedMessageFlow(history, audio)` instance. Call and await `recoverOnStartup()` on cold startup before enabling processing, then reuse the instance across navigation. It atomically marks all pending rows interrupted, preserves their input/audio, increments attempt counters to invalidate previous completions and explains that the server may already have finished. It never dispatches, resumes or polls cloud operations. Repeating recovery with no pending rows changes nothing. Do not call it on navigation or while any processing is active.

`saveTextDraft(input)` persists or edits a draft on the same stable message/request IDs. Speaker, language direction and ownership cannot change under an existing identity. Empty text drafts may be saved, but cannot dispatch. `saveVoiceDraft(input, recording, metadata)` persists the draft first and then its source recording using durable audio storage. Failed file saves leave a readable draft and propagate the error; no remote call occurs. An existing recording is not silently replaced. Re-recording/replacement controls remain later work.

Only an explicit `processSaved(id, processor)` invokes processing. It checks voice-file availability, claims the saved row with an incremented attempt, then calls the injected endpoint-specific processor. Successful results update that same row. Remote failures preserve input/audio and save a retryable failed state; database-save failures propagate and do not claim success. A pending or ready row cannot dispatch again. A failed/interrupted row can dispatch only through another explicit call. Duplicate calls are blocked by the app-owned flow and the transactional row claim. Retry may incur another provider operation; local deduplication is not server idempotency.

The processor receives an AbortSignal and durable input for mapping into an allowlisted text/voice transport payload. Never submit local IDs or serialize the entire message row. Use the attempt counter with finalization: results from older attempts are ignored even if the request ID is the same. The legacy repository `queueMessage`/`retryMessage` methods remain for compatibility; new controllers should use this flow and should not bypass its guards. `cancel(id)` requests abort; until the processor settles that row remains locally busy. An aborted completion is rejected and retained as a retryable failure. Capture lifecycle/AppState integration and generated-audio result persistence remain later milestones.

Screens and real endpoint/capture controllers are not wired yet. Verification uses injected processors with real desktop SQLite/files: edited draft restart, voice persistence before dispatch, disk-full no-dispatch, explicit network retry, cold-start recovery without dispatch, duplicate-call prevention and stale-attempt rejection. Native acceptance remains outstanding.

## Storage reconciliation

Step 4 item 5, implemented October 14, 2026. Audio saves hold the dedicated SQLite write lock while writing/checking bytes and inserting metadata/ownership. Reconciliation takes the same lock, preventing cleanup from deleting an in-progress save. No remote request runs while this lock is held. Long files/large libraries can delay other local writes; native performance remains a device check.

Call `audio.reconcile()` after successfully opening/migrating storage and before enabling recording/playback on cold startup, or during an idle maintenance action. It returns removed-file/asset counts, missing-asset count, and individual cleanup failures. Display failures and allow explicit maintenance retry. A database or directory-list error rejects the call rather than interpreting unreadable storage as empty. Do not run cleanup if database migration/open failed.

Referenced assets are retained whenever a message or Phrasebook link needs them. Missing or size-mismatched files are marked unavailable and readable history remains. Unreferenced assets are removed only after file removal succeeds; failed removal leaves metadata for retry. Managed files without asset rows are removed as crash/partial-write orphans. Only validated audio basenames in the dedicated app audio directory are touched: unrelated files and directories are ignored. No source cache recordings, history messages, phrases or preferences are removed by maintenance.

`AudioStorageError` reports `storage_full` for recognized ENOSPC/SQLite-full/no-space errors, otherwise `audio_save_failed`, and keeps the original cause. No error claims the audio save succeeded. Native partial-write cleanup is attempted immediately; a failure there can leave an orphan for reconciliation. After a database failure, save checks whether the asset committed before removing its new file. If that check fails, it conservatively retains the file for later maintenance. A generated ID collision does not overwrite or delete existing audio.

SQLite/file deletion is not atomic. A crash during cleanup can leave an unreferenced row whose file is already gone; another reconciliation removes it. Migration failures roll back schema/version changes, close initialization and never reset/delete history. Physical filesystem loss and corruption cannot be repaired by this mechanism. Codec validation, UI startup/maintenance integration and native device acceptance remain outstanding; confirmation-gated deletion and SQLite compaction are implemented below.

Verification adds partial disk-full writes, orphan cleanup, missing/size mismatch, shared Phrasebook retention, duplicate-ID preservation, deletion failure/retry, directory-list failure and migration rollback with existing history. Repeat `node --import tsx scripts/verify-mobile-history.mjs`. On real devices later, force-close during writes, reopen, inspect the cleanup report and confirm retained text/audio stays intact; exercise actual low-storage failures before release.

## Permanent deletion

Step 4 item 6, implemented October 14, 2026. Compose `createDeletionService(database, audio, confirmNativeDeletion)` using `adapters/deletionConfirmation.ts`. Its native alert offers Cancel and destructive Delete; dismissing cancels. The injected confirmer makes the service testable without loading native UI. No archive/restore or soft-delete records are introduced.

`delete({ kind: 'conversation' | 'phrase', id })` first reads the target, shows its label and permanent-removal consequences, and deletes only after affirmative confirmation. Missing targets return `missing`; cancellation changes no records/files; a changed timestamp returns `changed` and requires a new review. Only fixed source-controlled table names are interpolated and IDs/timestamps are bound parameters. A transaction failure throws before cleanup and leaves rows/files intact.

Conversation deletion cascades messages/audio links and clears Phrasebook source links while preserving copied text/pronunciation and independent audio links. Phrase deletion removes only that entry and its audio links; it does not remove the originating message. Cleanup then removes audio only when neither messages nor phrases retain it. Late processing finalization cannot recreate a deleted row. Reuse neither deleted message IDs nor request IDs.

The result distinguishes committed deletion from maintenance: `status: 'deleted'`, a cleanup report, `compacted` and `maintenanceErrors`. Read both cleanup failures and maintenance errors before claiming all storage was freed. File-delete failures retain unreferenced metadata for another cleanup; no references to a deleted owner survive. A failed compaction does not restore the deleted record. `retryMaintenance()` retries cleanup/compaction without another record deletion or confirmation.

After cleanup, `VACUUM` runs outside the deletion transaction to shrink the SQLite file. It can need substantial temporary disk space and can fail under concurrent writes or low storage. In that case freed database pages remain reusable and retry is explicit. It is a storage-reclamation operation, not a secure-erasure/backup guarantee. See [SQLite VACUUM](https://www.sqlite.org/lang_vacuum.html).

The app-owned Chat session now owns one deletion service and wires it to History's confirmed Delete actions. The controller blocks overlapping send/retry, selection, navigation, deletion and maintenance and reports cleanup failures separately from committed deletion. Phrasebook controls and recording/playback lifecycle wiring remain Steps 6/7; future integrations must stop active capture/playback before deleting their records.

Step 5 also adds cursor-paged conversation search/message reads and transactional active-chat/language preferences to the repository. No schema version change is required. See [Chat/history behavior and verification](../../docs/chat-history.md).

Desktop verification covers confirmation cancellation, changed-target review, failed-delete rollback, cascades, preserved Phrasebook text/shared audio, rejected late finalization, missing targets, real database-file shrinkage, failed audio deletion/compaction and maintenance retry. Actual native confirmation and low-storage/device acceptance remain unverified. Run the history verification command above.
