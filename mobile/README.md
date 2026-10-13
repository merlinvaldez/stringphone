# StringPhone mobile scaffold

Step 2, item 1 of [the migration spec](../specs/expo-mobile-migration.md), implemented October 13, 2026. This TypeScript Expo app has native Chat, Single, Conversation, and Phrasebook tabs, safe-area handling, a scrollable keyboard-aware Chat draft, and accessible headings/input/actions. These screens are placeholders for later steps. The draft is temporary; sending, recording, AI requests, and persistence are not implemented.

## Versions

Created with the official `create-expo-app` blank TypeScript template. Initial SDK-compatible versions: Expo 57.0.28, React 19.2.3, React Native 0.86.3, Expo Router 57.0.26, safe-area-context 5.7.0, screens 4.26.0, TypeScript 6.0.3. `package-lock.json` records exact installed versions. Install future native dependencies with `npx.cmd expo install` from this folder.

References: [SDK 57](https://expo.dev/changelog/sdk-57), [native tabs](https://docs.expo.dev/versions/v57.0.0/sdk/router/native-tabs/), [safe areas](https://docs.expo.dev/develop/user-interface/safe-areas/), [keyboard handling](https://docs.expo.dev/guides/keyboard-handling/).

## Run on Windows

Use Node.js LTS. From the repository root:

```powershell
Set-Location mobile
npm.cmd ci
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run dev
```

The mobile package installs independently; root postinstall/build still target the website. Use Expo Go compatible with SDK 57 and scan the QR code with the phone and PC on the same network. If installed Expo Go does not support this SDK, use a compatible build from [Expo downloads](https://expo.dev/go) or a development build. The development client is now installed; final streaming will require a development build. App identifiers and EAS development profiles are configured; account linking and signing still require setup.

`npm.cmd run android` opens a configured Android emulator/device. `npm.cmd run ios` can open a simulator on macOS; Windows cannot run the iOS simulator. No backend URL is needed for this scaffold.

## Separate mobile and backend development on Windows

Step 2, item 3 keeps the mobile package independent of the root install and website build. Run commands from the folder shown below, or use `--prefix` from the repository root:

| Purpose | Command from repository root |
| --- | --- |
| Install backend and website | `npm.cmd ci` (root postinstall installs the website) |
| Install only mobile | `npm.cmd --prefix mobile ci` |
| Run website and backend | `npm.cmd run dev` |
| Run only backend | `npm.cmd run dev:server` |
| Run mobile development client | `npm.cmd --prefix mobile run dev:client` |
| Run scaffold in compatible Expo Go | `npm.cmd --prefix mobile run dev -- --go` |
| Build website | `npm.cmd run build` |
| Check mobile types / lint | `npm.cmd --prefix mobile run typecheck` / `npm.cmd --prefix mobile run lint` |

There is no root mobile postinstall, and the root website build does not compile a native app. If Node/npm is missing from PowerShell's PATH, run this in each terminal before the commands:

```powershell
$env:Path = 'C:\Program Files\nodejs;' + $env:Path
```

Use two terminals from the repository root: `npm.cmd run dev:server` in one, and `npm.cmd --prefix mobile run dev:client` in the other. Use the Expo Go command instead until a development client is installed. Keep both processes running; stop either with Ctrl+C. Backend startup uses the existing root `.env` setup described in [the repository README](../README.md#environment-variables); permanent server credentials remain there.

### Reach the backend from a phone

Express uses `PORT` or defaults to 3001. It does not specify a localhost-only listening host. Find the PC's active Wi-Fi/Ethernet IPv4 address:

```powershell
ipconfig
```

Use the adapter on the same network as the phone, not a VPN/virtual adapter. For example, if that address is `192.168.1.42`, the development API base is `http://192.168.1.42:3001`. Replace this example with your address and configured port. Phone `localhost` and `127.0.0.1` refer to the phone, not the PC.

With the backend running, test on the PC:

```powershell
Invoke-RestMethod http://localhost:3001/health
Invoke-RestMethod http://192.168.1.42:3001/health
```

Then open `http://192.168.1.42:3001/health` in the phone browser. Expect the health JSON response. A successful PC request alone does not establish phone reachability. If it fails on the phone, check both devices' network, guest-Wi-Fi isolation, VPN, and Windows Firewall access for Node on your trusted private network.

Local Express routes have no `/api` prefix: the future text adapter will append `/chat/messages/text` to this base. Vite's website proxy supplies and removes `/api`; the native app does not use that proxy. Deployed Vercel handlers use an HTTPS base ending in `/api`. Environment-specific app URLs are configured in the next checklist item; this scaffold does not call the backend yet. See [the API contract](../specs/expo-mobile-api-contract.md).

An Expo Metro tunnel only exposes the development bundle server; it does not expose the separate Express API. Browser health success checks network reachability, not native HTTP transport compatibility. iOS/Android HTTP transport restrictions must be checked in a development build; HTTPS is preferred for deployed APIs. Native translation acceptance remains a later milestone.

### Record device testing

Use the manual checks below for both iPhone and Android. Record device model, OS, Expo Go/development-client version, tested revision, scenario and pass/fail. Include the phone-browser health check once backend work begins. Dependency/type checks and a web preview do not replace native microphone, persistence, or streaming checks. Windows supports Android testing; iOS simulator/local compilation requires macOS, while physical iPhone testing requires a compatible installed app.

Expo's [start-developing guide](https://docs.expo.dev/get-started/start-developing/) covers QR connection and network troubleshooting. No phone/LAN connectivity result is claimed by this documentation update.

## API environments

Step 2, item 4 adds `src/config/api.ts`. Future native request adapters should call `getApiUrl('/chat/messages/text')` rather than browser-relative `/api` URLs. It reads only the selected public environment, preserves a deployment's `/api` base suffix, and removes trailing slashes. The current scaffold still makes no translation requests.

From `mobile/`, use Node 22.18+ or Node 24 LTS for the terminal checker:

```powershell
Copy-Item .env.example .env.local
```

The template uses the existing Vercel StringPhone project. Development and preview point to the ready branch preview at `https://stringphone-ag6qla52f-merlin-projects.vercel.app/api`; production points to the verified project domain `https://stringphone-orcin.vercel.app/api`. Vercel deployment metadata was checked October 13, 2026. No deployment was created or promoted for this configuration item. Development uses the deployed preview backend, so a local backend process is optional. Metro still runs on your PC to serve app code.

The preview address pins a specific deployment from `feat/expo-mobile-sqlite`. Change both development/preview values after choosing a newer ready preview. It does not automatically follow future branch deployments. The production domain follows Vercel's production deployment.

The project's current SSO protection is enabled for `all_except_custom_domains`. Native guest API calls to protected deployment domains may receive sign-in responses. These addresses are configured, but native API accessibility is not established. Resolve Vercel protection/access before the translation phase; never include an automation bypass secret in public environment variables or the app. No protection settings were changed here.

| Variable | Purpose |
| --- | --- |
| `EXPO_PUBLIC_APP_ENV` | Explicitly choose `development`, `preview`, or `production` |
| `EXPO_PUBLIC_API_URL_DEVELOPMENT` | Vercel preview API used during development; an explicit LAN override is also supported |
| `EXPO_PUBLIC_API_URL_PREVIEW` | Actual deployed testing backend HTTPS base |
| `EXPO_PUBLIC_API_URL_PRODUCTION` | Actual live backend HTTPS base |

Express normally has no `/api` suffix. Vercel handlers need it, for example `https://your-actual-host/api`. Missing/invalid selected settings fail with an explanatory error when the API configuration is requested; they never silently select another backend. The UI scaffold can still open without configured API settings because it does not request them yet.

```powershell
npm.cmd run test:api-config
npm.cmd run check:api-config
npm.cmd run dev -- --go
```

The first command checks selection and invalid inputs using fixtures. The second prints your selected environment/base without contacting the server. Change `EXPO_PUBLIC_APP_ENV` in `.env.local` to `preview` or `production` and run it again to confirm selection. Missing selected URLs fail explicitly. After changing public variables, fully reload the phone app to use the new bundled values.

For cloud builds/updates, supply these same public variables in the chosen EAS environment; EAS profiles and distribution configuration remain the next/later build items. Do not use `NODE_ENV` to choose the backend: bundling tools use it for their own development/production behavior. For a build job, explicitly set `EXPO_PUBLIC_APP_ENV` and its matching URL. Avoid uploading a local override that selects your PC backend into a release build.

All `EXPO_PUBLIC_` values are visible in the app bundle. Only environment names and API addresses belong here. Permanent AI keys, database credentials, and server secrets stay in server configuration. `.env.local` is ignored by Git. This config module imports no server/database/provider code. See [Expo public environment variables](https://docs.expo.dev/guides/environment-variables/).

## Native dependencies and development client

Step 2, item 2 installed with `npx.cmd expo install expo-audio expo-sqlite expo-file-system expo-dev-client`: Audio 57.0.5, SQLite 57.0.4, FileSystem 57.0.7, development client 57.0.20. These packages prepare later voice and storage work; no recording, database schema, or durable file flow has been implemented yet.

The audio plugin configures microphone permissions and disables background recording/playback. Permission requests must still be implemented at runtime in the voice phase. SQLite uses its default configuration; installing it does not provide encryption. Later recordings must use the app document directory rather than relying on cache.

Audio's required peer dependency `expo-asset` 57.0.19 is also installed directly. Item 2 validation passed dependency compatibility and Expo Doctor (21/21); native config introspection confirmed the iOS microphone description, Android recording permission, and no iOS background audio mode. Native compilation and audio/SQLite/file-system device operations remain unverified.

After a development build is installed:

```powershell
npm.cmd run dev:client
```

This explicitly connects to your installed development client. Installing `expo-dev-client` makes Expo CLI prefer development builds by default, so `npm.cmd run dev` still starts Metro but now normally targets that client. For the current scaffold in compatible Expo Go, run `npm.cmd run dev -- --go`. Expo Go does not establish support for the final custom streaming modules.

For local compilation on Windows, install Android Studio, the Android SDK and a compatible JDK, then use an emulator or connected Android device:

```powershell
npm.cmd run build:android:local
```

For a physical Android device, append `-- --device`. This generates native projects and compiles/installs your development app. On macOS with Xcode, use `npm.cmd run build:ios:local`; local iOS compilation is unavailable on Windows. Native directories remain generated and ignored. App identifiers and cloud EAS development profiles are configured in [the build guide](docs/development-builds.md); account linking, signing, and device distribution remain prerequisites. No cloud build or account/signing operation was performed in this item. Rebuild your development client after adding custom native dependencies or changing native plugin settings.

References: [Audio](https://docs.expo.dev/versions/v57.0.0/sdk/audio/), [SQLite](https://docs.expo.dev/versions/v57.0.0/sdk/sqlite/), [development client](https://docs.expo.dev/versions/v57.0.0/sdk/dev-client/), [development builds](https://docs.expo.dev/develop/development-builds/introduction/).

## Manual device checks still required

- Open all four tabs; each shows its own heading and explanatory placeholder.
- In Chat, type a long multiline draft. Scroll to the input and Done typing while the keyboard is open; tap Done typing to dismiss it. Switch tabs and return to Chat.
- Rotate, increase system text size, and check controls remain reachable without clipping at the notch, status bar, or tab bar.
- With VoiceOver/TalkBack, check tab labels, selected tab, headings, Message draft, and Dismiss keyboard.
- Restart: the temporary draft clears and no saved-message claim appears.

Native bundle exports/typecheck/lint do not establish real-device acceptance. Record device/OS versions when these checks are run.

## Scaffold validation

For configured app identifiers, icon assets, pinned EAS development profiles and Apple/Google prerequisites, see [development builds](docs/development-builds.md). Account linking, signed compilation and real-device testing remain pending; Vercel hosts the API, while EAS compiles the native app.

Passed: TypeScript, Expo lint, Expo dependency compatibility check, Expo Doctor (21/21), and production bundle exports for iOS, Android, and web. The existing root website build also passed. Validation used the installed Node 25 toolchain; use LTS for ongoing development as Expo recommends. npm reported 28 dependency advisories (10 moderate, 18 high) in this SDK-compatible install; dependency remediation remains open and no forced major upgrades were applied.
