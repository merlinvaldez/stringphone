# Native live translation (Step 8)

The native Chat, Single, and Conversation screens have a **Live conversation** control. It uses `react-native-webrtc` for the realtime audio stream and `expo-audio` for a second, durable M4A source recording. A short-lived credential comes from `POST /chat/live-transcription/token`; the app sends no permanent OpenAI key. OpenAI transcription events update a temporary transcript in the screen. After a short pause or Stop, a debounced request previews the translated text and a final request supplies pronunciation and the finished translation.

The selected `My language` to `Their language` direction is fixed for the session. Each utterance uses a stable ID and increasing revision. Late partial responses are ignored, and duplicate transcript completion events cannot create another row. The source recording is copied to managed phone storage and attached to a local SQLite voice draft before final processing. Finalization updates that same row to Ready. If processing fails or the connection closes, the recording stays on the phone as a voice draft that can be retried through the recorded-voice flow. Partial text is temporary and is discarded when the screen unmounts.

Live capture stops on Stop, after 30 seconds, when the screen loses focus, or when the app becomes inactive. The microphone stream, data channel, peer connection, Expo recorder and foreground audio session are released. Unfinished captured audio is saved as a draft when the app can still finish the local file write. Live streaming requires a custom native build; it does not work in Expo Go.

The current native strategy streams transcription and translates each turn through the existing server processing route. If native WebRTC setup or streaming fails, recorded voice remains available. The app shows an error or saved voice draft and does not present that turn as a live translation. The separate recorded flow uploads the source file for transcription/translation when the user retries.

## Android device check

Package a standalone APK locally with Android Gradle and install it directly with ADB. Do not create an EAS build, launch Expo Go, or start Metro for this check. Set `APP_VARIANT=development`, `EXPO_PUBLIC_APP_ENV=preview`, and the preview API URL before generating the Android project and bundling JavaScript. Run `assembleRelease` from `mobile/android`; the release APK is `mobile/android/app/build/outputs/apk/release/app-release.apk`. Install it in place with `adb install -r <apk-path>` so the debug app's existing local history is preserved. The development variant uses package `ai.stringphone.mobile.debug`; leave production package `ai.stringphone.mobile` untouched.

On the installed app:

1. Start a live turn and allow microphone access. Speak one short phrase in My language and wait for the pause-based commit. Confirm the partial transcript appears while speaking, the translated preview follows, and one Ready row appears in local history with source playback.
2. Speak again and tap Stop before the 30-second cap. Confirm one final row and no duplicate after a short wait.
3. Change tabs or background the app during another turn. Confirm capture stops, usable source audio remains a retryable voice draft, and returning does not resume the microphone.
4. Disable network before starting live capture. Confirm the live control reports the failure and remains distinguishable from recorded voice. Use the recorded voice flow only after reconnecting.

Record Android model, OS/API level, APK version/build ID, whether the partial transcript and translation appeared, final row count/status, and source playback state. A successful build, typecheck, or APK launch does not establish live microphone/provider acceptance. Physical iPhone acceptance is still required separately.

### Android result, October 21, 2026

Built [the local standalone APK](../output/StringPhone-1.0.6-step8-local.apk) with Android Gradle (version 1.0.6, code 7, ARM64) and installed it in place with `adb install -r` on a Pixel 10a running Android 17/API 37. The local debug signing certificate matched the installed debug app, and the production package/version remained installed separately. No EAS APK, Expo Go, or Metro session was used.

The user spoke English into the live session. Transcript deltas appeared while the mic session was active, followed by a Spanish preview and one Saved history row for the first turn. Source recording playback entered its active Stop state. After force-stop/relaunch, the saved turn and recording were still available. A longer capture ended at the configured 30-second limit and its spoken utterance(s) finalized; a brief later capture returned to idle before the limit without speech. Offline retry, background/navigation interruption with a saved draft, manual Stop during a spoken turn, and iPhone acceptance were not verified in this run.
