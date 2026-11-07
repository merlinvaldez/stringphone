import {
  getRecordingPermissionsAsync,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  type PermissionResponse,
} from 'expo-audio';

// Hook ownership gives Expo responsibility for releasing native objects on unmount.
export {
  useAudioPlayer as useNativeAudioPlayer,
  useAudioPlayerStatus as useNativeAudioPlayerStatus,
  useAudioRecorder as useNativeAudioRecorder,
  useAudioRecorderState as useNativeAudioRecorderState,
  RecordingPresets,
} from 'expo-audio';

let cachedPermission: PermissionResponse | null = null;

// Eagerly query existing permission on startup so tapping the microphone starts without native delay.
void getRecordingPermissionsAsync()
  .then(res => {
    if (res?.granted) {
      cachedPermission = res;
    }
  })
  .catch(() => undefined);

export async function requestNativeMicrophoneAccess(): Promise<PermissionResponse> {
  if (cachedPermission?.granted) {
    return cachedPermission;
  }
  const result = await requestRecordingPermissionsAsync();
  if (result.granted) {
    cachedPermission = result;
  }
  return result;
}

let activeAudioSessionRecording: boolean | null = null;

export async function configureNativeAudioSession(recording: boolean) {
  if (activeAudioSessionRecording === recording) return;
  await setAudioModeAsync({
    allowsRecording: recording,
    playsInSilentMode: true,
    shouldPlayInBackground: false,
    allowsBackgroundRecording: false,
    interruptionMode: 'doNotMix',
    shouldRouteThroughEarpiece: false,
  });
  activeAudioSessionRecording = recording;
}

export { AudioPlaybackCoordinator } from './playbackCoordinator';
