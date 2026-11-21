export type LiveQueueItem = {
  messageId: string;
  text: string;
  languageCode: string;
  sourceLanguageCode?: string;
  needsPlayback?: boolean;
};

export type LiveQueueState = {
  autoPlayEnabled: boolean;
  activePlayingMessageId: string | null;
  isPlaying: boolean;
  queueLength: number;
};

export function createNativeLivePlaybackQueue({
  prefetchAudio,
  playItem,
  stopPlayback,
  initialAutoPlay = false,
  onStateChange,
}: {
  prefetchAudio: (item: LiveQueueItem) => Promise<string | null>;
  playItem: (item: LiveQueueItem, prefetchedUri: string | null) => Promise<void>;
  stopPlayback?: () => void;
  initialAutoPlay?: boolean;
  onStateChange?: (state: LiveQueueState) => void;
}) {
  let autoPlayEnabled = Boolean(initialAutoPlay);
  const queue: LiveQueueItem[] = [];
  const prefetchPromises = new Map<string, Promise<string | null>>();
  let draining = false;
  let activePlayingMessageId: string | null = null;
  let isPlaying = false;
  let generation = 0;

  const notify = () => {
    onStateChange?.({
      autoPlayEnabled,
      activePlayingMessageId,
      isPlaying,
      queueLength: queue.length,
    });
  };

  const getOrPrefetch = (item: LiveQueueItem) => {
    if (!prefetchPromises.has(item.messageId)) {
      let task: Promise<string | null>;
      try {
        task = Promise.resolve(prefetchAudio(item)).catch(() => null);
      } catch {
        task = Promise.resolve(null);
      }
      prefetchPromises.set(item.messageId, task);
    }
    return prefetchPromises.get(item.messageId)!;
  };

  const pauseAll = () => {
    generation += 1;
    queue.length = 0;
    activePlayingMessageId = null;
    isPlaying = false;
    stopPlayback?.();
    notify();
  };

  const drain = async () => {
    if (draining) return;
    draining = true;
    const runGeneration = generation;

    try {
      while (autoPlayEnabled && queue.length > 0) {
        if (generation !== runGeneration) break;
        const next = queue.shift();
        if (!next) continue;

        activePlayingMessageId = next.messageId;
        isPlaying = true;
        notify();

        const prefetchedUri = await getOrPrefetch(next);
        if (generation !== runGeneration || !autoPlayEnabled) break;

        try {
          await playItem(next, prefetchedUri);
        } catch {
          // Continue FIFO queue cleanly on single-item playback failure.
        }
      }
    } finally {
      draining = false;
      if (generation === runGeneration || queue.length === 0) {
        activePlayingMessageId = null;
        isPlaying = false;
        notify();
      }
    }
  };

  return {
    enqueue(item: LiveQueueItem) {
      const text = (item.text || '').trim();
      if (!item.messageId || !text || !item.languageCode || item.needsPlayback === false) {
        return { queued: false, prefetched: false };
      }

      void getOrPrefetch(item);

      if (!autoPlayEnabled) {
        notify();
        return { queued: false, prefetched: true };
      }

      if (
        activePlayingMessageId !== item.messageId &&
        !queue.some(entry => entry.messageId === item.messageId)
      ) {
        queue.push({ ...item, text });
        notify();
      }

      void drain();
      return { queued: true, prefetched: true };
    },
    pauseAll,
    yieldToManualPlayback: pauseAll,
    setAutoPlayEnabled(nextEnabled: boolean) {
      autoPlayEnabled = Boolean(nextEnabled);
      if (!autoPlayEnabled) {
        pauseAll();
        return;
      }
      notify();
    },
    toggleAutoPlay() {
      this.setAutoPlayEnabled(!autoPlayEnabled);
      return autoPlayEnabled;
    },
    getState: (): LiveQueueState => ({
      autoPlayEnabled,
      activePlayingMessageId,
      isPlaying,
      queueLength: queue.length,
    }),
  };
}
