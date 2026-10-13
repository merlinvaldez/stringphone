# Web compatibility requirements for Expo migration

Defined October 13, 2026 for the final item in Step 1 of [the migration spec](expo-mobile-migration.md). This records what future mobile work must preserve. No native processing adapter is implemented yet; completing this planning item does not certify future mobile/web regressions.

## Two clients, one processing backend

The browser remains in `client/`, with Clerk accounts and PostgreSQL-backed history/Phrasebook. The future Expo app lives in `mobile/`, with no required account and SQLite/file-based history/Phrasebook. Both may use server-side translation, transcription and speech processing. Local mobile storage does not replace the server database, authentication or room relay.

Keep the current browser navigation, sign-in/bootstrap, saved-history loading, language updates, archiving, Phrasebook saves/search and saved source-audio playback. Keep the existing live optional-persistence behavior for authenticated web callers. Do not disable web persistence globally to satisfy mobile's local-history requirement.

## Existing routes to retain

Paths below are Express paths; Vercel uses the `/api` prefix. `src/server.ts` contains the Express handlers. The indicated `api/` files contain their Vercel counterparts.

| Web responsibility | Methods / paths | Vercel files | Required preservation |
| --- | --- | --- | --- |
| Account resolution/bootstrap | GET `/users/me`, POST `/users/me/bootstrap` | `api/users/me.ts`, `api/users/me/bootstrap.ts` | Clerk session resolves the same app user; bootstrap does not become a mobile prerequisite. |
| Conversation list/create | GET/POST `/chat/conversations` | `api/chat/conversations/index.ts` | Keep authenticated account ownership and response shapes. |
| Language update/archive | PATCH/DELETE `/chat/conversations/:id` | `api/chat/conversations/[id]/index.ts` | Require owned web ID; DELETE remains soft archive. |
| Message load/save | GET/POST `/chat/conversations/:id/messages` | `api/chat/conversations/[id]/messages.ts` | Preserve parent ownership checks, bilingual fields, pronunciation and saved audio. |
| Phrasebook groups/detail | GET `/collections`, GET `/collections/:languageCode` | `api/collections/index.ts`, `api/collections/[languageCode].ts` | Preserve authenticated language grouping, search and stored snapshots. |
| Phrase save/archive | POST/DELETE `/collections/entries` | `api/collections/entries.ts` | Preserve account ownership, duplicate-save handling and archive behavior. |
| Existing lesson service | GET/POST `/lessons`, DELETE `/lessons/:id` | `api/lessons/index.ts`, `api/lessons/[id].ts` | Retain existing route behavior; hidden lesson UI stays hidden. POST currently uses optional authentication, while list/archive require authentication. |
| Translation and speech | Processing routes in [the API audit](expo-mobile-api-contract.md) | `api/chat/messages/*`, `api/chat/live-transcription/token.ts`, `api/speech/output.ts` | Preserve browser request/response compatibility while adding native request adapters. |
| Shared rooms | `/chat/rooms` creation/join/snapshot/events/languages/message/retry paths | `api/chat/rooms.ts`; existing `vercel.json` room rewrite | Keep web host/guest participation and relay/session semantics; mobile coexistence requires Step 9 verification. |

Authentication implementations to retain: `src/auth/express.ts`, `src/auth/vercel.ts`, `src/auth/clerkClient.ts` and the browser `client/src/AuthContext.jsx`. Required web environment includes `DATABASE_URL`, Clerk server/publishable configuration and provider configuration. Do not remove server database imports merely because mobile does not save history there: current server initialization still depends on the existing web environment.

Persistence code to retain: `src/db/client.ts`, `src/db/queries/{users,conversations,languageCollections,lessons}.ts`, corresponding services and existing schema/migrations. Do not drop tables, rewrite owners, purge stored audio or migrate web records into phone storage during this feature. Removing or migrating web storage needs a separate explicit decision.

## Rules for subsequent implementation

