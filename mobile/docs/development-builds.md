# Local mobile builds

## Standard Android install

From the repository root, connect and authorize one Android phone over USB, then run:

```powershell
npm.cmd --prefix mobile run android
```

The command locally synchronizes the ignored Android project with Expo app configuration, bundles the JavaScript into a release APK with Gradle, and installs it over ADB. It does not start Metro, use a development client at runtime, or contact EAS/cloud build services. The phone can launch the installed app with the computer disconnected.

The install uses `APP_VARIANT=development`, app ID `ai.stringphone.mobile.debug`, and `EXPO_PUBLIC_APP_ENV=preview`. Add the public preview URL to `mobile/.env.local`:

```dotenv
EXPO_PUBLIC_API_URL_PREVIEW=https://your-preview-host.example/api
```

The checked-in `mobile/.env.example` has the project preview URL as a starting point. Do not put API keys or other secrets in `EXPO_PUBLIC_` variables. If multiple phones are connected, set `ANDROID_SERIAL` to the target device ID. The resulting ARM64 APK is `mobile/android/app/build/outputs/apk/release/app-release.apk`; the script installs it with `adb install -r` to preserve app-local data.

Install Android Studio command-line tools and JDK 17, and ensure `ANDROID_HOME` or `ANDROID_SDK_ROOT` points to the SDK (or `adb` is on `PATH`). On Windows, native build outputs are staged under `C:\sp` to avoid CMake/Ninja path length failures.

## Optional development server

For interactive JavaScript development only, `npm.cmd --prefix mobile run dev:client:debug` starts Metro for a development client. This is separate from the standard APK install; the installed standalone release APK does not need Metro or Expo Go.

## iOS

The Android APK workflow does not build iOS. Local iOS builds require macOS and Xcode; from `mobile/`, use `npm run ios` with a configured simulator/device.

## Local checks

```powershell
npm.cmd --prefix mobile run typecheck
npm.cmd --prefix mobile run lint
npm.cmd --prefix mobile run check:api-config
npx.cmd expo-doctor --project-dir mobile
```

These checks do not install an app. The Android install script performs the local native build and device install.