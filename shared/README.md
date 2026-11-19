# Shared StringPhone logic

Step 3, item 1 of the Expo migration, implemented October 14, 2026.

These TypeScript modules contain only platform-independent data, types and functions. They import only other files in this directory. Do not add DOM, browser storage, native audio/storage, Node, database or AI-provider dependencies here.

- `languages.ts`: canonical 43-language catalog, aliases, writing systems and pronunciation-guide rules. Existing server imports use the compatibility re-export in `src/lib/languages.ts`.
- `languageOptions.ts`: picker order and flag fallbacks retained from the website; English names come from the canonical catalog. Native display names and flag rendering remain platform concerns.
- `formatting.ts`: timestamp, duration and pronunciation formatting extracted from `client/src/utils.js`, which now re-exports these helpers. Timestamp rendering uses the runtime locale/timezone.
- `messages.ts`: language payload, translation result, processing failure and text input types. These are processing contracts, not SQLite records; local IDs and durable audio metadata belong to later storage work. Voice buffers remain server-only.
- `validation.ts`: text normalization and language validation used by the server text handler. Existing validation order and error responses are preserved. The speech endpoint's 500-character limit is not a text-chat limit.

Web imports shared TypeScript through Vite. Server imports use `.js` specifiers through the existing TypeScript runtime. Mobile consumers use `mobile/src/shared.ts`; no server processing service is exported there. Adapters and native UI integration are later checklist items.

From the repository root, run:

```powershell
node --import tsx scripts/verify-shared-mobile-logic.mjs
node --import tsx scripts/verify-mobile-api-contract.mjs
npm.cmd run build
npm.cmd --prefix mobile run typecheck
npm.cmd --prefix mobile run lint
```

The shared check covers all catalog aliases, picker coverage/order, writing-system differences, invalid input/error precedence, formatting edge cases and imports that cross the platform boundary. Device integration remains unverified until native consumers are implemented.
