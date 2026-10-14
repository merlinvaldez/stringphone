# Mobile/server code boundary

Step 3, item 3 of the [migration checklist](../../specs/expo-mobile-migration.md), implemented October 14, 2026.

The Express/Vercel processing functions (`src/lib/runTextChatMessage.ts`, `runVoiceChatMessage.ts`, `runOutputTextToSpeech.ts`), AI services and PostgreSQL code remain server-side. Native features call the backend through `src/adapters/api.ts`. Reusable language data, validation, formatting and processing types live in root `shared/`, not in a server barrel.

Two checks enforce this boundary:

- `npm.cmd run check:server-boundary` parses every mobile/shared source file with the installed TypeScript compiler. It checks imports, re-exports, type imports, literal require/dynamic imports and mobile runtime dependencies. Shared imports must stay inside `shared/`; mobile package imports must be declared runtime dependencies. Node builtins, listed server/provider packages, computed module imports, and local paths outside app source/assets or shared logic fail. Type imports are conservatively restricted too; move reusable types into `shared/`.
- `metro.config.js` wraps Expo's default resolver. It checks module names and final resolved source/asset paths for every bundle dependency, including transitive imports and aliases. Root server/web source and mobile build scripts cannot enter the bundle. Known database/provider packages are blocked even when reached inside `node_modules`. The resolver preserves Expo defaults and applies to both native and web exports. Three exact SDK 57 virtual-module names (asset registry, environment variables and external require) are allowed; arbitrary virtual paths still fail.

The guard's Node APIs are build tooling under `mobile/scripts/`; they are not imported by app code and the guard blocks bundling those scripts. There is no additional runtime dependency. `npm.cmd run lint` runs the source boundary check before Expo lint. It also runs negative fixtures proving rejection of server processing/services, Node modules, provider/database packages, computed imports and a resolver alias pointing at a server function.

SDK dependency internals remain eligible under `node_modules` unless they match the explicit server/provider denylist. This is an architectural import check, not a general secret scanner or audit of every third-party library. Review new dependencies and keep permanent credentials in server environment settings.

From the repository root:

```powershell
npm.cmd --prefix mobile run check:server-boundary
npm.cmd --prefix mobile run typecheck
npm.cmd --prefix mobile run lint
```

To verify bundle resolution from `mobile/`:

```powershell
npx.cmd expo export --platform ios --platform android --output-dir "$env:TEMP/stringphone-boundary-export"
```

Reference: [Expo custom Metro resolvers](https://docs.expo.dev/guides/customizing-metro/#aliases). Native exports verify JavaScript bundling, not signed native compilation, microphone operation or real-device acceptance.

Validation recorded October 14, 2026: 19 mobile/shared source files and negative fixtures passed; mobile typecheck/lint, shared/adapter regression checks and diff check passed. Metro exported both iOS (1,061 modules) and Android (1,232 modules) successfully with the guard active.
