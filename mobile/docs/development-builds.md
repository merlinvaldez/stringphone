# App identity and development builds

Updated October 20, 2026. The Windows local Android debug APK compiles successfully. Pixel installation and Metro acceptance still require the phone to reconnect over USB. Configuration checks do not build or publish EAS production artifacts.

## Identity and assets

App name: StringPhone. Expo slug: `stringphone-mobile`. The default iOS bundle identifier and Android package are `ai.stringphone.mobile`; the default URL scheme is `stringphone`. Android local/EAS development builds use `APP_VARIANT=development`, app name `StringPhone Debug`, slug `stringphone-mobile-debug`, package `ai.stringphone.mobile.debug`, and scheme `stringphone-debug`. The debug slug also gives Expo's development-client launch URL its own scheme, so Android opens the debug app directly when both variants are installed. The iOS bundle identifier remains unchanged by this Android-focused variant.

The icon uses StringPhone's black-and-white two-cup logo, replacing the Expo starter icon. Android uses the same padded square asset as its adaptive foreground over white; actual launcher-mask rendering remains a device check. No custom monochrome themed icon is claimed.

`expo-audio` supplies the iOS description: “Allow StringPhone to record your voice for transcription and translation.” Android declares `RECORD_AUDIO`. Background recording and playback are disabled in the plugin. The voice phase must still request permission only when needed and stop capture on inactivity; this configuration does not implement recording lifecycle behavior.

## Repeatable build configuration

`eas.json` pins EAS CLI 24.13.0, Node 22.23.1 and the named SDK 57 Android/iOS worker images, rather than `latest`. `package-lock.json` fixes installed dependency versions. Named cloud images may receive minor maintenance updates; this setup is repeatable configuration, not a promise of byte-identical signed binaries. Record the git commit, resolved config, worker image, build ID and credentials used with each build.

The `development` profile includes the development client and uses internal distribution. Android outputs an installable APK and uses the debug app variant. `development-simulator` extends it for the iOS simulator. The profile explicitly selects development API configuration pointing to the existing Vercel preview. `EXPO_NO_DOTENV=1` prevents a local `.env.local` from overriding cloud-build settings. `preview` remains an internal standalone APK. `production` produces an AAB for Google Play; `production-apk` produces a direct-install APK for QA. Both production profiles select the production API URL and the default release app identity.

`.easignore` excludes local env files, credentials, dependencies, generated native folders and build outputs from uploads. Run all EAS commands from `mobile/` so the correct app and `eas.json` are selected. The mobile install/build stays independent of the website postinstall/build.

## Local Android debug testing

Install Android Studio with Android SDK command-line tools and JDK 17. Connect the Pixel by USB and accept the USB debugging authorization prompt. The repository's `mobile/.gitignore` excludes the generated native project.

From the repository root, create and install the development build:

```powershell
npm.cmd --prefix mobile run build:android:debug
```

The command uses `APP_VARIANT=development`, runs `expo run:android --device --no-bundler`, and writes `mobile/android/app/build/outputs/apk/debug/app-debug.apk`. With one authorized device, the launcher passes its model name to Expo; for multiple devices, set `ANDROID_SERIAL` or select a device interactively. It installs `ai.stringphone.mobile.debug`; the existing `ai.stringphone.mobile` installation and its local database remain separate. On Windows, a local-only config plugin puts app CMake outputs under `C:\sp` and caps object paths for Ninja. The build helper creates `C:\sp` if it is missing; the account needs permission to create a directory at the drive root.

After installation, start the matching Metro server:

```powershell
npm.cmd --prefix mobile run dev:client:debug
```

The Pixel and PC must be able to reach Metro on the local network. Rebuild after native dependency, app-config, or config-plugin changes; JavaScript-only changes load through Metro.

## Account and signing prerequisites

- Expo account: required for cloud EAS builds; project `@merlinvaldez/stringphone-mobile` is linked. Project owner/organization access and build quota must be available.
- Android signing: an EAS-managed Android keystore was created for the linked project. Reuse and retain access to the established key for the release app ID. The debug `.debug` variant is a separate install and signing identity is not a Play release guarantee.
- Google Play distribution: requires a Play Console developer account, identity verification, app registration and signing/upload-key setup. Existing app updates must use their established identity and credentials. Store submission is later release work.
- Physical iPhone internal distribution: requires an Apple Developer account/team with signing access, an appropriate certificate and provisioning profile, and registered test-device UDIDs for ad hoc builds. Register devices before building and rebuild when the provisioning list changes.
- iOS simulator: the simulator profile does not require Apple store membership/signing for physical devices, but running the simulator requires macOS. Windows can initiate cloud iOS builds; it cannot run Xcode locally.
- Apple store/TestFlight distribution: requires Apple Developer membership, App Store Connect access, app identity and distribution signing. Do not create/purchase memberships or submit to stores as part of a configuration check.

