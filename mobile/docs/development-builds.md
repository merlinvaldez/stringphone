# App identity and development builds

Step 2, item 5, configured October 13, 2026. Native compilation, installation, signing and account availability are not verified by configuration checks.

## Identity and assets

App name: StringPhone. Expo slug: `stringphone-mobile`. iOS bundle identifier and Android package: `ai.stringphone.mobile`. URL scheme: `stringphone`. Initial version: `1.0.0`, iOS build number `1`, Android version code `1`. These are configured identifiers, not claims of store registration or namespace availability. Confirm the final identity before registering it with Apple/Google; published identifiers should remain stable. Development builds currently share the same identifier as the eventual release, so installing one can replace another on a device. Separate development variants remain a future option.

The icon uses StringPhone's black-and-white two-cup logo, replacing the Expo starter icon. Android uses the same padded square asset as its adaptive foreground over white; actual launcher-mask rendering remains a device check. No custom monochrome themed icon is claimed.

`expo-audio` supplies the iOS description: “Allow StringPhone to record your voice for transcription and translation.” Android declares `RECORD_AUDIO`. Background recording and playback are disabled in the plugin. The voice phase must still request permission only when needed and stop capture on inactivity; this configuration does not implement recording lifecycle behavior.

## Repeatable build configuration

`eas.json` pins EAS CLI 24.13.0, Node 22.23.1 and the named SDK 57 Android/iOS worker images, rather than `latest`. `package-lock.json` fixes installed dependency versions. Named cloud images may receive minor maintenance updates; this setup is repeatable configuration, not a promise of byte-identical signed binaries. Record the git commit, resolved config, worker image, build ID and credentials used with each build.

The `development` profile includes the development client and uses internal distribution. Android outputs an installable APK. `development-simulator` extends it for the iOS simulator. The profile explicitly selects development API configuration pointing to the existing Vercel preview. `EXPO_NO_DOTENV=1` prevents a local `.env.local` from overriding that build's settings. Keep matching Expo-hosted environment values consistent with the profile. Preview/production release profiles and EAS Update policies remain Step 10 work.

`.easignore` excludes local env files, credentials, dependencies, generated native folders and build outputs from uploads. Run all EAS commands from `mobile/` so the correct app and `eas.json` are selected. The mobile install/build stays independent of the website postinstall/build.

## Account and signing prerequisites

- Expo account: required for cloud EAS builds; project owner/organization access and build quota must be available. This checkout has no invented EAS project ID. Link the app through your signed-in account before the first cloud build.
- Android internal development: a signed APK and installation permission are required; Google Play membership is not needed to install directly. EAS can manage a keystore or use one you supply. Review credential-generation prompts and retain ownership/recovery access.
- Google Play distribution: requires a Play Console developer account, identity verification, app registration and signing/upload-key setup. Existing app updates must use their established identity and credentials. Store submission is later release work.
- Physical iPhone internal distribution: requires an Apple Developer account/team with signing access, an appropriate certificate and provisioning profile, and registered test-device UDIDs for ad hoc builds. Register devices before building and rebuild when the provisioning list changes.
- iOS simulator: the simulator profile does not require Apple store membership/signing for physical devices, but running the simulator requires macOS. Windows can initiate cloud iOS builds; it cannot run Xcode locally.
- Apple store/TestFlight distribution: requires Apple Developer membership, App Store Connect access, app identity and distribution signing. Do not create/purchase memberships or submit to stores as part of a configuration check.

No Apple/Google login, signing credentials, project registration or cloud build was performed in this item. Credentials must not be committed or included in public app variables.

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
