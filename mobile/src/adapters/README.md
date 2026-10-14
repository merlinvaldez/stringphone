# Native platform adapters

Step 3, item 2 of the [migration checklist](../../../specs/expo-mobile-migration.md), implemented October 14, 2026. These adapters give future feature controllers separate native entry points. They are not automatically initialized or called by the placeholder screens.

| Entry point | Responsibility | Later implementation |
| --- | --- | --- |
| `storage.ts` | Explicitly open local SQLite, enable foreign keys, close on initialization failure; caller owns connection lifetime | Step 4 migrations, transactions and repositories |
| `files.ts` | Document-directory audio handle and Expo File class; no cache-only storage | Step 4 durable writes, metadata and DB/file coordination |
| `audio.ts` | Native recording/player hooks, permission request and foreground audio-session configuration | Step 6 capture/playback controllers, interruption cleanup, duration cap and routing |
| `navigation.ts` | Typed navigation to the four existing Expo Router screens | Feature-specific navigation and later room invite handling |
| `api.ts` | Lazy absolute environment URL resolution plus processing transport | Step 5 text response mapping and UI integration |
| `processingTransport.ts` | JSON POST allowlists for text/speech, abort signal forwarding, status-aware errors and raw successful responses | Step 6 multipart URI upload and durable WAV/base64 decoding; later live/room transports |

Use direct imports from the relevant adapter; do not add an eager barrel that loads all native modules when only an API request is needed. Shared code stays in the root `shared/` directory and contains no platform APIs.

The JSON transport filters fields at runtime, so passing a larger local row cannot send local IDs, `conversationId` or `userId`. It exposes no web conversation/collection persistence endpoint. It does not catch network/abort errors or retry automatically: controllers must retain the local request target and decide when to retry. Successful responses remain unconsumed for JSON or binary callers. Provider credentials stay on the backend.

Hooks release native recorder/player objects on unmount through Expo ownership. Foreground session configuration is not a complete interruption controller. Calling permissions is explicit, never an import side effect. SQLite opening does not create message tables. Obtaining the audio directory handle does not create or write files. Screens still have no sending, recording or saved-history flow.

References reviewed: [SDK 57 SQLite](https://docs.expo.dev/versions/v57.0.0/sdk/sqlite/), [SDK 57 Audio](https://docs.expo.dev/versions/v57.0.0/sdk/audio/), [Expo Router navigation](https://docs.expo.dev/router/basics/navigation/). FileSystem types were also checked against installed SDK 57 package declarations; its versioned documentation was unavailable to the browser tool.

From the repository root:

```powershell
node --import tsx scripts/verify-mobile-adapters.mjs
npm.cmd --prefix mobile run typecheck
npm.cmd --prefix mobile run lint
```

Checks passed October 14, 2026: transport allowlists, request signal forwarding, binary response preservation, JSON/HTML error handling, network failures, rejected endpoints/field types, native source boundary scan, typecheck and lint. Transport checks use injected fetch responses and make no cloud AI calls. Native connection/file operations, actual microphone permissions/session behavior and navigation calls remain device checks when their consumers are connected.
