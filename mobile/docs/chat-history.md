# Native text Chat and local history

Implemented October 15, 2026 for Step 5's final item. No new dependencies, schema migration, cloud history APIs, usage quotas or backend configuration were added.

Metro now watches the sibling `shared/` source folder so the language catalog can be imported at runtime. Its existing resolver boundary continues to reject server/provider modules and non-shared sibling source.

## Behavior

Chat has searchable My language/Their language sheets using the existing shared language catalog, including Persian. Swap exchanges the pair; equal languages make it a no-op. Changes are saved in SQLite before the controls reflect success. Existing messages keep their own language, speaker and origin snapshots. Retry always uses the saved message's direction even after the active pair changes.

New chat creates a separate local conversation. The first message supplies a short local title; no AI title-generation request is made. The current chat and preferred pair survive app restart. Opening an older chat restores that chat's pair. Unsent composer text stays separate per conversation while the Chat screen remains mounted; it is not yet a durable autosaved draft and clears when the app closes. Sent/failed drafts remain durable through the existing saved-message flow.

History is a native modal with offline full-text search across conversation titles and original/translated message text and pronunciation. Search uses literal quoted FTS input, not query operators. Conversation results load 50 at a time. Chat uses a virtualized chronological message list with newest-50 loading and a Load older messages control; earlier messages are not limited to the old 200-message window. Tied timestamps use stable ID ordering. Search revisions prevent stale page responses from replacing a newer query.

The history row exposes Open and Delete as separate labeled actions. Delete uses the existing native confirmation service and permanently removes the conversation/messages, preserving independently saved Phrasebook text and audio still referenced by retained records. Cancellation leaves data unchanged. Changed records require a fresh review. Sending, retrying, language changes and navigation between conversations are guarded while processing/deletion is active. A committed deletion with file-cleanup or compaction failures says cleanup is pending and offers Retry storage cleanup. Deleting the last conversation leaves an empty state rather than recreating it at restart; New chat remains available.

Saved non-Chat conversations can be reviewed here, but their language controls/composer are read-only until the later mode-specific integrations. This item does not wire Single/Conversation recording or Phrasebook controls.

## Rendering and accessibility

Each original/translation uses its stored language direction. Arabic, Persian and Hebrew align right; pronunciation follows its reader language. The English interface does not globally force RTL. Language choices expose selected state; controls expose button roles, descriptive names, disabled states and confirmation hints. Messages identify the speaker, origin, timestamp and language pair; pending/error/notice states are announced. Controls have at least 48-point height, wrapping labels, and default system-font scaling. Language/history modals handle Android Back, use safe areas and allow portrait/landscape. The composer stays outside the virtualized list and has a Done typing action to dismiss the keyboard.

Implementation follows [React Native FlatList](https://reactnative.dev/docs/flatlist), [Modal](https://reactnative.dev/docs/modal), [accessibility](https://reactnative.dev/docs/accessibility), and [text direction styles](https://reactnative.dev/docs/text-style-props). APIs were checked against the installed Expo SDK 57 / React Native 0.86 setup and [Expo SQLite](https://docs.expo.dev/versions/v57.0.0/sdk/sqlite/).

## Automated verification

From the repository root:

```powershell
node --import tsx scripts/verify-mobile-chat-history.mjs
node --import tsx scripts/verify-mobile-chat-controller.mjs
node --import tsx scripts/verify-mobile-local-history.mjs
node --import tsx scripts/verify-mobile-history.mjs
npm.cmd --prefix mobile run typecheck
npm.cmd --prefix mobile run lint
```

The new suite uses an on-disk SQLite database with actual repository/controller/deletion code. It covers language snapshots, original-direction retry, busy guards, preference failure, disk reopen without cloud calls, Persian/text search, stale-search suppression, tied-timestamp pages beyond 200 rows, deletion cancellation, preserved Phrasebook/shared audio, cleanup failure/retry and deleting the last chat across restart. AI and file operations are fixtures. Existing storage/controller/integration checks remain passing.

A React Native Web component fixture rendered the Chat controls and message list in Chrome. Responsive visual interaction checks could not be completed because browser automation timed out; this is not native UI acceptance. Native exports/typecheck/lint cannot establish phone keyboard, alert or screen-reader behavior.

## Phone verification

1. Start the mobile app with a reachable backend. In Chat select **My language → English** and **Their language → Persian**; use search in each picker. Send a message and check original, translation, pronunciation, timestamp, direction and Saved status.
2. Tap **Swap** and send another message. The first message must keep its English-to-Persian direction. Choose the same language on both sides and confirm Swap is disabled.
3. While a translation is pending, verify repeated send/retry, language changes, history navigation and New chat are disabled. Fail a request offline, change the current pair, then reconnect and Retry: the saved message must use its original pair and row ID.
4. Tap **New chat**. Send a different message, then open **History**, search for a word from the first chat, and reopen it. Its messages and language pair must return. Composer typing in one chat must not appear in another.
5. Restart the app and confirm the active chat, saved messages and pair return without a history network request. In airplane mode search/reopen history; saved text must stay readable. Use older/more controls with a large fixture library.
6. On disposable test chats, tap **Delete**, then **Cancel**: the chat remains. Confirm Delete: the chat disappears permanently. When independently saved Phrasebook fixtures exist, their copied text/audio must remain. Delete the last test chat, restart, and confirm the empty state; New chat must work.
7. Test iPhone and Android in both orientations, with the keyboard open and increased system text size. Scroll language and history lists, reach Send/Done typing/Close, and check Arabic/Persian/Hebrew text direction. With VoiceOver/TalkBack verify selected languages, speaker/language labels, errors, disabled controls, modal focus and deletion confirmation.

Record actual device/OS/build results before checking off native acceptance criteria. Provider/device transport, native file cleanup and storage-pressure acceptance remain unverified here.