1. Scaffold `mobile/` with its own package/scripts. Keep root `postinstall`, `build`, `dev`, `dev:server`, `dev:client` and Vercel `client/dist` output working for the website. Mobile installation/build must not become part of the current root web build.
2. Extract only platform-independent behavior where useful. Native code must not import browser DOM/Blob/audio hooks, Clerk web state, Node database code or permanent provider credentials. Keep web platform adapters intact.
3. Build mobile requests with the field allowlists in [the identity contract](expo-mobile-identity-contract.md). Omit `conversationId` for mobile finalization/segment requests; leave its owned-web-ID path supported for existing authenticated browser requests.
4. Maintain successful processing response shapes, multipart field names and WAV/base64 distinction. A changed helper affects both clients and both handler paths. If new mobile behavior needs an incompatible response, use an explicit opt-in/versioned contract while retaining the current web response.
5. Fix audited validation/error/size gaps deliberately, with Express/Vercel parity checks. Before enforcing a new cap, measure current browser recordings and returned audio; document the cap and update both clients' error handling. Native access must not broaden account ownership permissions.
6. Keep temporary room relay state separate from permanent account history and local SQLite records. Local room saves must not alter the existing web history policy silently. Native room transport and deployed lifetime are still Step 9 work.
7. Keep shared backend fixes narrowly scoped; run relevant browser regressions when authentication, persistence, audio, payload serialization, language direction or room behavior changes.

## Regression acceptance when runtime code changes

These are future runtime gates, not completed tests for this documentation change. Use test conversations/accounts and retain device/build/backend evidence. The processing probe script is validation-only and cannot prove authenticated history or audio acceptance.

| Trigger | Browser check | Expected result |
| --- | --- | --- |
| Auth/bootstrap change | Sign in, reload, sign out; attempt protected history anonymously | Same account resolves; saved account state loads; anonymous access cannot read or write owned history. |
| Conversation/persistence change | Signed-in Chat sends a typed turn; reopen from History after reload; change pair; archive a test conversation | Text, direction/pronunciation and order remain usable; language changes persist; archive hides the item without hard deletion. |
| Ownership change | Use another test account against a conversation/message/collection it does not own | Existing ownership denial remains; knowing an ID does not grant access. |
| Live/finalization change | Signed-in Chat, Single and Conversation capture a turn; reopen saved audio; repeat a guest turn | Web retains optional authenticated save; guest processing remains usable; 30-second cap and speaker ownership remain correct. |
| Phrasebook change | Save outgoing/incoming phrase, save duplicate, add manually, search, reload and archive | Correct language side and snapshot saved under the account; duplicate does not create an extra active phrase; archive still works. |
| Speech/audio change | Play original saved recording and tap translated speech; change marin/onyx preference | Audio plays on request with existing format/voice behavior; no autoplay or broken saved-audio decoding. |
| Rooms change | Web host invites web guest, locks pair after join, sends text/voice, reconnects/leaves | Existing roles, selected direction, ordering and manual playback remain usable; explicit native interoperability checked in Step 9. |
| Build/setup change | Run website production build and existing web dev commands | Website still builds from `client/`; mobile packages/scripts are independent. |
| Mobile persistence adapter | Observe mobile processing without owned-web-ID fields, then inspect web history for the test account | Phone saves locally; no unintended account conversation/message insert; web save path still works. |

No automatic assumption that missing `savedMessage` means all server/provider retention is absent. Processing/logging/temporary-state auditing is explicitly required in Step 5.

## Verification completed for this planning item

- Source inspection confirmed protected account/history/Phrasebook entry points, conversation ownership filters and live optional-persistence branches. No runtime web/backend/auth/database files were changed.
- The current web production build passed October 13, 2026: Vite 7.3.2, 1839 modules transformed. Build emitted an existing stale Browserslist data warning; dependencies were not upgraded.
- The 11-case processing validation script passed against locally invoked Vercel handlers. Previous [API audit](expo-mobile-api-contract.md) records the matching Express HTTP run. This does not establish hosted deployment behavior or signed-in browser acceptance.
- Authenticated browser history, provider audio/live and room regression checks above were not executed for this documentation-only item. They remain required when later runtime changes affect those flows.

## How to verify

From the repository root in PowerShell:

```powershell
npm.cmd run build
node --import tsx scripts/verify-mobile-api-contract.mjs
git diff --check
```

Expected: successful website build, 11 validation PASS lines and no whitespace errors. If Node/npm is absent from this terminal's PATH, the checks used in this session were:

```powershell
Push-Location client
& 'C:/Program Files/nodejs/node.exe' node_modules/vite/bin/vite.js build
Pop-Location
& 'C:/Program Files/nodejs/node.exe' --import tsx scripts/verify-mobile-api-contract.mjs
```

Step 1 is now defined in four supporting documents: screen acceptance, API audit, identity separation and these web compatibility requirements. Step 2 starts the actual Expo scaffold; future device/backend acceptance remains unchecked.
