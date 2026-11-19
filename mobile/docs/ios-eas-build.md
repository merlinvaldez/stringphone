# iPhone cloud builds with Expo (EAS)

StringPhone's native Expo/React Native project lives in `mobile/` on branch `feat/expo-mobile-sqlite`. Run **all EAS commands from `mobile/`**, not from the repository root. The `client/` Vite app and Vercel deployments are a separate website/backend, not an iOS app. The iOS bundle identifier is `ai.stringphone.mobile`; development builds use `ai.stringphone.mobile.debug` so they can coexist with previews.

## What is configured in source

- `mobile/eas.json` defines `development` (custom native development client / internal installation), `ios-simulator` (simulator only), `preview` (standalone iPhone internal distribution), and `production` (App Store/TestFlight) profiles.
- Each profile explicitly selects its matching Expo Services environment. The build profile injects the corresponding `EXPO_PUBLIC_APP_ENV`; the matching `EXPO_PUBLIC_API_URL_*` must be set on Expo Services separately.
- EAS manages native build-number increments remotely for preview and production. `mobile/app.json` retains the existing iOS bundle identifier and build number as the initial baseline.
- An Expo build pre-install hook checks the selected public API configuration and fails the build if it is absent or malformed. No API keys are bundled.
- Native WebRTC is required, so **Expo Go is not a complete test environment**. Development builds need Metro while preview builds run standalone.

## One-time account and project linking (interactive)

You need an **Expo account** and an **active Apple Developer Program membership** to sign/install on a real iPhone. Apple signing credentials and device registration require interactive user authorization. Neither account nor credentials can be created by committing GitHub files.

From a checkout of the feature branch:

```powershell
git switch feat/expo-mobile-sqlite
Set-Location mobile
npm.cmd ci
npm.cmd install --global eas-cli
eas login
eas whoami
eas init
```

**Important:** Run `eas init` and let Expo link or create the project. It writes the real `expo.extra.eas.projectId` into Expo configuration. Do not invent a project ID or commit an example UUID. Keep the checked-in `eas.json` profiles when initializing; if using `eas build:configure`, review its proposed changes before accepting so it does not overwrite these profiles. Commit the linked project ID to the feature branch once verified.

## Set reachable API endpoints in Expo Services

Local `mobile/.env.local` is intentionally ignored and **is not automatically uploaded to the EAS cloud**. Cloud builds must receive the corresponding public URL through Expo Services. From `mobile/`, set:

```powershell
eas env:set --name EXPO_PUBLIC_API_URL_DEVELOPMENT --value https://YOUR-REACHABLE-API-HOST/api --environment development --visibility plaintext
eas env:set --name EXPO_PUBLIC_API_URL_PREVIEW --value https://YOUR-REACHABLE-API-HOST/api --environment preview --visibility plaintext
eas env:set --name EXPO_PUBLIC_API_URL_PRODUCTION --value https://YOUR-REACHABLE-PRODUCTION-API-HOST/api --environment production --visibility plaintext
eas env:list --environment preview
```

Replace example hosts with working HTTPS endpoints. Vercel endpoints include `/api` in their base URLs; local Express development endpoints do not. **Do not assume a Vercel preview address works for native guests:** current StringPhone Vercel project settings report SSO deployment protection. Verify guest API access on a real phone before building. Never embed an OpenAI key, Clerk secret, database credential, or Vercel automation bypass token in `EXPO_PUBLIC_` values or source files. The mobile app must talk to a backend that holds the secrets.

The build profiles already supply `EXPO_PUBLIC_APP_ENV` to select the right URL. You only need to add the relevant `EXPO_PUBLIC_API_URL_*` values in Expo Services. Local Windows testing can continue to use `mobile/.env.local` as documented in `mobile/README.md`.

## First iPhone preview — install without a Mac

Register every physical test iPhone on your Apple developer team before creating its ad hoc provisioning profile:

```powershell
eas device:create
eas build --platform ios --profile preview
```

Follow the interactive Apple sign-in/certificate prompts. EAS compiles and signs the `.ipa` in the cloud. When the build reaches READY, open the install link or QR code on a **registered iPhone**. This is a standalone preview; Metro is **not** needed while using it. Registering a new iPhone after a build may require refreshing the provisioning profile and rebuilding.

For a live-reload development client instead:

```powershell
eas build --platform ios --profile development
npx expo start --dev-client --tunnel
```

Install the development build on the registered phone and connect it to the Metro server using the displayed link/QR. The development client contains the native WebRTC module; Expo Go does not. On iOS 16+, turn on **Settings > Privacy & Security > Developer Mode** when prompted. The development bundle identifier is different from the preview bundle identifier.

Optional macOS simulator build (cannot be installed on a physical iPhone):

```powershell
eas build --platform ios --profile ios-simulator
```

## TestFlight / App Store (later)

Only after real-device acceptance and Apple App Store Connect setup:

```powershell
eas build --platform ios --profile production
eas submit --platform ios --profile production
```

Production signing, App Store Connect registration, and any applicable encryption/privacy declarations require owner review. A successful EAS compilation is not evidence that StringPhone's microphone, translations, local SQLite persistence, audio playback, and streamed WebRTC work correctly on iOS.

## Verification gates

Before considering the rollout ready:

1. `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd run test:api-config`, and `npm.cmd run check:api-config` pass in `mobile/` with the intended local environment.
2. `eas init` links to a real Expo project and the three remote API environment variables are set and accessible in their matching environments.
3. Real iPhone is registered and Apple credentials complete; a preview `.ipa` finishes successfully and installs.
4. Test Chat text translation/retry, Single and Conversation recording, microphone permission denial, live WebRTC transcript/translation finalization, audio playback, Phrasebook and SQLite persistence across app restarts, airplane mode and app inactivity.
5. Verify the deployed API is accessible by **unauthenticated native guests** as intended, without leaking server credentials.
6. Save actual build links/IDs and device results in the issue or pull request. No iOS build/acceptance has been verified by this configuration-only change.

References:
- https://docs.expo.dev/build/eas-json/
- https://docs.expo.dev/build-reference/build-with-monorepos/
- https://docs.expo.dev/eas/environment-variables/
- https://docs.expo.dev/build/internal-distribution/
- https://docs.expo.dev/tutorial/eas/ios-development-build-for-devices/
- https://docs.expo.dev/build-reference/app-versions/
