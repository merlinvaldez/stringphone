import type { NativeRealtimeHandlers, RealtimeEvent } from './nativeRealtime';

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
  stopMicrophone() {}
  close() {}
}

export type { NativeRealtimeHandlers, RealtimeEvent };