Credentials must not be committed or included in public app variables. The configured EAS Android key does not by itself register the app in Google Play or publish a release.

## First cloud development build

After reviewing the prerequisites, from `mobile/`:

```powershell
npx.cmd eas-cli@24.13.0 login
npx.cmd eas-cli@24.13.0 init
npm.cmd run build:android:dev
# Or, for a registered physical iPhone:
npm.cmd run build:ios:dev
```

For iPhone device registration, use `npx.cmd eas-cli@24.13.0 device:create` before building. For an iOS simulator build, use `npx.cmd eas-cli@24.13.0 build --platform ios --profile development-simulator`. Account linking writes real project metadata; retain it in app configuration once created. A cloud build uploads source and may consume EAS quota.

Install from the successful EAS build's installation link, then run:

```powershell
npm.cmd run dev:client
```

Open the build on the phone and connect to Metro. Check the launcher icon/name, all four tabs, safe areas and keyboard. Once recording is implemented, verify the actual microphone permission message and denial behavior. The existing Vercel preview protection still needs resolving before native translation requests.

## Local checks

```powershell
npm.cmd run typecheck
npm.cmd run lint
npx.cmd expo-doctor
npx.cmd expo config --type introspect
```

Expect the configured app identifiers, icon path, microphone description and Android recording permission. These checks do not compile a signed app. Real Android/iPhone builds and device acceptance remain release gates.

Sources: [EAS profiles](https://docs.expo.dev/build/eas-json/), [worker images](https://docs.expo.dev/build-reference/infrastructure/), [first build and accounts](https://docs.expo.dev/build/setup/), [internal distribution](https://docs.expo.dev/build/internal-distribution/), [signing credentials](https://docs.expo.dev/app-signing/app-credentials/).

## Preview Android APK

The `preview` profile creates an internally distributed release APK with its JavaScript bundled (`developmentClient: false`). It opens without Expo Go or a running Metro server. It uses the reachable production processing API, `https://stringphone-orcin.vercel.app/api`; the development profile remains unchanged. On October 15, 2026, an empty text POST returned the expected 400 validation response from production while the old preview returned 401 Protected deployment. This verifies reachability, not successful provider processing.

From `mobile/`, sign in and build:

```powershell
npx.cmd eas-cli@24.13.0 login
npm.cmd run build:android:apk
```

On first use, EAS needs a real linked project and Android signing credentials. Keep the keystore recoverable for future updates. Download the APK from the completed build page, transfer it to the phone, and open it to install. This is a testing build, not a store release. It shares `ai.stringphone.mobile` with development builds; do not uninstall an existing installation to bypass a signing conflict without backing up any local data.

Build completed October 15, 2026: Expo project `@merlinvaldez/stringphone-mobile` (`cadb69a8-b3e2-4e2c-b6a2-8b3ce05475a7`), preview Android build `b1edf5b7-ddcc-42e8-99fe-982e3675d731`. EAS-managed signing key created. First attempt failed because npm 10.9.8 required missing optional @emnapi lock entries; repaired the mobile lockfile with the matching npm version and verified clean-install dry run. Corrected build finished successfully. Downloaded `output/StringPhone-1.0.0-preview.apk` (108191541 bytes), SHA-256 `58d0f61d6e556a698148fc479365d5b77d329d13d54f6be7e9d8a20e329f9445`. Typecheck/lint and Android JS export passed. This historical preview build is separate from the production profiles below.

## Production Android artifacts on EAS

Build the Play Store artifact and the sideload QA artifact from the same release source/version:

```powershell
npm.cmd run build:android:production
npm.cmd run build:android:production-apk
```

The `production` profile produces a signed AAB with `distribution: store`. The `production-apk` profile produces an internally distributed signed APK for direct installation. Both use the same production API URL and app package `ai.stringphone.mobile`; neither is submitted or published by these commands. Increase `android.versionCode` beyond the latest Play release before creating a release version.

The sideload APK is for QA and direct installation. If Play App Signing uses a Google-managed app-signing key, Google-signed Play installs may not update an APK signed with the EAS upload key. Use the AAB for Play distribution and treat the APK as a separate QA artifact. ([EAS artifact types](https://docs.expo.dev/eas/json/), [Google Play App Signing](https://support.google.com/googleplay/android-developer/answer/9842756))
