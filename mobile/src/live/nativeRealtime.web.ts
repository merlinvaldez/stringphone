import type { NativeRealtimeHandlers, RealtimeEvent } from './nativeRealtime';

export const SECRET_REFRESH_INTERVAL_MS = 40_000;
export function prefetchTranscriptionSecret(_sourceLanguage: string, _targetLanguage: string) {}
export function prefetchBothTranscriptionSecrets(_langA: string, _langB: string) {}

export class NativeLiveConnection {
  liveMode = 'fallback-transcription';
  fallbackReason = '';

  constructor(private readonly _handlers: NativeRealtimeHandlers) {}

  async prepare(_sourceLanguage: string, _targetLanguage: string): Promise<string> {
    throw new Error('Live translation is available in the installed Android or iOS app.');
  }

  async connect(_sdp: string) {
    throw new Error('Live translation is available in the installed Android or iOS app.');
  }

  commitCurrentAudio() { return false; }
  isMicrophoneActive() { return false; }
  isReady() { return false; }
  stopMicrophone() {}
  close() {}
}

export type { NativeRealtimeHandlers, RealtimeEvent };
