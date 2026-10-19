import { requestRecordingPermissionsAsync, setAudioModeAsync } from 'expo-audio';

// Hook ownership gives Expo responsibility for releasing native objects on unmount.
export {
  useAudioPlayer as useNativeAudioPlayer,
  useAudioPlayerStatus as useNativeAudioPlayerStatus,
  useAudioRecorder as useNativeAudioRecorder,
  useAudioRecorderState as useNativeAudioRecorderState,
  RecordingPresets,
} from 'expo-audio';

export async function requestNativeMicrophoneAccess() {
  return requestRecordingPermissionsAsync();
}

export async function configureNativeAudioSession(recording: boolean) {
  await setAudioModeAsync({
    allowsRecording: recording,
    playsInSilentMode: true,
    shouldPlayInBackground: false,
    allowsBackgroundRecording: false,
    interruptionMode: 'doNotMix',
    shouldRouteThroughEarpiece: false,
  });
}

export { AudioPlaybackCoordinator } from './playbackCoordinator';
