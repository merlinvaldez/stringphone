type PlaybackToken = {
  id: string;
  stop: () => void;
};

let activePlayback: PlaybackToken | null = null;
let recordingActive = false;

export const AudioPlaybackCoordinator = {
  isRecording(): boolean {
    return recordingActive;
  },
  setRecording(active: boolean): void {
    recordingActive = active;
    if (active && activePlayback) {
      activePlayback.stop();
      activePlayback = null;
    }
  },
  startPlayback(id: string, stopCallback: () => void): boolean {
    if (recordingActive) {
      return false;
    }
    if (activePlayback) {
      activePlayback.stop();
    }
    activePlayback = { id, stop: stopCallback };
    return true;
  },
  stopPlayback(id?: string): void {
    if (!id || (activePlayback && activePlayback.id === id)) {
      activePlayback?.stop();
      activePlayback = null;
    }
  },
  getActivePlaybackId(): string | null {
    return activePlayback?.id ?? null;
  },
};
